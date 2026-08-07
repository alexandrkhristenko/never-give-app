'use server'

import { revalidatePath } from 'next/cache'
import { getProfile } from '@/lib/dal/user'
import { checkIn } from '@/lib/dal/promise'

export type CheckInState =
  | { status: 'idle' }
  | { status: 'ok'; earnedFreeze: boolean }
  | { status: 'error'; message: string }

/**
 * Records today's check-in.
 *
 * Server Actions are reachable by direct POST, not only through the UI, so
 * authorization is re-established here rather than trusted from the page.
 *
 * Failures are returned, not thrown: a thrown error would replace the whole
 * dashboard with the error boundary over what is a retryable hiccup.
 */
export async function checkInAction(
  _prevState: CheckInState,
  _formData: FormData,
): Promise<CheckInState> {
  const profile = await getProfile()
  if (!profile) return { status: 'error', message: 'Please sign in again.' }

  try {
    const result = await checkIn(profile)

    // null means there is no promise to check in on. Reporting success here
    // would render DONE FOR TODAY over an operation that wrote nothing.
    if (!result) {
      return { status: 'error', message: 'No active quest to check in on.' }
    }

    revalidatePath('/dashboard')
    revalidatePath(`/${profile.username}`)

    return { status: 'ok', earnedFreeze: result.earnedFreeze }
  } catch (error) {
    console.error('Check-in failed', error)
    return { status: 'error', message: 'Could not check in. Please try again.' }
  }
}
