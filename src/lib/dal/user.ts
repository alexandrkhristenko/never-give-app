import 'server-only'
import { cache } from 'react'
import { eq, sql } from 'drizzle-orm'
import { users } from '@/db/schema'
import { withAnon, withUser } from '@/db/rls'
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

  return rows[0] ?? null
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
