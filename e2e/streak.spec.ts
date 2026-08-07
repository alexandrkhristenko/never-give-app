import { expect, test } from './fixtures'

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
  await expect(
    page.getByRole('button', { name: 'DONE FOR TODAY' }),
  ).toBeDisabled()

  // The public page must show the same streak to a visitor with no session.
  const visitor = await page.context().browser()!.newContext()
  const visitorPage = await visitor.newPage()
  await visitorPage.goto(`http://localhost:3000/${user.username}`)

  await expect(
    visitorPage.getByRole('heading', { name: user.username }),
  ).toBeVisible()
  await expect(visitorPage.getByTestId('current-streak')).toHaveText('1')

  await visitor.close()
})

test('a taken username is reported instead of failing silently', async ({
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
