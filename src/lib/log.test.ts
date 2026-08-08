import { afterEach, describe, expect, it, vi } from 'vitest'
import { logError, logWarn } from './log'

/**
 * The logger's job is to make failures legible after the fact, which means the
 * two things worth testing are the two things that would silently ruin it: a
 * line that cannot be parsed, and a line carrying something it should not.
 */

function captured(fn: () => void): Record<string, unknown> {
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  fn()
  const call = spy.mock.calls[0] ?? warn.mock.calls[0]
  // A log line that is not one parseable object per line defeats every
  // collector that would consume it.
  return JSON.parse(String(call?.[0]))
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('logError', () => {
  it('emits one parseable object with the event and level', () => {
    const line = captured(() => logError('promise.update', new Error('boom')))

    expect(line.level).toBe('error')
    expect(line.event).toBe('promise.update')
    expect(line.error).toBe('boom')
    expect(typeof line.at).toBe('string')
  })

  it('digs the Postgres code out from under Drizzle wrapping', () => {
    // Exactly the shape that once made a taken username report itself as an
    // unknown failure: the useful fields are on `cause`, not on the error the
    // catch block receives.
    const driverError = Object.assign(new Error('duplicate key value'), {
      code: '23505',
      constraint_name: 'users_username_lower_idx',
    })
    const wrapped = new Error('Failed query', { cause: driverError })

    const line = captured(() => logError('onboarding.failed', wrapped))

    expect(line.code).toBe('23505')
    expect(line.constraint).toBe('users_username_lower_idx')
  })

  it('survives something that is not an Error at all', () => {
    const line = captured(() => logError('weird', 'just a string'))
    expect(line.error).toBe('just a string')
  })

  it('keeps the caller fields alongside the error', () => {
    const line = captured(() =>
      logError('account.delete', new Error('nope'), { userId: 'abc-123' }),
    )

    expect(line.userId).toBe('abc-123')
    expect(line.error).toBe('nope')
  })
})

describe('logWarn', () => {
  it('records context without an error', () => {
    const line = captured(() =>
      logWarn('profile.timezone_unresolvable', {
        userId: 'abc-123',
        timezone: 'Mars/Olympus_Mons',
      }),
    )

    expect(line.level).toBe('warn')
    expect(line.timezone).toBe('Mars/Olympus_Mons')
  })
})

describe('what the type system keeps out', () => {
  it('accepts only scalars as fields', () => {
    // Not a runtime assertion — a note that `LogFields` is deliberately
    // scalars-only. Objects invite passing a whole row, and a whole row is how
    // an email address ends up in a third party's log search. The compiler is
    // the enforcement; this test exists so removing that constraint is a
    // visible decision rather than a convenience.
    const line = captured(() =>
      logWarn('scalar.only', { a: 'x', b: 1, c: true, d: null }),
    )

    expect(line.a).toBe('x')
    expect(line.b).toBe(1)
    expect(line.c).toBe(true)
    expect(line.d).toBeNull()
  })
})
