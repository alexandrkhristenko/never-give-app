import 'server-only'
import { sql } from 'drizzle-orm'
import { users } from '@/db/schema'
import { withAnon } from '@/db/rls'

/**
 * Whether a username is already claimed.
 *
 * Read as `anon`, which needs no new privilege: `users_select_public` is
 * `using (true)` and `anon` holds a column grant covering `username`.
 * `getPublicProfile` has been doing the same read since the profile page
 * existed.
 *
 * That contradicts the frontend spec, which deferred the live check on the
 * grounds that it "requires reading other users' rows, which RLS forbids by
 * construction, so a correct implementation needs a SECURITY DEFINER function
 * and a migration". The premise is wrong, and it was worth checking before
 * writing the migration it called for: as `anon` this query returns the answer,
 * while `select email` from the same table is refused with 42501. The grant is
 * per column, not per row.
 *
 * Nor does answering leak anything new. `/<username>` already renders
 * differently for a name that exists, so existence is public whatever this
 * function does. What the endpoint adds is *speed*, which is why it is behind
 * a rate limit.
 *
 * Compared case-insensitively, matching `users_username_lower_idx` — otherwise
 * the form would call a name free that the insert then rejects.
 */
export async function isUsernameTaken(username: string): Promise<boolean> {
  const rows = await withAnon((tx) =>
    tx
      .select({ id: users.id })
      .from(users)
      .where(sql`lower(${users.username}) = ${username.toLowerCase()}`)
      .limit(1),
  )

  return rows.length > 0
}
