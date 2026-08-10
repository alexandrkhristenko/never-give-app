import { expect, hasDatabaseAccess, missingDatabaseReason, test } from './fixtures'

test.skip(!hasDatabaseAccess, missingDatabaseReason)

/*
 * A named zone rather than the machine's, and scoped to this file rather than
 * set in `playwright.config.ts`: CI runs in UTC, where a UTC result would prove
 * nothing, and every other suite has no business changing clocks because of
 * this one.
 */
const ZONE = 'America/New_York'
test.use({ timezoneId: ZONE })

/*
 * The defect: the hidden timezone field is filled by an effect, so a submit that
 * beats hydration used to carry nothing, and the account was created in UTC.
 * Reproduced on production by holding the JS chunks back twenty seconds.
 *
 * The delay is what makes this a test rather than a hope: without it the effect
 * always wins on a fast machine and the assertion passes for the wrong reason.
 */
test('a submit that beats hydration still records the real zone', async ({
  page,
  user,
}) => {
  await page.goto('/login')
  await page.getByLabel('Email').fill(user.email)
  await page.getByLabel('Password').fill(user.password)
  await page.getByRole('button', { name: 'Sign In' }).click()
  await page.waitForURL(/onboarding/)

  // The landing page and the login form have hydrated by now, so the cookie is
  // already written — which is the whole point of writing it there.
  const remembered = (await page.context().cookies()).find((c) => c.name === 'tz')
  expect(remembered?.value && decodeURIComponent(remembered.value)).toBe(ZONE)

  await page.context().route(/\.js(\?|$)/, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 20_000))
    await route.continue()
  })
  await page.goto('/onboarding', { waitUntil: 'domcontentloaded' })

  // Proof the race is real and that this run is inside it: the effect that fills
  // this field has not run, and cannot until the chunks arrive.
  await expect(page.locator('input[name="timezone"]')).toHaveValue('')

  await page.getByLabel('Choose a username').fill(user.username)
  await page.getByLabel('Your Main Promise').fill('Beat hydration')
  await page.getByRole('button', { name: 'Start Game' }).click()
  await page.waitForURL(/dashboard/, { timeout: 60_000 })

  await page.context().unroute(/\.js(\?|$)/)
  await page.goto('/settings')
  await expect(page.locator('#timezone')).toHaveValue(ZONE)
})
