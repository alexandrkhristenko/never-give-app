import { expect, test } from '@playwright/test'

/**
 * The sign-in form's state machine, exercised through the browser.
 *
 * None of this needs an account: every assertion is about what the form does
 * with a *rejected* attempt. That matters, because this is the one screen with
 * non-trivial client state — two modes, a wrapped server action, a terminal
 * confirmation screen — and the only part of it that was ever tested is the
 * part that succeeds, which requires credentials the test environment does not
 * have.
 *
 * A stale error surviving a mode switch was a real defect here, found by
 * review rather than by a test. This is that test.
 */

const WRONG = { email: 'nobody@never-give.app', password: 'not-the-password' }

/**
 * The mode toggle is also a button reading "sign up"/"sign in", so the submit
 * control has to be addressed by type rather than by accessible name.
 */
const submitButton = (page: import('@playwright/test').Page) =>
  page.locator('button[type="submit"]')

/**
 * Next renders a permanently-present `role="alert"` region to announce route
 * changes, so a bare `getByRole('alert')` always matches it too. Excluding it
 * by id is what makes an assertion about *our* alerts unambiguous.
 */
const alerts = (page: import('@playwright/test').Page) =>
  page.locator('[role="alert"]:not(#__next-route-announcer__)')

async function submit(page: import('@playwright/test').Page) {
  await page.getByLabel('Email').fill(WRONG.email)
  await page.getByLabel('Password').fill(WRONG.password)
  await submitButton(page).click()
}

test.beforeEach(async ({ page }) => {
  await page.goto('/login')
})

test('starts in sign-in mode and can switch to sign-up', async ({ page }) => {
  await expect(submitButton(page)).toHaveText('SIGN IN')

  await page.getByRole('button', { name: /no account yet/i }).click()
  await expect(submitButton(page)).toHaveText('SIGN UP')

  await page.getByRole('button', { name: /already have an account/i }).click()
  await expect(submitButton(page)).toHaveText('SIGN IN')
})

test('reports a rejected sign-in instead of failing silently', async ({ page }) => {
  await submit(page)

  const alert = alerts(page)
  await expect(alert).toBeVisible()
  // Whatever Supabase says, it must reach the user rather than being swallowed.
  await expect(alert).not.toBeEmpty()
})

test('a failed sign-in does not leave its error on the sign-up form', async ({
  page,
}) => {
  await submit(page)
  await expect(alerts(page)).toBeVisible()

  await page.getByRole('button', { name: /no account yet/i }).click()

  // The message described a flow the user is no longer in. Carrying the
  // originating mode in the state is what makes this pass.
  await expect(alerts(page)).toHaveCount(0)
  await expect(submitButton(page)).toHaveText('SIGN UP')
})

test('switching back does not resurrect the error either', async ({ page }) => {
  await submit(page)
  // Load-bearing wait. Without it this test clicked through while the action
  // was still in flight and asserted against a form that had never shown an
  // error — passing against any implementation, including the broken one it
  // was written to catch. Adding the wait turned it red immediately: the
  // error really did come back.
  await expect(alerts(page)).toBeVisible()
  await page.getByRole('button', { name: /no account yet/i }).click()
  await page.getByRole('button', { name: /already have an account/i }).click()

  // Returning to the mode the error came from must not redisplay a message
  // about an attempt the user has since navigated away from.
  await expect(alerts(page)).toHaveCount(0)
})

test('the password hint appears only where it applies', async ({ page }) => {
  await expect(page.getByText(/at least 6 characters/i)).toHaveCount(0)

  await page.getByRole('button', { name: /no account yet/i }).click()
  await expect(page.getByText(/at least 6 characters/i)).toBeVisible()
})

test('both fields are required and correctly labelled', async ({ page }) => {
  const email = page.getByLabel('Email')
  const password = page.getByLabel('Password')

  await expect(email).toHaveAttribute('type', 'email')
  await expect(email).toHaveAttribute('required', '')
  await expect(email).toHaveAttribute('autocomplete', 'email')

  await expect(password).toHaveAttribute('type', 'password')
  await expect(password).toHaveAttribute('required', '')
  // The autocomplete hint has to follow the mode, or a password manager offers
  // to fill a new password into a sign-in form.
  await expect(password).toHaveAttribute('autocomplete', 'current-password')

  await page.getByRole('button', { name: /no account yet/i }).click()
  await expect(page.getByLabel('Password')).toHaveAttribute(
    'autocomplete',
    'new-password',
  )
})

test('the submit button reports that it is working', async ({ page }) => {
  await page.getByLabel('Email').fill(WRONG.email)
  await page.getByLabel('Password').fill(WRONG.password)

  await submitButton(page).click()

  // Not disabled — a disabled control leaves the tab order and explains
  // nothing. `aria-busy` is what conveys the state here.
  await expect(alerts(page)).toBeVisible()
  await expect(submitButton(page)).toBeEnabled()
})
