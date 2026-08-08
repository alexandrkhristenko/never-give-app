import { afterAll, afterEach, describe, expect, it } from 'vitest'
import postgres from 'postgres'
import { spendBudget } from '@/lib/rate-limit'

/**
 * The rate limiter, exercised against the database that actually enforces it.
 *
 * Every property worth having here is a database property. Whether two
 * simultaneous requests can both believe they were under the limit is decided
 * by whether the increment takes a row lock. Whether the limiter can be read or
 * reset by a caller is decided by grants. Neither is visible from the
 * application code, which sees only a boolean.
 */

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 5 })

const bucket = (name: string) => `test:${name}`

afterEach(async () => {
  await sql`delete from private.rate_limits where bucket like 'test:%'`
})

afterAll(async () => {
  await sql.end()
})

describe('spendBudget', () => {
  it('allows exactly the limit and then stops', async () => {
    const key = bucket('basic')

    expect(await spendBudget(key, 3, 60)).toBe(true)
    expect(await spendBudget(key, 3, 60)).toBe(true)
    expect(await spendBudget(key, 3, 60)).toBe(true)
    expect(await spendBudget(key, 3, 60)).toBe(false)
    expect(await spendBudget(key, 3, 60)).toBe(false)
  })

  it('keeps buckets independent', async () => {
    const mine = bucket('mine')
    const yours = bucket('yours')

    expect(await spendBudget(mine, 1, 60)).toBe(true)
    expect(await spendBudget(mine, 1, 60)).toBe(false)

    // Spending someone else's budget must not spend mine, or one noisy address
    // would lock out everybody behind a shared proxy.
    expect(await spendBudget(yours, 1, 60)).toBe(true)
  })

  it('starts a fresh window once the old one expires', async () => {
    const key = bucket('window')

    expect(await spendBudget(key, 1, 60)).toBe(true)
    expect(await spendBudget(key, 1, 60)).toBe(false)

    // Backdating the window is how a test observes expiry without sleeping for
    // it. The function compares against `now()`, so moving the start is
    // equivalent to waiting.
    await sql`update private.rate_limits
              set window_start = now() - interval '2 minutes'
              where bucket = ${key}`

    expect(await spendBudget(key, 1, 60)).toBe(true)
  })

  it('does not overshoot when requests arrive together', async () => {
    const key = bucket('concurrent')

    // Read-then-write would let several of these read the same count and all
    // decide they were under the limit — the shape of race that
    // `SELECT ... FOR UPDATE` was added to the freeze balance to close. The
    // upsert takes a row lock, so exactly `max` may pass however they interleave.
    const results = await Promise.all(
      Array.from({ length: 12 }, () => spendBudget(key, 5, 60)),
    )

    expect(results.filter(Boolean)).toHaveLength(5)
  })

  it('counts every attempt, including the rejected ones', async () => {
    const key = bucket('counts')

    await Promise.all(Array.from({ length: 8 }, () => spendBudget(key, 2, 60)))

    const [row] = await sql`select hits from private.rate_limits where bucket = ${key}`
    // A limiter that stopped counting once it started refusing would let a
    // caller who keeps hammering reset their window sooner than one who backs off.
    expect(row.hits).toBe(8)
  })
})

describe('the counter is out of reach', () => {
  it('is invisible to the roles the app runs as', async () => {
    for (const role of ['anon', 'authenticated']) {
      const [row] = await sql`
        select has_table_privilege(${role}, 'private.rate_limits', 'select') as can_read,
               has_table_privilege(${role}, 'private.rate_limits', 'update') as can_write`
      expect(row.can_read, `${role} select`).toBe(false)
      expect(row.can_write, `${role} update`).toBe(false)
    }
  })

  it('lives outside the schema Supabase publishes over HTTP', async () => {
    // PostgREST routes `public`. A limiter reachable at /rest/v1/rpc with the
    // anon key would let a caller spend any bucket they can name, which is
    // worse than having none: the code above it would still believe it was
    // protected. Same reasoning moved `delete_own_account` here.
    const fns = await sql`
      select n.nspname from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where p.proname in ('rate_limit_hit', 'delete_own_account')`

    expect(fns).not.toHaveLength(0)
    expect(fns.every((f) => f.nspname === 'private')).toBe(true)
  })
})
