import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import postgres from 'postgres'
import { checkIn, getOwnPromiseView } from '@/lib/dal/promise'
import type { Profile } from '@/lib/dal/user'
import { addDays } from '@/lib/dates'
import { MAX_FREEZE_BALANCE } from '@/lib/streak'

/**
 * Integration coverage for the freeze mechanic — the rule that distinguishes
 * this product, and the one the unit tests cannot reach.
 *
 * `planFreezes` is pure and well covered, but everything that makes it *work*
 * lives outside it: the row lock, the column grants the `authenticated` role
 * holds, the RLS policies on `streak_freezes`, and the order the DAL performs
 * its writes in. This file exercises the real functions against the real
 * database, so a broken grant or a reordered statement fails here rather than
 * in production.
 *
 * `now` is passed explicitly everywhere, so the tests do not depend on when
 * they run.
 */

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 })

const NOW = new Date('2026-08-10T12:00:00Z')
const TODAY = '2026-08-10'
const day = (offset: number) => addDays(TODAY, offset)

let profile: Profile

beforeAll(async () => {
  const [auth] = await sql`select id, email from auth.users limit 1`
  if (!auth) throw new Error('no auth.users row to attach a test profile to')

  profile = {
    id: auth.id,
    username: 'freezetest',
    timezone: 'UTC',
    avatarLevel: 1,
    freezeBalance: 0,
  }

  await sql`delete from public.users where id = ${auth.id}`
})

/** Rebuilds the world for one case. Cascades clear promises and their children. */
async function seed(options: {
  checkins: string[]
  frozen?: string[]
  balance: number
}) {
  await sql`delete from public.users where id = ${profile.id}`
  await sql`insert into public.users (id, email, username, timezone, streak_freezes_balance)
            values (${profile.id}, ${'freeze@never-give.test'}, ${profile.username},
                    ${profile.timezone}, ${options.balance})`

  const [promise] = await sql`insert into public.promises (user_id, title, visibility)
            values (${profile.id}, ${'Ship every day'}, 'public') returning id`

  if (options.checkins.length > 0) {
    await sql`insert into public.checkins ${sql(
      options.checkins.map((local_date) => ({ promise_id: promise.id, local_date })),
    )}`
  }
  if (options.frozen?.length) {
    await sql`insert into public.streak_freezes ${sql(
      options.frozen.map((local_date) => ({ promise_id: promise.id, local_date })),
    )}`
  }
  return promise.id as string
}

/**
 * Cast to text on the way out: the raw driver parses a `date` column into a JS
 * `Date`, while Drizzle hands the application a `YYYY-MM-DD` string. Comparing
 * against the latter is what the assertions here mean.
 */
const frozenDates = async (promiseId: string) =>
  (
    await sql`select local_date::text as local_date from public.streak_freezes
              where promise_id = ${promiseId} order by local_date`
  ).map((row) => row.local_date as string)

const storedBalance = async () =>
  (
    await sql`select streak_freezes_balance as b from public.users where id = ${profile.id}`
  )[0].b as number

afterEach(async () => {
  await sql`delete from public.users where id = ${profile.id}`
})

afterAll(async () => {
  await sql.end()
})

describe('spending freezes', () => {
  it('covers a single missed day and decrements the balance', async () => {
    // Checked in through the day before yesterday, then missed yesterday.
    const promiseId = await seed({
      checkins: [day(-4), day(-3), day(-2)],
      balance: 2,
    })

    const view = await getOwnPromiseView({ ...profile, freezeBalance: 2 }, NOW)

    expect(await frozenDates(promiseId)).toEqual([day(-1)])
    expect(await storedBalance()).toBe(1)
    // The chain survives: four covered days ending yesterday.
    expect(view?.currentStreak).toBe(4)
    expect(view?.freezeBalance).toBe(1)
  })

  it('spends nothing when the balance cannot cover the whole gap', async () => {
    // Four completed days missed, only two freezes to spend.
    const promiseId = await seed({
      checkins: [day(-9), day(-8), day(-7), day(-6), day(-5)],
      balance: 2,
    })

    const view = await getOwnPromiseView({ ...profile, freezeBalance: 2 }, NOW)

    // All or nothing: a partly rescued chain would break anyway, so the
    // freezes are kept for a gap they can actually close.
    expect(await frozenDates(promiseId)).toEqual([])
    expect(await storedBalance()).toBe(2)
    expect(view?.currentStreak).toBe(0)
    expect(view?.bestStreak).toBe(5)
  })

  it('never pays for the same day twice', async () => {
    const promiseId = await seed({
      checkins: [day(-3), day(-2)],
      frozen: [day(-1)],
      balance: 1,
    })

    await getOwnPromiseView({ ...profile, freezeBalance: 1 }, NOW)
    await getOwnPromiseView({ ...profile, freezeBalance: 1 }, NOW)

    expect(await frozenDates(promiseId)).toEqual([day(-1)])
    expect(await storedBalance()).toBe(1)
  })

  it('leaves today alone — it is not missed until it is over', async () => {
    const promiseId = await seed({ checkins: [day(-1)], balance: 3 })

    const view = await getOwnPromiseView({ ...profile, freezeBalance: 3 }, NOW)

    expect(await frozenDates(promiseId)).toEqual([])
    expect(await storedBalance()).toBe(3)
    // Grace on the unfinished day: yesterday still anchors a live streak.
    expect(view?.currentStreak).toBe(1)
  })
})

describe('earning freezes', () => {
  it('grants one when the check-in completes a seventh day', async () => {
    await seed({
      checkins: [day(-6), day(-5), day(-4), day(-3), day(-2), day(-1)],
      balance: 0,
    })

    const result = await checkIn({ ...profile, freezeBalance: 0 }, NOW)

    expect(result).toEqual({ alreadyCheckedIn: false, earnedFreeze: true })
    expect(await storedBalance()).toBe(1)
  })

  it('grants nothing on a day that is not a multiple of seven', async () => {
    await seed({ checkins: [day(-2), day(-1)], balance: 0 })

    const result = await checkIn({ ...profile, freezeBalance: 0 }, NOW)

    expect(result).toEqual({ alreadyCheckedIn: false, earnedFreeze: false })
    expect(await storedBalance()).toBe(0)
  })

  it('does not exceed the cap', async () => {
    await seed({
      checkins: [day(-6), day(-5), day(-4), day(-3), day(-2), day(-1)],
      balance: MAX_FREEZE_BALANCE,
    })

    const result = await checkIn(
      { ...profile, freezeBalance: MAX_FREEZE_BALANCE },
      NOW,
    )

    expect(result?.earnedFreeze).toBe(false)
    expect(await storedBalance()).toBe(MAX_FREEZE_BALANCE)
  })

  it('is idempotent: a repeat check-in writes nothing and earns nothing', async () => {
    const promiseId = await seed({
      checkins: [day(-6), day(-5), day(-4), day(-3), day(-2), day(-1)],
      balance: 0,
    })

    const first = await checkIn({ ...profile, freezeBalance: 0 }, NOW)
    const second = await checkIn({ ...profile, freezeBalance: 1 }, NOW)

    expect(first?.earnedFreeze).toBe(true)
    expect(second).toEqual({ alreadyCheckedIn: true, earnedFreeze: false })

    const rows = await sql`select count(*)::int as n from public.checkins
                           where promise_id = ${promiseId} and local_date = ${TODAY}`
    expect(rows[0].n).toBe(1)
    // The second call must not stack a second freeze on top of the first.
    expect(await storedBalance()).toBe(1)
  })

  it('returns null when the user has no promise at all', async () => {
    await sql`delete from public.users where id = ${profile.id}`
    await sql`insert into public.users (id, email, username, timezone)
              values (${profile.id}, ${'freeze@never-give.test'}, ${profile.username}, 'UTC')`

    // Distinct from a real check-in that simply earned nothing — a caller that
    // conflated the two would render success over an operation that wrote
    // nothing.
    expect(await checkIn({ ...profile, freezeBalance: 0 }, NOW)).toBeNull()
  })
})

describe('spending and earning in one call', () => {
  it('closes a gap and then earns on the same check-in', async () => {
    // Five straight days, yesterday missed, one freeze in hand. Covering
    // yesterday makes today the seventh consecutive covered day.
    const promiseId = await seed({
      checkins: [day(-6), day(-5), day(-4), day(-3), day(-2)],
      balance: 1,
    })

    const result = await checkIn({ ...profile, freezeBalance: 1 }, NOW)

    expect(await frozenDates(promiseId)).toEqual([day(-1)])
    expect(result?.earnedFreeze).toBe(true)
    // Spent one to close the gap, earned one for the seventh day.
    expect(await storedBalance()).toBe(1)

    const view = await getOwnPromiseView({ ...profile, freezeBalance: 1 }, NOW)
    expect(view?.currentStreak).toBe(7)
  })
})
