const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,20}$/

/**
 * Names the app owns. Public profiles live at the root (`/<username>`),
 * so a username must never collide with a route.
 */
/**
 * Names a profile may not take, because the public profile lives at the root
 * (`/<username>`) and would otherwise shadow a real path.
 *
 * `_next` is here for the same reason as the routes: it passes the username
 * pattern — underscores and letters are allowed — and it is where the framework
 * serves its own assets. The rest are current or planned route segments; a test
 * asserts this list still covers every segment that actually exists.
 */
export const RESERVED_USERNAMES: readonly string[] = [
  '_next',
  'about',
  'admin',
  'api',
  'auth',
  'dashboard',
  'help',
  'login',
  'null',
  'onboarding',
  'settings',
  'support',
  'undefined',
  'www',
]

export type UsernameError = 'invalid_format' | 'reserved'

/** Returns the reason a username is unacceptable, or `null` when it is fine. */
export function validateUsername(username: string): UsernameError | null {
  if (!USERNAME_PATTERN.test(username)) return 'invalid_format'
  if (RESERVED_USERNAMES.includes(username.toLowerCase())) return 'reserved'
  return null
}

/**
 * The promise is the page heading, set in a monospaced pixel font. Anything
 * longer than this wraps past what a 320px screen can hold.
 */
export const PROMISE_MAX_LENGTH = 80

export type PromiseTitleError = 'empty' | 'too_long'

export function validatePromiseTitle(title: string): PromiseTitleError | null {
  const trimmed = title.trim()
  if (trimmed.length === 0) return 'empty'
  if (trimmed.length > PROMISE_MAX_LENGTH) return 'too_long'
  return null
}

/**
 * The three values `promises_visibility_check` accepts. Anything else is
 * refused by the database, so the list is duplicated here only to reject it a
 * step earlier with a message a person can act on.
 *
 * `private` was supported all the way down — the CHECK constraint, four RLS
 * policies, `generateMetadata` and the OG route all handle it — while no form
 * ever offered it. The settings screen is where it finally becomes reachable.
 */
export const VISIBILITY_VALUES = ['public', 'unlisted', 'private'] as const

export type Visibility = (typeof VISIBILITY_VALUES)[number]

export function isVisibility(value: string): value is Visibility {
  return (VISIBILITY_VALUES as readonly string[]).includes(value)
}

/**
 * Whether this runtime's ICU knows the zone.
 *
 * Onboarding deliberately falls back to UTC for an unknown zone, because the
 * value arrives from the browser unprompted and a rejected signup would be a
 * worse outcome than a wrong clock. Settings must not do that: here the person
 * chose the value, and silently storing something else is a lie about what
 * they just did.
 */
export function isKnownTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: timezone })
    return true
  } catch {
    return false
  }
}

/**
 * What to store for a zone the browser submitted, and whether it said anything
 * at all.
 *
 * `UTC` is both a real answer and the absence of one, and the two used to be
 * indistinguishable: onboarding read `formData.get('timezone') || 'UTC'`.
 *
 * The absence is reachable. The hidden field is filled by an effect, so a
 * submit that beats hydration sends the value that was in the HTML. Reproduced
 * on production with the JS chunks held back twenty seconds: a browser in
 * `America/New_York` created an account in `UTC`, and nothing anywhere said so.
 * The consequence is not cosmetic — the day boundary is the product, and it
 * landed at 19:00 local.
 *
 * Signup still is not refused over this: the value arrives unprompted and a
 * blocked registration is worse than a wrong clock, the same trade `isKnownTimezone`
 * above is written for. What changes is that the caller can now tell, and say so
 * in the log.
 */
export function resolveTimezone(raw: string | null | undefined): {
  timezone: string
  detected: boolean
} {
  if (!raw) return { timezone: 'UTC', detected: false }
  // Caught here rather than stored: `getProfile` would otherwise warn on every
  // read, and the settings select would carry a value no list contains.
  if (!isKnownTimezone(raw)) return { timezone: 'UTC', detected: false }
  return { timezone: raw, detected: true }
}

/**
 * The first candidate any runtime can resolve, in the order given.
 *
 * Two sources, and the order matters. The form field is what this browser says
 * right now; the cookie is what it said on an earlier page. The field wins when
 * it has anything to say, because a person can move between zones and the
 * cookie will be a year stale.
 *
 * The cookie is written by client script, so it is forgeable by whoever owns the
 * browser — which is why it goes through `resolveTimezone` like everything else,
 * and why an unresolvable value falls through instead of shadowing the next
 * candidate. The worst a forged one achieves is a wrong day boundary in its own
 * account.
 */
export function pickTimezone(
  candidates: readonly (string | null | undefined)[],
): { timezone: string; detected: boolean } {
  for (const candidate of candidates) {
    const resolved = resolveTimezone(candidate)
    if (resolved.detected) return resolved
  }
  return { timezone: 'UTC', detected: false }
}
