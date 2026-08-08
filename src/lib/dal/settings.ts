import 'server-only'
import { eq, sql } from 'drizzle-orm'
import { promises, users } from '@/db/schema'
import { withUser } from '@/db/rls'
import {
  isKnownTimezone,
  isVisibility,
  validatePromiseTitle,
} from '@/lib/validation'
import type { SessionUser } from './session'

/**
 * Writes for the settings screen.
 *
 * Kept apart from `dal/promise.ts` because everything there answers "what
 * should this person see"; everything here answers "what did they just ask to
 * change". The two have different failure modes — a read that goes wrong shows
 * stale numbers, a write that goes wrong loses an intent — and mixing them was
 * how the freeze-balance race got in.
 */

export type SettingsError =
  | 'empty_promise'
  | 'promise_too_long'
  | 'invalid_visibility'
  | 'unknown_timezone'
  | 'not_found'
  | 'unknown'

/**
 * Updates the promise title and visibility together.
 *
 * One statement rather than two, because they are edited on one form and a
 * half-applied save is the kind of thing nobody notices until their profile is
 * public and they meant it not to be.
 */
export async function updatePromise(
  session: SessionUser,
  input: { title: string; visibility: string },
): Promise<SettingsError | null> {
  const titleError = validatePromiseTitle(input.title)
  if (titleError === 'empty') return 'empty_promise'
  if (titleError === 'too_long') return 'promise_too_long'

  if (!isVisibility(input.visibility)) return 'invalid_visibility'

  const title = input.title.trim()

  try {
    return await withUser(session.id, async (tx) => {
      const rows = await tx
        .update(promises)
        .set({ title, visibility: input.visibility })
        // The row policy already restricts this to the caller's own rows; the
        // predicate is here so a user with several promises (a roadmap item)
        // still edits only their own, and so the statement says out loud what
        // it targets.
        .where(eq(promises.user_id, session.id))
        .returning({ id: promises.id })

      // Zero rows is not success. It means the promise is gone — or that a
      // policy silently filtered the row — and reporting "saved" for a write
      // that changed nothing is the silent-failure this project has already
      // been bitten by twice.
      return rows.length > 0 ? null : 'not_found'
    })
  } catch {
    return 'unknown'
  }
}

/**
 * Changes the zone the day boundary is measured in.
 *
 * Deliberately does not rewrite history: `checkins.local_date` was computed
 * against the zone in force at the time and there is no original offset stored
 * to recompute it from. The screen says so before the change is made — see
 * `docs/debt.md` C4. Opening a path to a known limitation means announcing the
 * limitation on that path.
 */
export async function updateTimezone(
  session: SessionUser,
  timezone: string,
): Promise<SettingsError | null> {
  if (!isKnownTimezone(timezone)) return 'unknown_timezone'

  try {
    return await withUser(session.id, async (tx) => {
      const rows = await tx
        .update(users)
        .set({ timezone })
        .where(eq(users.id, session.id))
        .returning({ id: users.id })

      return rows.length > 0 ? null : 'not_found'
    })
  } catch {
    return 'unknown'
  }
}

/**
 * Deletes the account and everything hanging off it.
 *
 * The delete targets `auth.users`, not `public.users`: removing only the
 * profile would leave the login behind, holding the email address in a state
 * where it can neither be used nor registered again.
 *
 * No role the app runs as may touch `auth.users`, so this calls
 * `private.delete_own_account()` — a `security definer` function that takes no
 * arguments and derives its target from the verified JWT. See migration 0006
 * for why it is shaped that way, and 0007 for why it lives in `private`:
 * PostgREST publishes `public`, and a schema it does not route is a stronger
 * guarantee than a grant. The cascade from `users_id_auth_users_id_fk` removes
 * the profile, promises, checkins and freezes.
 *
 * Verified against a live database inside a rolled-back transaction: the
 * caller's rows vanish, a second account in the same transaction is untouched.
 */
export async function deleteAccount(
  session: SessionUser,
): Promise<SettingsError | null> {
  try {
    await withUser(session.id, async (tx) => {
      await tx.execute(sql`select private.delete_own_account()`)
    })
    return null
  } catch {
    return 'unknown'
  }
}
