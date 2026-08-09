import { test as base } from '@playwright/test'
import postgres from 'postgres'

/**
 * A throwaway account for one test, created in the database rather than through
 * the Admin API.
 *
 * The Admin API is the supported way to do this, and it was the first attempt.
 * It needs `SUPABASE_SERVICE_ROLE_KEY`, which is deliberately absent: anything
 * the app's server runtime can read must not be able to bypass row-level
 * security. So the whole suite skipped, and had never once run.
 *
 * A skipped suite is worth less than an unsupported one. `DATABASE_URL` is
 * already present — the app cannot start without it — and `db/settings.test.ts`
 * already writes to `auth.users` this way. What was missing was only the
 * password: GoTrue verifies `encrypted_password` as bcrypt, and `pgcrypto`
 * lives in the `extensions` schema of every Supabase project. Verified against
 * the live project: a row seeded this way returns 200 from the password grant.
 *
 * The cost is real and worth stating. This depends on the shape of a schema
 * Supabase owns and may change without notice. If a GoTrue upgrade breaks it,
 * the failure is loud — sign-in stops working in this suite and nowhere else —
 * and the fix is the service-role key in `.env.test.local`, at which point this
 * file goes back to `auth.admin.createUser`.
 */

const CONNECTION = process.env.DATABASE_URL

export const hasDatabaseAccess = Boolean(CONNECTION)

export const missingDatabaseReason =
  'DATABASE_URL is not set. It belongs in .env.local, next to the Supabase keys.'

/**
 * Built on demand, not at import time. A module-level client would throw before
 * Playwright has collected anything and take down the suites that need no
 * session at all.
 */
let client: ReturnType<typeof postgres> | null = null

function sql() {
  if (!CONNECTION) throw new Error(missingDatabaseReason)
  client ??= postgres(CONNECTION, { prepare: false, max: 1 })
  return client
}

export interface TestUser {
  id: string
  email: string
  password: string
  username: string
}

/**
 * The columns GoTrue reads on sign-in, and nothing more.
 *
 * `email_confirmed_at` stands in for the verification mail a browser test
 * cannot complete. The four token columns are set to the empty string rather
 * than left null because GoTrue scans them into Go strings, where null is not
 * a value.
 */
async function seedAccount(email: string, password: string) {
  const [row] = await sql()`
    insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data,
      confirmation_token, recovery_token, email_change_token_new, email_change)
    values (
      gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
      'authenticated', 'authenticated', ${email},
      extensions.crypt(${password}, extensions.gen_salt('bf')),
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
      '', '', '', '')
    returning id`
  return row.id as string
}

export const test = base.extend<{ user: TestUser }>({
  user: async ({}, use, testInfo) => {
    const stamp = `${Date.now()}${testInfo.workerIndex}`
    const email = `e2e-${stamp}@never-give.test`
    const password = `Pw-${stamp}-aA1!`
    const username = `e2e_${stamp}`.slice(0, 20)

    const id = await seedAccount(email, password)

    await use({ id, email, password, username })

    // Cascades through public.users, promises, checkins and streak_freezes.
    await sql()`delete from auth.users where id = ${id}`
  },
})

/**
 * Playwright leaves the process running until every handle is closed, and a
 * pooled connection is a handle.
 */
base.afterAll(async () => {
  await client?.end()
  client = null
})

export { expect } from '@playwright/test'
