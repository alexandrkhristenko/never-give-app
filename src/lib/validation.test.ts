import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  PROMISE_MAX_LENGTH,
  pickTimezone,
  resolveTimezone,
  validatePromiseTitle,
  validateUsername,
} from './validation'

describe('validatePromiseTitle', () => {
  it('accepts an ordinary promise', () => {
    expect(validatePromiseTitle('Code every day')).toBeNull()
  })

  it('rejects blank input, including whitespace only', () => {
    expect(validatePromiseTitle('')).toBe('empty')
    expect(validatePromiseTitle('   ')).toBe('empty')
  })

  it('accepts the boundary length', () => {
    expect(validatePromiseTitle('a'.repeat(PROMISE_MAX_LENGTH))).toBeNull()
  })

  it('rejects one character past the boundary', () => {
    expect(validatePromiseTitle('a'.repeat(PROMISE_MAX_LENGTH + 1))).toBe(
      'too_long',
    )
  })

  it('measures the trimmed value', () => {
    const padded = `  ${'a'.repeat(PROMISE_MAX_LENGTH)}  `
    expect(validatePromiseTitle(padded)).toBeNull()
  })
})

describe('validateUsername', () => {
  it('accepts letters, digits and underscores', () => {
    expect(validateUsername('player1')).toBeNull()
    expect(validateUsername('Player_One')).toBeNull()
    expect(validateUsername('___')).toBeNull()
  })

  it('rejects names that are too short or too long', () => {
    expect(validateUsername('ab')).toBe('invalid_format')
    expect(validateUsername('a'.repeat(21))).toBe('invalid_format')
  })

  it('accepts the boundary lengths', () => {
    expect(validateUsername('abc')).toBeNull()
    expect(validateUsername('a'.repeat(20))).toBeNull()
  })

  it('rejects empty input', () => {
    expect(validateUsername('')).toBe('invalid_format')
  })

  it('rejects disallowed characters', () => {
    expect(validateUsername('player one')).toBe('invalid_format')
    expect(validateUsername('player-one')).toBe('invalid_format')
    expect(validateUsername('player.one')).toBe('invalid_format')
    expect(validateUsername('игрок1')).toBe('invalid_format')
  })

  it('rejects route names that would collide with the app', () => {
    expect(validateUsername('dashboard')).toBe('reserved')
    expect(validateUsername('login')).toBe('reserved')
    expect(validateUsername('api')).toBe('reserved')
  })

  it('rejects reserved names regardless of case', () => {
    expect(validateUsername('Dashboard')).toBe('reserved')
    expect(validateUsername('ADMIN')).toBe('reserved')
  })
})

describe('RESERVED_USERNAMES coverage', () => {
  it('reserves every top-level route segment that exists', () => {
    // The invariant worth testing is not that the list contains thirteen
    // particular strings — that only restates the literal. It is that the list
    // still covers the app's own routes: add a page and forget the list, and a
    // username registered earlier silently shadows it.
    const appDir = join(process.cwd(), 'src', 'app')
    const segments = readdirSync(appDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      // Dynamic segments cannot collide — `[username]` is the profile itself.
      .filter((entry) => !entry.name.startsWith('[') && !entry.name.startsWith('('))
      .map((entry) => entry.name)

    expect(segments.length).toBeGreaterThan(0)
    for (const segment of segments) {
      expect(validateUsername(segment)).toBe('reserved')
    }
  })

  it('reserves the framework asset path', () => {
    // `_next` passes the username pattern, so nothing but this list stops a
    // profile from claiming the path Next serves its own assets from.
    expect(validateUsername('_next')).toBe('reserved')
  })
})

describe('resolveTimezone', () => {
  it('keeps a zone the browser reported', () => {
    expect(resolveTimezone('America/New_York')).toEqual({
      timezone: 'America/New_York',
      detected: true,
    })
  })

  // A browser genuinely in UTC is not the same as a browser that never spoke.
  it('treats a reported UTC as reported', () => {
    expect(resolveTimezone('UTC')).toEqual({ timezone: 'UTC', detected: true })
  })

  /*
   * The case this function exists for. The onboarding form fills its hidden
   * field from an effect, so a submit that beats hydration sends nothing —
   * reproduced on production with the JS chunks delayed. The old code read
   * `formData.get('timezone') || 'UTC'` and could not tell that apart from a
   * browser in London.
   */
  it('reports an absent zone as undetected', () => {
    expect(resolveTimezone('')).toEqual({ timezone: 'UTC', detected: false })
    expect(resolveTimezone(null)).toEqual({ timezone: 'UTC', detected: false })
    expect(resolveTimezone(undefined)).toEqual({
      timezone: 'UTC',
      detected: false,
    })
  })

  // Better caught here than stored: `getProfile` would otherwise warn about it
  // on every read, and the settings select would have to carry a value no list
  // contains.
  it('refuses a zone no runtime can resolve', () => {
    expect(resolveTimezone('Not/AZone')).toEqual({
      timezone: 'UTC',
      detected: false,
    })
  })
})

describe('pickTimezone', () => {
  it('prefers what the form submitted', () => {
    expect(pickTimezone(['America/New_York', 'Europe/Berlin'])).toEqual({
      timezone: 'America/New_York',
      detected: true,
    })
  })

  // The case the cookie exists for: the form beat hydration and sent nothing.
  it('falls back to the remembered zone', () => {
    expect(pickTimezone([undefined, 'Europe/Berlin'])).toEqual({
      timezone: 'Europe/Berlin',
      detected: true,
    })
    expect(pickTimezone(['', 'Europe/Berlin'])).toEqual({
      timezone: 'Europe/Berlin',
      detected: true,
    })
  })

  // A cookie is client-writable, so an unresolvable one must not shadow a
  // later candidate — and must not be stored.
  it('skips a candidate no runtime can resolve', () => {
    expect(pickTimezone(['Not/AZone', 'Europe/Berlin'])).toEqual({
      timezone: 'Europe/Berlin',
      detected: true,
    })
  })

  it('reports undetected when nothing usable arrived', () => {
    expect(pickTimezone([undefined, null, ''])).toEqual({
      timezone: 'UTC',
      detected: false,
    })
  })

  it('treats a reported UTC as a real answer and stops there', () => {
    expect(pickTimezone(['UTC', 'Europe/Berlin'])).toEqual({
      timezone: 'UTC',
      detected: true,
    })
  })
})
