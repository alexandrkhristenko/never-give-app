import 'server-only'
import { cache } from 'react'
import { eq, sql } from 'drizzle-orm'
import { users } from '@/db/schema'
import { withAnon, withUser } from '@/db/rls'
import { logWarn } from '@/lib/log'
import { isKnownTimezone } from '@/lib/validation'
import { getSessionUser } from './session'

/** The signed-in user's own profile. Never leaves the server with `email`. */
export interface Profile {
  id: string
  username: string
  timezone: string
  avatarLevel: number
  freezeBalance: number
}

/** What a public visitor is allowed to know about a user. */
export interface PublicProfile {
  id: string
  username: string
  timezone: string
  avatarLevel: number
}

export const getProfile = cache(async (): Promise<Profile | null> => {
  const session = await getSessionUser()
  if (!session) return null

  const rows = await withUser(session.id, (tx) =>
    tx
      .select({
        id: users.id,
        username: users.username,
        timezone: users.timezone,
        avatarLevel: users.avatar_level,
        freezeBalance: users.streak_freezes_balance,
      })
      .from(users)
      .where(eq(users.id, session.id))
      .limit(1),
  )

  const profile = rows[0] ?? null

  // `localDateOf` falls back to UTC for a zone this runtime cannot resolve,
  // which keeps one stale row from taking a page down — and makes the row
  // invisible while it quietly computes the wrong day boundary. Noticing it
  // belongs here rather than in `lib/dates`: that module is pure and called
  // once per date, this runs once per request and knows whose row it is.
  if (profile && !isKnownTimezone(profile.timezone)) {
    logWarn('profile.timezone_unresolvable', {
      userId: profile.id,
      timezone: profile.timezone,
    })
  }

  return profile
})

/** Looks a profile up by username, case-insensitively, as an anonymous reader. */
export const getPublicProfile = cache(
  async (username: string): Promise<PublicProfile | null> => {
    const rows = await withAnon((tx) =>
      tx
        .select({
          id: users.id,
          username: users.username,
          timezone: users.timezone,
          avatarLevel: users.avatar_level,
        })
        .from(users)
        .where(sql`lower(${users.username}) = ${username.toLowerCase()}`)
        .limit(1),
    )

    return rows[0] ?? null
  },
)
