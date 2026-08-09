'use server'

import { redirect } from 'next/navigation'
import { requireSessionUser } from '@/lib/dal/session'
import {
  createProfileAndPromise,
  type OnboardingError,
} from '@/lib/dal/promise'
import {
  PROMISE_MAX_LENGTH,
  resolveTimezone,
  validateUsername,
} from '@/lib/validation'
import { refusalMessage, withinRateLimit } from '@/lib/rate-limit'
import { isUsernameTaken } from '@/lib/dal/username'
import { logError, logWarn } from '@/lib/log'

/**
 * `field` says which control the message belongs to, so the form can hand it
 * to that `Field` and mark the control invalid. Without it a screen-reader
 * user tabbing field by field never learns *which* input was rejected.
 */
export type OnboardingField = 'username' | 'promise'

export interface OnboardingState {
  error?: string
  field?: OnboardingField
}

const MESSAGES: Record<OnboardingError, string> = {
  invalid_username:
    'Username must be 3-20 characters: letters, digits, underscore.',
  reserved_username: 'That username is reserved. Pick another one.',
  username_taken: 'This username is already taken.',
  empty_promise: 'Describe what you are committing to.',
  promise_too_long: `Keep it under ${PROMISE_MAX_LENGTH} characters.`,
  unknown: 'Something went wrong. Please try again.',
}

const FIELDS: Record<OnboardingError, OnboardingField | undefined> = {
  invalid_username: 'username',
  reserved_username: 'username',
  username_taken: 'username',
  empty_promise: 'promise',
  promise_too_long: 'promise',
  unknown: undefined,
}

/** What the live check under the username field can report. */
export type UsernameStatus =
  | 'available'
  | 'taken'
  | 'invalid'
  | 'reserved'
  | 'rate_limited'
  | 'unknown'

/**
 * Answers whether a username is free, while the person is still typing it.
 *
 * Requires a session: this runs during onboarding, and there is no reason for
 * a signed-out caller to have a faster oracle than the profile pages already
 * provide.
 *
 * The format is checked here rather than trusted from the client, so a
 * malformed name costs no database round trip and the reserved list cannot be
 * probed by turning off JavaScript.
 */
export async function checkUsername(username: string): Promise<UsernameStatus> {
  await requireSessionUser()

  const invalid = validateUsername(username)
  if (invalid === 'invalid_format') return 'invalid'
  if (invalid === 'reserved') return 'reserved'

  // `unavailable` maps to the status the catch below already uses: from the
  // hint's point of view a limiter that cannot run and a lookup that cannot
  // answer are the same event, and neither is the person's fault.
  const budget = await withinRateLimit('username')
  if (budget === 'limited') return 'rate_limited'
  if (budget === 'unavailable') return 'unknown'

  try {
    return (await isUsernameTaken(username)) ? 'taken' : 'available'
  } catch (error) {
    // The submit path checks again against the unique constraint, so a failure
    // here costs a hint rather than correctness. Still recorded: a check that
    // never answers would otherwise look like a UI that simply does nothing.
    logError('username.check', error)
    return 'unknown'
  }
}

export async function completeOnboarding(
  _prevState: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const session = await requireSessionUser()

  // "This username is already taken" is a useful message and an enumeration
  // oracle at the same time. It stays — the alternative is a form that refuses
  // without saying why — and the budget is what makes reading it one name at a
  // time the only way to use it.
  const budget = await withinRateLimit('onboarding')
  if (budget !== 'allowed') {
    return { error: refusalMessage(budget), field: 'username' }
  }

  // `UTC` is both a real answer and the absence of one. The hidden field is
  // filled by an effect, so a submit that beats hydration sends nothing — and
  // the account is created on a day boundary the person never chose. Storing
  // UTC anyway is still the right trade (see `resolveTimezone`); being unable
  // to count how often it happens was not.
  const zone = resolveTimezone(formData.get('timezone')?.toString())
  if (!zone.detected) {
    logWarn('onboarding.timezone_absent', { userId: session.id })
  }

  const error = await createProfileAndPromise(session, {
    username: String(formData.get('username') ?? ''),
    promiseTitle: String(formData.get('promise') ?? ''),
    visibility: String(formData.get('visibility') ?? 'public'),
    timezone: zone.timezone,
  })

  if (error) return { error: MESSAGES[error], field: FIELDS[error] }

  // Outside any try/catch: redirect() throws a control-flow exception.
  redirect('/dashboard')
}
