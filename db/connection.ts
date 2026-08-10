/**
 * The one place that decides which database the suites write to.
 *
 * Six files used to read `process.env.DATABASE_URL` independently, and that is
 * the production database: the connection string carries the same project ref
 * as `NEXT_PUBLIC_SUPABASE_URL`, confirmed by behaviour — a profile seeded
 * directly was served by production immediately. So every `test:db` and
 * `test:e2e` run is an operation on production data.
 *
 * `TEST_DATABASE_URL` is preferred when set, which makes moving to a separate
 * Supabase project one variable rather than an edit in six files. Until such a
 * project exists the fallback stands, because a suite that cannot run is worth
 * less than one that runs somewhere it should not — but it says so out loud
 * once per process, so nobody discovers the choice from a deleted row.
 */

const TEST_URL = process.env.TEST_DATABASE_URL
const FALLBACK_URL = process.env.DATABASE_URL

export const hasTestDatabase = Boolean(TEST_URL || FALLBACK_URL)

export const missingTestDatabaseReason =
  'Neither TEST_DATABASE_URL nor DATABASE_URL is set. One of them belongs in .env.local, next to the Supabase keys.'

export function testDatabaseUrl(): string {
  const url = TEST_URL || FALLBACK_URL
  if (!url) throw new Error(missingTestDatabaseReason)
  return url
}

/** Which database, without printing credentials. */
export function describeTestDatabase(): string {
  return TEST_URL
    ? 'TEST_DATABASE_URL (a database of its own)'
    : 'DATABASE_URL — the production database. Seeded rows and deletions land in production.'
}

let announced = false

/**
 * Says which database, once per module instance.
 *
 * `process.stderr.write` rather than `console.warn`, and that is not a
 * stylistic choice. Vitest replaces `console` and only surfaces what it can
 * attribute to a running test; a warning at module scope is swallowed on a
 * green run and shown only when the file blows up. Measured: with `console.warn`
 * a passing `test:db` printed nothing at all — the line appeared only in a run
 * that crashed, which is precisely backwards for a warning about writing to
 * production.
 *
 * Once per *module instance*, not once per process: Vitest gives each test file
 * its own module registry, so five files announce five times. The same shape as
 * `src/utils/supabase/report.ts`, and for the same reason — a module-level flag
 * is only as global as the module.
 */
export function announceTestDatabase(): void {
  if (announced || !hasTestDatabase) return
  announced = true
  process.stderr.write(`[tests] writing to ${describeTestDatabase()}\n`)
}
