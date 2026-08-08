'use server'

import { redirect } from 'next/navigation'
import { requireSessionUser } from '@/lib/dal/session'
import {
  createProfileAndPromise,
  type OnboardingError,
} from '@/lib/dal/promise'
import { PROMISE_MAX_LENGTH, validateUsername } from '@/lib/validation'
import { RATE_LIMITED_MESSAGE, withinRateLimit } from '@/lib/rate-limit'
import { isUsernameTaken } from '@/lib/dal/username'

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

  if (!(await withinRateLimit('username'))) return 'rate_limited'

  try {
    return (await isUsernameTaken(username)) ? 'taken' : 'available'
  } catch {
    // The submit path checks again against the unique constraint, so a failure
    // here costs a hint rather than correctness.
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
  if (!(await withinRateLimit('onboarding'))) {
    return { error: RATE_LIMITED_MESSAGE, field: 'username' }
  }

  const error = await createProfileAndPromise(session, {
    username: String(formData.get('username') ?? ''),
    promiseTitle: String(formData.get('promise') ?? ''),
    visibility: String(formData.get('visibility') ?? 'public'),
    timezone: String(formData.get('timezone') || 'UTC'),
  })

  if (error) return { error: MESSAGES[error], field: FIELDS[error] }

  // Outside any try/catch: redirect() throws a control-flow exception.
  redirect('/dashboard')
}
