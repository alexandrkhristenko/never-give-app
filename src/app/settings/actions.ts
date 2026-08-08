'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireSessionUser } from '@/lib/dal/session'
import {
  deleteAccount,
  updatePromise,
  updateTimezone,
  type SettingsError,
} from '@/lib/dal/settings'
import { createClient } from '@/utils/supabase/server'
import { PROMISE_MAX_LENGTH } from '@/lib/validation'

/** Which control a message belongs to, so `Field` can attach it. */
export type SettingsField = 'promise' | 'visibility' | 'timezone'

export interface SettingsState {
  error?: string
  field?: SettingsField
  /** Set on a successful save, so the form can confirm rather than go quiet. */
  saved?: string
}

const MESSAGES: Record<SettingsError, string> = {
  empty_promise: 'Describe what you are committing to.',
  promise_too_long: `Keep it under ${PROMISE_MAX_LENGTH} characters.`,
  invalid_visibility: 'Pick one of the offered visibility options.',
  unknown_timezone: 'That timezone is not one this server recognises.',
  not_found: 'Your promise could not be found. Try reloading the page.',
  unknown: 'Something went wrong. Please try again.',
}

const FIELDS: Record<SettingsError, SettingsField | undefined> = {
  empty_promise: 'promise',
  promise_too_long: 'promise',
  invalid_visibility: 'visibility',
  unknown_timezone: 'timezone',
  not_found: undefined,
  unknown: undefined,
}

function failure(error: SettingsError): SettingsState {
  return { error: MESSAGES[error], field: FIELDS[error] }
}

export async function savePromise(
  _prevState: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const session = await requireSessionUser()

  const error = await updatePromise(session, {
    title: String(formData.get('promise') ?? ''),
    visibility: String(formData.get('visibility') ?? ''),
  })

  if (error) return failure(error)

  // The dashboard and the public profile both render this text; without the
  // revalidate they keep serving the old one from the router cache and the
  // save looks like it did nothing.
  revalidatePath('/dashboard')
  revalidatePath('/[username]', 'page')

  return { saved: 'Saved.' }
}

export async function saveTimezone(
  _prevState: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const session = await requireSessionUser()

  const error = await updateTimezone(session, String(formData.get('timezone') ?? ''))
  if (error) return failure(error)

  // The day boundary moved, so what counts as "today" moved with it.
  revalidatePath('/dashboard')
  revalidatePath('/[username]', 'page')

  return { saved: 'Timezone updated.' }
}

/**
 * Deletes the account, then ends the session.
 *
 * Order matters. The row is gone first; signing out first would leave a
 * request with no verified identity, and `delete_own_account()` derives its
 * target from exactly that identity — it would delete nothing and report
 * success.
 *
 * The sign-out is not optional cleanup either. The access token stays
 * cryptographically valid until it expires, so a session left in place after
 * the account is gone is a browser holding credentials for a user that no
 * longer exists.
 */
export async function confirmDeleteAccount(
  _prevState: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const session = await requireSessionUser()

  // Typing the username is the confirmation. A checkbox or a second button is
  // dismissed by muscle memory; this cannot be done by accident.
  const typed = String(formData.get('confirm') ?? '').trim()
  const expected = String(formData.get('username') ?? '').trim()

  if (!expected || typed.toLowerCase() !== expected.toLowerCase()) {
    return {
      error: `Type ${expected || 'your username'} exactly to confirm.`,
    }
  }

  const error = await deleteAccount(session)
  if (error) return failure(error)

  const supabase = await createClient()
  await supabase.auth.signOut()

  // Outside any try/catch: redirect() throws a control-flow exception.
  redirect('/')
}
