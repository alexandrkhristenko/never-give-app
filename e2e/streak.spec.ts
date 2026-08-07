import { expect, test } from './fixtures'

/** Same widths the layout suite uses, so the two agree on what "narrow" means. */
const VIEWPORTS = [320, 375, 768, 1280]

async function signIn(page: import('@playwright/test').Page, user: { email: string; password: string }) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(user.email)
  await page.getByLabel('Password').fill(user.password)
  await page.getByRole('button', { name: 'Sign In' }).click()
}

test('a new player onboards, checks in, and shows up publicly', async ({
  page,
  user,
}) => {
  await signIn(page, user)

  await expect(page).toHaveURL('/onboarding')

  await page.getByLabel('Choose a Username').fill(user.username)
  await page.getByLabel('Your Main Promise').fill('Ship every day')
  await page.getByRole('button', { name: 'Start Game' }).click()

  await expect(page).toHaveURL('/dashboard')
  await expect(page.getByText('Ship every day')).toBeVisible()
  await expect(page.getByTestId('current-streak')).toHaveText('0')

  await page.getByRole('button', { name: 'CHECK IN TODAY' }).click()

  await expect(page.getByTestId('current-streak')).toHaveText('1')
  await expect(page.getByTestId('best-streak')).toHaveText('1')
  // Not a disabled button: once there is nothing to do the form renders a
  // status element instead, so that a keyboard user is not handed a control
  // that cannot be focused and explains nothing.
  // Scoped by text: an earning check-in renders a second `role="status"` for
  // "+1 FREEZE", so an unscoped locator would become a strict-mode failure.
  await expect(
    page.getByRole('status').filter({ hasText: 'DONE FOR TODAY' }),
  ).toBeVisible()

  // The design spec wants the horizontal-overflow check on the dashboard and
  // the public profile as well as the landing page. Those two need a session
  // and a seeded user, so they are asserted here rather than in the
  // session-free layout suite.
  for (const width of VIEWPORTS) {
    await page.setViewportSize({ width, height: 800 })
    // Re-assert content at each width: an overflow check alone passes on a
    // page that failed to render, because both measurements would be zero.
    await expect(page.getByTestId('current-streak')).toBeVisible()
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    )
    expect(overflow, `dashboard at ${width}px`).toBeLessThanOrEqual(0)
  }
  // Defensive: nothing below uses `page` today, but leaving it at 320px would
  // silently change the conditions for anything added later.
  await page.setViewportSize({ width: 1280, height: 800 })

  // The public page must show the same streak to a visitor with no session.
  const visitor = await page.context().browser()!.newContext()
  const visitorPage = await visitor.newPage()
  await visitorPage.goto(`/${user.username}`)

  await expect(
    visitorPage.getByRole('heading', { name: user.username }),
  ).toBeVisible()
  await expect(visitorPage.getByTestId('current-streak')).toHaveText('1')

  for (const width of VIEWPORTS) {
    await visitorPage.setViewportSize({ width, height: 800 })
    await expect(visitorPage.getByTestId('current-streak')).toBeVisible()
    const overflow = await visitorPage.evaluate(
      () => document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    )
    expect(overflow, `public profile at ${width}px`).toBeLessThanOrEqual(0)
  }

  await visitor.close()
})

test('a reserved username is reported instead of failing silently', async ({
  page,
  user,
}) => {
  await signIn(page, user)
  await expect(page).toHaveURL('/onboarding')

  // `dashboard` is on the reserved list because profiles live at the root.
  await page.getByLabel('Choose a Username').fill('dashboard')
  await page.getByLabel('Your Main Promise').fill('Ship every day')
  await page.getByRole('button', { name: 'Start Game' }).click()

  await expect(page.getByText('That username is reserved. Pick another one.')).toBeVisible()
  await expect(page).toHaveURL('/onboarding')
})

test('an unknown profile returns the 404 page', async ({ page }) => {
  await page.goto('/nosuchplayer')

  await expect(page.getByText('No player found at this address.')).toBeVisible()
})
