import { afterAll, afterEach, describe, expect, it } from 'vitest'
import postgres from 'postgres'
import { announceTestDatabase, testDatabaseUrl } from './connection'
import { isUsernameTaken } from '@/lib/dal/username'

/**
 * The live availability check.
 *
 * Worth an integration test for one reason: the frontend spec deferred this
 * feature on the belief that RLS forbids reading another user's row, and that
 * a `SECURITY DEFINER` function and a migration would be needed. It does not,
 * and they are not — `users_select_public` is `using (true)` and `anon` holds
 * a column grant that covers `username` but not `email`. These tests pin that
 * down so the next person does not have to re-derive it, and so a migration
 * that narrows the grant fails here rather than in production.
 */

announceTestDatabase()
const sql = postgres(testDatabaseUrl(), { prepare: false, max: 1 })
const OCCUPANT = '00000000-0000-0000-0000-00000000ca7e'

async function claim(username: string) {
  await sql`insert into auth.users (id, instance_id, aud, role, email)
            values (${OCCUPANT}, '00000000-0000-0000-0000-000000000000',
                    'authenticated', 'authenticated', 'occupant@never-give.test')
            on conflict (id) do nothing`
  await sql`insert into public.users (id, email, username, timezone)
            values (${OCCUPANT}, 'occupant@never-give.test', ${username}, 'UTC')`
}

afterEach(async () => {
  await sql`delete from public.users where id = ${OCCUPANT}`
  await sql`delete from auth.users where id = ${OCCUPANT}`
})

afterAll(async () => {
  await sql.end()
})

describe('isUsernameTaken', () => {
  it('reports a free name as free', async () => {
    expect(await isUsernameTaken('nobodyhasthis')).toBe(false)
  })

  it('reports a claimed name as taken', async () => {
    await claim('occupied')
    expect(await isUsernameTaken('occupied')).toBe(true)
  })

  it('matches the case-insensitive index, not the raw column', async () => {
    await claim('MixedCase')

    // `users_username_lower_idx` is what the insert will trip. A check that
    // compared exactly would call these free and then fail on submit — the
    // form would be confidently wrong twice in a row.
    expect(await isUsernameTaken('mixedcase')).toBe(true)
    expect(await isUsernameTaken('MIXEDCASE')).toBe(true)
  })

  it('answers as anon without reaching anything else on the row', async () => {
    await claim('occupied')

    // The read runs under `withAnon`. If that role ever loses its column grant
    // on `username`, this throws rather than quietly reporting every name free
    // — which would let two people take the same one.
    await expect(isUsernameTaken('occupied')).resolves.toBe(true)

    const [row] = await sql`
      select has_column_privilege('anon', 'public.users', 'username', 'select') as username,
             has_column_privilege('anon', 'public.users', 'email', 'select') as email`
    expect(row.username).toBe(true)
    expect(row.email).toBe(false)
  })
})
