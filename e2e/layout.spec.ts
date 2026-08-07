import { expect, test } from '@playwright/test'

const WIDTHS = [320, 375, 768, 1280]
const PUBLIC_PATHS = ['/', '/login']

// A page that scrolls sideways is broken on a phone, and it is the failure
// mode a monospaced pixel font produces most easily.
for (const width of WIDTHS) {
  for (const path of PUBLIC_PATHS) {
    test(`${path} does not scroll horizontally at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 800 })
      await page.goto(path)

      const overflow = await page.evaluate(() => {
        const root = document.documentElement
        return root.scrollWidth - root.clientWidth
      })

      expect(overflow).toBeLessThanOrEqual(0)
    })
  }
}

test('a full chain trims to 14 days on a narrow screen', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 })
  await page.goto('/')

  const cells = page.locator('[data-testid="chain"][data-responsive]').locator('li')

  // All thirty are rendered; sixteen are hidden by CSS below `sm`.
  await expect(cells).toHaveCount(30)
  await expect(cells.first()).toBeHidden()
  await expect(cells.nth(16)).toBeVisible()
})

test('a short chain is never trimmed', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 })
  await page.goto('/')

  const shortChain = page
    .locator('[data-testid="chain"]:not([data-responsive])')
    .first()

  await expect(shortChain.locator('li').first()).toBeVisible()
})

test('the theme choice survives a reload', async ({ page }) => {
  await page.goto('/')

  // With no cookie the media query decides, and the attribute is absent.
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.*/)

  await page
    .getByRole('button', { name: /Switch to (dark|light) theme/ })
    .click()

  await expect(page.locator('html')).toHaveAttribute('data-theme', /light|dark/)

  const chosen = await page.evaluate(() =>
    document.documentElement.getAttribute('data-theme'),
  )

  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', chosen ?? '')
})
