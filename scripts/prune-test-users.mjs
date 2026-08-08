/**
 * Removes accounts left behind by an interrupted test run.
 *
 * The end-to-end fixture creates a user per test and deletes it in a `finally`,
 * but a killed worker, a cancelled CI job or a `Ctrl-C` never reaches that.
 * The addresses are identifiable by domain, so they can be swept safely — and
 * deleting from `auth.users` cascades through `public.users`, `promises`,
 * `checkins` and `streak_freezes`.
 *
 *   node --env-file=.env.local scripts/prune-test-users.mjs          # report
 *   node --env-file=.env.local scripts/prune-test-users.mjs --delete # act
 *
 * Reports by default. Deleting accounts is not something a script should do
 * because you ran it without reading it.
 */
import postgres from 'postgres'

const TEST_DOMAIN = '%@never-give.test'

const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL is not set. Run with --env-file=.env.local')
  process.exit(1)
}

const shouldDelete = process.argv.includes('--delete')
const sql = postgres(url, { prepare: false, max: 1 })

try {
  const orphans = await sql`
    select id, email, created_at
    from auth.users
    where email like ${TEST_DOMAIN}
    order by created_at
  `

  if (orphans.length === 0) {
    console.log('No test accounts found.')
    process.exit(0)
  }

  console.log(`${orphans.length} test account(s):`)
  for (const row of orphans) {
    console.log(`  ${row.email}  ${row.created_at.toISOString()}`)
  }

  if (!shouldDelete) {
    console.log('\nNothing was deleted. Re-run with --delete to remove them.')
    process.exit(0)
  }

  const removed = await sql`
    delete from auth.users where email like ${TEST_DOMAIN} returning id
  `
  console.log(`\nDeleted ${removed.length} account(s); their rows cascaded.`)
} finally {
  await sql.end()
}
