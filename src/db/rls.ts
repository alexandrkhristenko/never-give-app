import 'server-only'
import { sql } from 'drizzle-orm'
import { db } from './index'

/** The transaction handle Drizzle hands to a `db.transaction` callback. */
export type DbTransaction = Parameters<
  Parameters<typeof db.transaction>[0]
>[0]

/**
 * Runs `fn` as the Postgres `authenticated` role with `auth.uid()` bound to
 * `userId`, so every RLS policy applies.
 *
 * `userId` must come from `supabase.auth.getUser()`, which verifies the token
 * server-side. Never pass an id read straight from a cookie.
 */
export async function withUser<T>(
  userId: string,
  fn: (tx: DbTransaction) => Promise<T>,
): Promise<T> {
  const claims = JSON.stringify({ sub: userId, role: 'authenticated' })

  return db.transaction(async (tx) => {
    // Claims first: after the role switch we no longer have the privileges to
    // set them. `true` makes both settings transaction-local, which is what
    // keeps a pooled connection from leaking a role to the next request.
    await tx.execute(sql`select set_config('request.jwt.claims', ${claims}, true)`)
    await tx.execute(sql`select set_config('role', 'authenticated', true)`)

    return fn(tx)
  })
}

/**
 * Runs `fn` as the Postgres `anon` role. Only rows a public visitor may see
 * are returned. Used by the public profile and its OG image.
 */
export async function withAnon<T>(
  fn: (tx: DbTransaction) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('request.jwt.claims', null, true)`)
    await tx.execute(sql`select set_config('role', 'anon', true)`)

    return fn(tx)
  })
}
