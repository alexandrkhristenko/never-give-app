const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,20}$/

/**
 * Names the app owns. Public profiles live at the root (`/<username>`),
 * so a username must never collide with a route.
 */
export const RESERVED_USERNAMES: readonly string[] = [
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
