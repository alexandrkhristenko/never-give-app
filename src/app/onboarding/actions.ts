'use server'

import { redirect } from 'next/navigation'
import { requireSessionUser } from '@/lib/dal/session'
import {
  createProfileAndPromise,
  type OnboardingError,
} from '@/lib/dal/promise'
import { PROMISE_MAX_LENGTH } from '@/lib/validation'

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

export async function completeOnboarding(
  _prevState: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const session = await requireSessionUser()

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
