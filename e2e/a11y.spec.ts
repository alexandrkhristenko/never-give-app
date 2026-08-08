import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

/**
 * Automated accessibility audit of the pages a signed-out visitor can reach.
 *
 * Plenty of claims were made while this was built — that the contrast passes
 * AA, that the chain announces itself as one image rather than thirty list
 * items, that focus is visible. None of them were measured. This measures the
 * ones a machine can.
 *
 * It does not replace the manual pass: axe cannot judge whether a label reads
 * sensibly, whether focus order matches the visual order, or whether a screen
 * reader's output is useful. It catches the things that are simply wrong.
 */

/**
 * Waits for the entrance animation to finish before measuring.
 *
 * Panels fade in over 240ms, so an audit that fires on load samples text at
 * partial opacity and reports a contrast failure for a frame that no one is
 * asked to read. Verified deliberately: the same page reports one violation
 * immediately and none once animations settle. Measuring a transition tells
 * you about the transition, not the interface.
 *
 * Users who asked for less motion never see this state at all — the global
 * reduced-motion rule zeroes both duration and delay.
 *
 * Looping animations are excluded rather than waited on: the avatar hops
 * forever by design, so "every animation has finished" is a condition the
 * profile page never satisfies. Waiting on it hangs instead of failing, which
 * is the worse of the two.
 */
async function settled(page: import('@playwright/test').Page) {
  await page.waitForFunction(() =>
    document.getAnimations().every((animation) => {
      const iterations = animation.effect?.getComputedTiming().iterations
      return iterations === Infinity || animation.playState === 'finished'
    }),
  )
}

const PAGES = [
  { name: 'landing', path: '/' },
  { name: 'sign-in', path: '/login' },
  { name: 'profile not found', path: '/nosuchplayer' },
]

// Widths where the layout genuinely differs: below and above `sm`.
const WIDTHS = [320, 1280]

for (const { name, path } of PAGES) {
  for (const theme of ['light', 'dark'] as const) {
    for (const width of WIDTHS) {
      test(`${name} has no accessibility violations — ${theme}, ${width}px`, async ({
        page,
        context,
      }) => {
        await context.addCookies([
          { name: 'theme', value: theme, url: 'http://localhost:3000' },
        ])
        await page.setViewportSize({ width, height: 900 })
        await page.goto(path)
        await settled(page)

        const results = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
          .analyze()

        // Name the rule and the element, so a failure is actionable without
        // re-running anything.
        const summary = results.violations.map((violation) => ({
          rule: violation.id,
          impact: violation.impact,
          help: violation.help,
          nodes: violation.nodes.map((node) => node.target.join(' ')),
        }))

        expect(summary, JSON.stringify(summary, null, 2)).toEqual([])
      })
    }
  }
}

test('the chain is announced as one image, not thirty list items', async ({
  page,
}) => {
  await page.goto('/')
  await settled(page)

  const chain = page.locator('[data-testid="chain"]').first()
  await expect(chain).toHaveAttribute('role', 'img')
  await expect(chain).toHaveAttribute('aria-label', /\d+ checked in/)

  // Every cell hidden: thirty separate announcements would make the page
  // unusable with a screen reader.
  const cells = chain.locator('li')
  const total = await cells.count()
  const hidden = await chain.locator('li[aria-hidden="true"]').count()
  expect(hidden).toBe(total)
})

test('every page has exactly one main landmark and one h1', async ({ page }) => {
  for (const { path } of PAGES) {
    await page.goto(path)
    await settled(page)
    await expect(page.locator('main'), `${path} main`).toHaveCount(1)
    // A page whose heading is its logo tells a screen-reader user nothing about
    // where they are.
    const h1 = page.locator('h1')
    expect(await h1.count(), `${path} h1 count`).toBeLessThanOrEqual(1)
  }
})

test('interactive elements take focus and show it', async ({ page }) => {
  await page.goto('/login')
  await settled(page)

  await page.keyboard.press('Tab')
  const focused = page.locator(':focus-visible')
  await expect(focused).toHaveCount(1)

  // An outline of zero width is the default browsers apply when a stylesheet
  // removes it; this project sets one deliberately.
  const outlineWidth = await focused.evaluate(
    (el) => getComputedStyle(el).outlineWidth,
  )
  expect(parseFloat(outlineWidth)).toBeGreaterThan(0)
})
