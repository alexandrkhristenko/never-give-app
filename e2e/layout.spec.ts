import { expect, test } from '@playwright/test'

const WIDTHS = [320, 375, 768, 1280]
// Each path carries a probe: an overflow check on its own passes on a page
// that failed to render, since both measurements would then be zero.
const PUBLIC_PATHS = [
  { path: '/', probe: 'never-give.app' },
  { path: '/login', probe: 'SIGN IN' },
]

// A page that scrolls sideways is broken on a phone, and it is the failure
// mode a monospaced pixel font produces most easily.
for (const width of WIDTHS) {
  for (const { path, probe } of PUBLIC_PATHS) {
    test(`${path} does not scroll horizontally at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 800 })
      await page.goto(path)
      await expect(page.getByText(probe).first()).toBeVisible()

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

  const chain = page.locator('[data-testid="chain"][data-responsive]')
  const cells = chain.locator('li')

  // All thirty are rendered; sixteen are hidden by CSS below `sm`.
  await expect(cells).toHaveCount(30)
  await expect(chain.locator('li:visible')).toHaveCount(14)

  // Which sixteen depends on where the window is anchored, so the assertion is
  // about the two things that must hold at any anchor: today is one of the
  // fourteen, and the trimming comes off whichever end is further from it.
  // Asserting a fixed sixteen off the front would pass while hiding the whole
  // chain of an account three days old.
  await expect(chain.locator('li[data-today]')).toBeVisible()
  await expect(cells.first()).toBeHidden()
  await expect(cells.last()).toBeHidden()
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

// Moved here from the streak suite: it needs no session, and skipping it
// alongside the tests that do would lose the coverage for no reason.
test('an unknown profile returns the 404 page', async ({ page }) => {
  await page.goto('/nosuchplayer')

  await expect(page.getByText('No player found at this address.')).toBeVisible()
})
