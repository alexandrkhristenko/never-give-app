import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import postgres from 'postgres'
import { announceTestDatabase, testDatabaseUrl } from './connection'
import {
  deleteAccount,
  updatePromise,
  updateTimezone,
} from '@/lib/dal/settings'

/**
 * Integration coverage for the settings screen.
 *
 * Everything worth checking here is enforced by the database rather than by
 * application code: which columns the `authenticated` role may write, whether
 * a policy quietly filters a row instead of raising, and whether deleting an
 * account really reaches `auth.users` and cascades from there. None of it is
 * observable from a unit test, and all of it is the kind of thing a later
 * migration can silently widen.
 *
 * The deletion tests never touch the real account this suite runs against.
 * They create a disposable identity and delete that — see `disposable()`.
 */

announceTestDatabase()
const sql = postgres(testDatabaseUrl(), { prepare: false, max: 1 })

/** A second identity, so "somebody else's row" is a real row. */
const STRANGER = '00000000-0000-0000-0000-0000000dbeef'

let session: { id: string; email: string }

beforeAll(async () => {
  const [auth] = await sql`select id, email from auth.users limit 1`
  if (!auth) throw new Error('no auth.users row to run settings against')
  session = { id: auth.id, email: auth.email ?? 'settings@never-give.test' }
})

async function seedProfile(id: string, username: string, email: string) {
  await sql`insert into public.users (id, email, username, timezone)
            values (${id}, ${email}, ${username}, 'UTC')
            on conflict (id) do update set username = excluded.username`
}

async function seedPromise(id: string, title = 'Original promise') {
  const [row] = await sql`
    insert into public.promises (user_id, title, visibility, cadence, status)
    values (${id}, ${title}, 'public', 'daily', 'active')
    returning id, updated_at`
  return row as { id: string; updated_at: Date }
}

/**
 * An auth identity that exists only to be destroyed.
 *
 * `deleteAccount` removes the row in `auth.users`, and the suite's own
 * `session` is the project's real account — pointing the test at it would
 * delete the thing every other test needs.
 */
async function disposable(username: string) {
  const [row] = await sql`
    insert into auth.users (id, instance_id, aud, role, email)
    values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
            'authenticated', 'authenticated', ${username + '@never-give.test'})
    returning id, email`
  await seedProfile(row.id, username, row.email)
  await seedPromise(row.id)
  return { id: row.id as string, email: row.email as string }
}

const promisesOf = async (id: string) =>
  (await sql`select * from public.promises where user_id = ${id}`) as Array<{
    title: string
    visibility: string
    status: string
    updated_at: Date
  }>

afterEach(async () => {
  await sql`delete from public.users where id in (${session.id}, ${STRANGER})`
  await sql`delete from auth.users
            where email like '%@never-give.test' and id <> ${session.id}`
})

afterAll(async () => {
  await sql.end()
})

describe('updatePromise', () => {
  it('saves a new title and visibility together', async () => {
    await seedProfile(session.id, 'settingsuser', session.email)
    await seedPromise(session.id)

    expect(
      await updatePromise(session, {
        title: '  Run every morning  ',
        visibility: 'unlisted',
      }),
    ).toBeNull()

    const [row] = await promisesOf(session.id)
    // Trimmed, the way the title is trimmed at onboarding.
    expect(row.title).toBe('Run every morning')
    expect(row.visibility).toBe('unlisted')
  })

  it('accepts private — the value no form could reach before', async () => {
    await seedProfile(session.id, 'settingsuser', session.email)
    await seedPromise(session.id)

    expect(
      await updatePromise(session, { title: 'Quiet goal', visibility: 'private' }),
    ).toBeNull()

    const [row] = await promisesOf(session.id)
    expect(row.visibility).toBe('private')
  })

  it('rejects a visibility the CHECK constraint would refuse', async () => {
    await seedProfile(session.id, 'settingsuser', session.email)
    await seedPromise(session.id)

    expect(
      await updatePromise(session, { title: 'Fine', visibility: 'secret' }),
    ).toBe('invalid_visibility')

    // Refused before the statement ran, so nothing changed.
    const [row] = await promisesOf(session.id)
    expect(row.title).toBe('Original promise')
    expect(row.visibility).toBe('public')
  })

  it('rejects an empty title and one past the limit', async () => {
    await seedProfile(session.id, 'settingsuser', session.email)
    await seedPromise(session.id)

    expect(
      await updatePromise(session, { title: '   ', visibility: 'public' }),
    ).toBe('empty_promise')
    expect(
      await updatePromise(session, {
        title: 'x'.repeat(200),
        visibility: 'public',
      }),
    ).toBe('promise_too_long')
  })

  it('reports not_found instead of claiming success when there is no promise', async () => {
    await seedProfile(session.id, 'settingsuser', session.email)

    // A write that matches no rows is the silent failure this project has
    // already shipped twice. It must not read as "saved".
    expect(
      await updatePromise(session, { title: 'Nothing to edit', visibility: 'public' }),
    ).toBe('not_found')
  })

  it("cannot reach another user's promise", async () => {
    await seedProfile(session.id, 'settingsuser', session.email)
    await sql`insert into auth.users (id, instance_id, aud, role, email)
              values (${STRANGER}, '00000000-0000-0000-0000-000000000000',
                      'authenticated', 'authenticated', 'stranger@never-give.test')
              on conflict (id) do nothing`
    await seedProfile(STRANGER, 'stranger', 'stranger@never-give.test')
    await seedPromise(STRANGER, 'Their promise')

    // No promise of their own, so a leaking policy would show up as success.
    expect(
      await updatePromise(session, { title: 'Hijacked', visibility: 'public' }),
    ).toBe('not_found')

    const [theirs] = await promisesOf(STRANGER)
    expect(theirs.title).toBe('Their promise')
  })

  it('lets the trigger move updated_at without granting the column', async () => {
    await seedProfile(session.id, 'settingsuser', session.email)
    const seeded = await seedPromise(session.id)
    // The trigger fires on UPDATE only, so the stale value has to be planted
    // at insert time — an UPDATE would be overwritten by the trigger itself.
    await sql`update public.promises set updated_at = now() - interval '1 day'
              where id = ${seeded.id}`
    const [before] = await promisesOf(session.id)

    await updatePromise(session, { title: 'Edited', visibility: 'public' })

    const [after] = await promisesOf(session.id)
    expect(after.updated_at.getTime()).toBeGreaterThan(before.updated_at.getTime())
  })

  it('leaves columns outside the grant alone', async () => {
    await seedProfile(session.id, 'settingsuser', session.email)
    await seedPromise(session.id)

    await updatePromise(session, { title: 'Edited', visibility: 'public' })

    const [row] = await promisesOf(session.id)
    expect(row.status).toBe('active')

    // The guard that matters for later migrations: the grant itself is narrow.
    // Widening it back to the whole table would let an edit carry `status`,
    // `cadence` or `created_at`, which no row policy checks.
    const granted = await sql`
      select column_name from information_schema.column_privileges
      where table_name = 'promises' and grantee = 'authenticated'
        and privilege_type = 'UPDATE' order by column_name`
    expect(granted.map((r) => r.column_name)).toEqual(['title', 'visibility'])
  })
})

describe('updateTimezone', () => {
  it('stores a zone this runtime knows', async () => {
    await seedProfile(session.id, 'settingsuser', session.email)

    expect(await updateTimezone(session, 'Europe/Kyiv')).toBeNull()

    const [row] = await sql`select timezone from public.users where id = ${session.id}`
    expect(row.timezone).toBe('Europe/Kyiv')
  })

  it('refuses an unknown zone rather than silently storing UTC', async () => {
    await seedProfile(session.id, 'settingsuser', session.email)

    // Onboarding falls back to UTC on purpose; settings must not, because here
    // the person chose the value and would never be told it was discarded.
    expect(await updateTimezone(session, 'Mars/Olympus_Mons')).toBe(
      'unknown_timezone',
    )

    const [row] = await sql`select timezone from public.users where id = ${session.id}`
    expect(row.timezone).toBe('UTC')
  })

  it('does not rewrite the dates already recorded', async () => {
    await seedProfile(session.id, 'settingsuser', session.email)
    const promise = await seedPromise(session.id)
    await sql`insert into public.checkins (promise_id, local_date)
              values (${promise.id}, '2026-01-15')`

    await updateTimezone(session, 'Pacific/Kiritimati')

    // Documented in docs/debt.md C4 and announced on the settings screen
    // before the change. This test is what keeps the two honest: if history
    // ever does get recomputed, the warning has to come down with it.
    // Cast in SQL: the driver hands back a `date` as a JS Date, whose string
    // form is a local-time rendering and would compare against the wrong thing.
    const [row] = await sql`select local_date::text as local_date
                            from public.checkins where promise_id = ${promise.id}`
    expect(row.local_date).toBe('2026-01-15')
  })
})

describe('deleteAccount', () => {
  it('removes the auth row and everything cascading from it', async () => {
    const doomed = await disposable('doomed')

    expect(await deleteAccount(doomed)).toBeNull()

    const auth = await sql`select 1 from auth.users where id = ${doomed.id}`
    const profile = await sql`select 1 from public.users where id = ${doomed.id}`
    const promises = await sql`select 1 from public.promises where user_id = ${doomed.id}`

    // Deleting only public.users would leave the login behind, holding the
    // email address in a state where it can neither be used nor re-registered.
    expect(auth).toHaveLength(0)
    expect(profile).toHaveLength(0)
    expect(promises).toHaveLength(0)
  })

  it('deletes only the caller, never a neighbour', async () => {
    const doomed = await disposable('doomed')
    const bystander = await disposable('bystander')

    expect(await deleteAccount(doomed)).toBeNull()

    const survivor = await sql`select 1 from auth.users where id = ${bystander.id}`
    const theirPromise = await sql`select 1 from public.promises where user_id = ${bystander.id}`
    expect(survivor).toHaveLength(1)
    expect(theirPromise).toHaveLength(1)
  })
})
