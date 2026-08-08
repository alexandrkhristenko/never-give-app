import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import postgres from 'postgres'
import { createProfileAndPromise } from '@/lib/dal/promise'
import { PROMISE_MAX_LENGTH } from '@/lib/validation'

/**
 * Integration coverage for onboarding.
 *
 * The interesting failures here are the ones only a database can produce. A
 * taken username is not rejected by any validator — it surfaces as a unique
 * violation that the DAL has to recognise by the *name* of the constraint it
 * tripped, and there are two of them: the plain unique constraint and the
 * case-insensitive index. An email collision trips a third and must not be
 * reported as a username problem. None of that is reachable from a unit test.
 *
 * `docs/product-spec.md` §7 lists "онбординг показывает внятную ошибку на
 * занятом username" as a done criterion; this is where it is checked.
 */

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 })

/** A second identity, so a name can genuinely be taken by somebody else. */
const SQUATTER = '00000000-0000-0000-0000-00000000beef'

let session: { id: string; email: string }

const validInput = {
  username: 'newcomer',
  promiseTitle: 'Ship every day',
  visibility: 'public',
  timezone: 'UTC',
}

beforeAll(async () => {
  const [auth] = await sql`select id, email from auth.users limit 1`
  if (!auth) throw new Error('no auth.users row to onboard against')
  session = { id: auth.id, email: auth.email ?? 'onboarding@never-give.test' }
})

/**
 * Plants a profile owned by somebody other than the session user. The foreign
 * key to `auth.users` is deferred here by inserting through the privileged
 * connection — the point is to occupy a username, not to model a real signup.
 */
async function squatOn(username: string) {
  await sql`delete from public.users where id = ${SQUATTER}`
  await sql`insert into auth.users (id, instance_id, aud, role, email)
            values (${SQUATTER}, '00000000-0000-0000-0000-000000000000',
                    'authenticated', 'authenticated', ${'squatter@never-give.test'})
            on conflict (id) do nothing`
  await sql`insert into public.users (id, email, username, timezone)
            values (${SQUATTER}, ${'squatter@never-give.test'}, ${username}, 'UTC')`
}

afterEach(async () => {
  await sql`delete from public.users where id in (${session.id}, ${SQUATTER})`
  await sql`delete from auth.users where id = ${SQUATTER}`
})

afterAll(async () => {
  await sql.end()
})

const profileCount = async () =>
  (await sql`select count(*)::int as n from public.users where id = ${session.id}`)[0]
    .n as number

describe('createProfileAndPromise', () => {
  it('creates the profile and its first promise', async () => {
    expect(await createProfileAndPromise(session, validInput)).toBeNull()

    const promises = await sql`select title, visibility from public.promises
                               where user_id = ${session.id}`
    expect(promises).toHaveLength(1)
    expect(promises[0].title).toBe('Ship every day')
    expect(promises[0].visibility).toBe('public')
  })

  it('reports a username somebody else already holds', async () => {
    await squatOn('taken')

    const error = await createProfileAndPromise(session, {
      ...validInput,
      username: 'taken',
    })

    expect(error).toBe('username_taken')
    // Nothing half-written: the whole thing is one transaction.
    expect(await profileCount()).toBe(0)
  })

  it('treats a differently-cased name as the same taken name', async () => {
    await squatOn('Taken')

    // product-spec §6: `Player1` and `player1` are one name. That rule lives in
    // a case-insensitive index, so only the database can enforce it.
    expect(
      await createProfileAndPromise(session, { ...validInput, username: 'tAkEn' }),
    ).toBe('username_taken')
  })

  it('rejects a reserved name before touching the database', async () => {
    expect(
      await createProfileAndPromise(session, { ...validInput, username: 'dashboard' }),
    ).toBe('reserved_username')
    expect(await profileCount()).toBe(0)
  })

  it('rejects a malformed name', async () => {
    expect(
      await createProfileAndPromise(session, { ...validInput, username: 'no' }),
    ).toBe('invalid_username')
  })

  it('rejects an empty promise and one past the length limit', async () => {
    expect(
      await createProfileAndPromise(session, { ...validInput, promiseTitle: '   ' }),
    ).toBe('empty_promise')
    expect(
      await createProfileAndPromise(session, {
        ...validInput,
        promiseTitle: 'a'.repeat(PROMISE_MAX_LENGTH + 1),
      }),
    ).toBe('promise_too_long')
  })

  it('falls back to UTC for a timezone this runtime does not know', async () => {
    // A browser can report a zone newer than the server's ICU. Storing it
    // unchecked used to make every later page render throw, with no way back.
    expect(
      await createProfileAndPromise(session, {
        ...validInput,
        timezone: 'Mars/Olympus_Mons',
      }),
    ).toBeNull()

    const [row] = await sql`select timezone from public.users where id = ${session.id}`
    expect(row.timezone).toBe('UTC')
  })

  it('keeps a timezone the runtime does know', async () => {
    expect(
      await createProfileAndPromise(session, {
        ...validInput,
        timezone: 'Europe/Kyiv',
      }),
    ).toBeNull()

    const [row] = await sql`select timezone from public.users where id = ${session.id}`
    expect(row.timezone).toBe('Europe/Kyiv')
  })

  it('is idempotent: a replayed submission does not create a second promise', async () => {
    expect(await createProfileAndPromise(session, validInput)).toBeNull()
    expect(await createProfileAndPromise(session, validInput)).toBeNull()

    const promises = await sql`select id from public.promises
                               where user_id = ${session.id}`
    expect(promises).toHaveLength(1)
  })

  it('normalises an unexpected visibility to public rather than storing it', async () => {
    // The column is free text guarded by a CHECK, and the RLS predicate is an
    // allow-list. A value that reached the row unrecognised would be a promise
    // its owner cannot see the true state of.
    expect(
      await createProfileAndPromise(session, { ...validInput, visibility: 'PRIVATE' }),
    ).toBeNull()

    const [row] = await sql`select visibility from public.promises
                            where user_id = ${session.id}`
    expect(row.visibility).toBe('public')
  })
})
