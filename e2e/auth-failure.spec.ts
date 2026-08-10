import { expect, test } from '@playwright/test'

/*
 * Every one of these used to end at /login with nothing said, because the
 * callback read `code` and ignored everything else.
 *
 * The alert is looked up inside `main`, never on the page. Next announces every
 * route change into its own `role="alert"` live region, so an unscoped locator
 * matches that instead: it made the third test here pass while the landing
 * still showed nothing, and it would turn the others into strict-mode
 * failures the moment a real alert appeared beside it.
 */
const alertIn = (page: import('@playwright/test').Page) =>
  page.getByRole('main').getByRole('alert')

test('a refused sign-in says so instead of ending at a blank form', async ({
  page,
}) => {
  await page.goto(
    '/auth/callback?error=access_denied&error_description=User+denied',
  )

  await expect(page).toHaveURL('/?error=denied')
  await expect(alertIn(page)).toHaveText('Sign-in was cancelled.')
})

test('an expired confirmation link says it expired', async ({ page }) => {
  await page.goto('/auth/callback?error=invalid_request&error_code=otp_expired')

  await expect(alertIn(page)).toHaveText(
    'That link has expired. Request a new one.',
  )
})

test('arriving at the callback with nothing still reports a failure', async ({
  page,
}) => {
  await page.goto('/auth/callback')

  await expect(page).toHaveURL('/?error=failed')
  await expect(alertIn(page)).toBeVisible()
})

// The parameter is written by whoever sent the link.
test('the landing does not print what the URL asked it to', async ({ page }) => {
  await page.goto('/?error=Your+account+is+suspended,+call+555-0100')

  const alert = alertIn(page)
  await expect(alert).toHaveText(
    'Sign-in could not be completed. Please try again.',
  )
  await expect(alert).not.toContainText('555-0100')
})

/*
 * These used to answer 200 with the loading skeleton — the panel title and
 * nothing else — because in Next 16 a dynamic route streams its status before
 * the server component can decide to redirect. No data leaked: the DAL
 * redirects before it reads anything. What leaked was honesty, and a rendered
 * page nobody was ever going to see.
 */
for (const path of ['/dashboard', '/settings', '/onboarding']) {
  test(`${path} sends a signed-out visitor away instead of answering 200`, async ({
    page,
  }) => {
    await page.context().clearCookies()

    const response = await page.request.get(path, { maxRedirects: 0 })

    expect(response.status(), `${path} status`).toBe(307)
    const location = new URL(
      response.headers()['location'],
      'http://localhost:3000',
    )
    expect(location.pathname, `${path} destination`).toBe('/login')
  })
}

// The username lives in the root segment, so a prefix match without a boundary
// would swallow profiles: `/dashboardguy` is a name somebody could register.
test('a profile whose name starts like a private route is untouched', async ({
  page,
}) => {
  await page.context().clearCookies()

  const response = await page.request.get('/dashboardguy', { maxRedirects: 0 })

  expect(response.status()).toBe(200)
})
