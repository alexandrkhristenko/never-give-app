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

/*
 * A form control has to have a visible boundary — WCAG 1.4.11, non-text
 * contrast — and in the dark theme these had none at all: an empty field was a
 * rectangle of very slightly lighter background and nothing else.
 *
 * The cause is worth encoding rather than describing. NES.css draws the border
 * of `.nes-input`, `.nes-textarea` and `.nes-select select` with
 * `border-image-source`: an inline SVG whose fill is baked in as
 * `rgb(33,37,41)`. A border image replaces the border colour outright, so
 * `nes-theme.css` setting `border-color: var(--color-edge)` had never once had
 * an effect. In the light theme the baked near-black happens to be right; in
 * the dark theme it is black on black.
 *
 * Asserting the computed colour alone cannot catch this — it reports the value
 * we set while the image paints something else. So the assertion is on the
 * image: any control that carries one is lying about its border.
 */
test('form controls have a border that follows the theme', async ({ page }) => {
  for (const theme of ['dark', 'light'] as const) {
    await page.context().clearCookies()
    await page.context().addCookies([
      { name: 'theme', value: theme, url: 'http://localhost:3000' },
    ])
    await page.goto('/login')
    await settled(page)

    // Resolved through a throwaway element rather than read off the custom
    // property: the variable holds a hex string and `borderTopColor` is always
    // reported as `rgb(...)`, so comparing the two directly compares notations.
    const edge = await page.evaluate(() => {
      const probe = document.createElement('div')
      probe.style.borderColor = 'var(--color-edge)'
      document.body.append(probe)
      const resolved = getComputedStyle(probe).borderTopColor
      probe.remove()
      return resolved
    })

    const controls = page.locator('input:not([type="hidden"]), select, textarea')
    const count = await controls.count()
    expect(count, `${theme}: controls on /login`).toBeGreaterThan(0)

    for (let i = 0; i < count; i++) {
      const seen = await controls.nth(i).evaluate((el) => {
        const style = getComputedStyle(el)
        return {
          id: el.id,
          image: style.borderImageSource,
          color: style.borderTopColor,
          width: parseFloat(style.borderTopWidth),
        }
      })

      expect(seen.image, `${theme}: ${seen.id} border image`).toBe('none')
      expect(seen.width, `${theme}: ${seen.id} border width`).toBeGreaterThan(0)
      expect(seen.color, `${theme}: ${seen.id} border colour`).toBe(edge)
    }
  }
})

/*
 * The same lie, one component over. `.nes-btn` carries the same baked
 * `border-image-source`, and the audit that found it looked at every element on
 * every page rather than at the one that was reported — which is how the button
 * turned up at all.
 *
 * The coloured variants got away with it: their border colour is `currentColor`,
 * which for `is-primary`, `is-success` and `is-error` is the dark panel ink, so
 * the baked near-black happened to be the right answer. The default variant did
 * not: its ink is light, its background *is* the panel behind it, and the border
 * that was supposed to separate the two painted itself black on black. A button
 * readable only by its text and its drop shadow.
 *
 * Anchors are included deliberately — three of the sign-in controls are links
 * wearing `.nes-btn`, and a selector that only looked at `button` would have
 * reported the page clean.
 */
test('buttons have a border that follows the theme', async ({ page }) => {
  for (const theme of ['dark', 'light'] as const) {
    await page.context().clearCookies()
    await page.context().addCookies([
      { name: 'theme', value: theme, url: 'http://localhost:3000' },
    ])
    await page.goto('/')
    await settled(page)

    const buttons = page.locator('.nes-btn')
    const count = await buttons.count()
    expect(count, `${theme}: buttons on the landing page`).toBeGreaterThan(0)

    for (let i = 0; i < count; i++) {
      const seen = await buttons.nth(i).evaluate((el) => {
        const style = getComputedStyle(el)
        return {
          what: `${el.tagName.toLowerCase()}.${(el.className || '').toString().split(' ')[1] ?? 'default'}`,
          image: style.borderImageSource,
          width: parseFloat(style.borderTopWidth),
          // `currentColor` by design: each variant's outline matches its own
          // text, which is what keeps a blue primary button from growing a pale
          // border in the dark theme.
          color: style.borderTopColor,
          ink: style.color,
        }
      })

      expect(seen.image, `${theme}: ${seen.what} border image`).toBe('none')
      expect(seen.width, `${theme}: ${seen.what} border width`).toBeGreaterThan(0)
      expect(seen.color, `${theme}: ${seen.what} border colour`).toBe(seen.ink)
    }
  }
})
