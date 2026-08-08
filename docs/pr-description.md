MVP completion: streaks, freezes, RLS and the frontend

Brings never-give.app to a working MVP. Executed from
`docs/superpowers/plans/2026-08-06-mvp-completion.md` — 20 tasks, each with an
independent review and a fix loop where the review found something.

## What changed

**Pure logic, fully tested (76 unit tests, up from none).** Streaks, freezes,
local dates and the day-by-day chain live in `src/lib/` as modules that read
neither the database nor the clock — time is always an argument. That is what
makes them testable, and it is why the rules can be checked against
`docs/product-spec.md` line by line.

**The database is under migration control** for the first time, with 13
row-level-security policies. Queries reach Postgres only through
`withUser`/`withAnon`, which switch the role transaction-locally; the
privileged connection never serves a user request.

**The frontend was rebuilt** on a design system with real tokens and two
themes. NES.css now sits in a lower cascade layer, so our rules win without
`!important` — before this it beat every Tailwind utility and made the dark
theme unreachable.

All 15 defects in `docs/known-issues.md` part 1 are closed.

## Defects the reviews caught

Four were serious enough to name:

- **An RLS predicate that failed open.** `visibility <> 'private'` published
  anything that was not exactly that string, over an unvalidated `varchar(50)`.
  A typo would have made a promise its owner believed hidden world-readable.
- **A race that silently ate an earned freeze.** The balance was planned from a
  snapshot taken in a different transaction. No constraint caught it: every
  wrong value stayed inside the `0..3` CHECK, and the unique index actually made
  it likelier by forcing the stale writer to commit last. Closed with
  `SELECT … FOR UPDATE`.
- **An unvalidated timezone that bricked accounts permanently.** A browser
  reporting a zone the server's ICU does not know made every page throw, with no
  in-app recovery because onboarding threw too.
- **An OG image that was an account-existence oracle.** It rendered the real
  username for a private profile and "Player" for an unregistered one — the same
  distinction `generateMetadata` had been rewritten to hide.

## Verification

- 76 unit tests, `tsc` clean, lint 0 errors (was 16), build succeeds
- 11 layout E2E checks green against a production build — no horizontal
  overflow at 320/375/768/1280
- RLS proven behaviourally, not just read: a second identity can read a public
  promise but is refused on write by the policy itself
- The one-promise guard tested against a live database with two concurrent
  connections — exactly one row results
- The OG image rendered and inspected, with real data and with an emoji on the
  truncation boundary

## Not done — see `docs/handover.md`

- `e2e/streak.spec.ts` has **never executed**: it needs
  `SUPABASE_SERVICE_ROLE_KEY`, which is absent. Its assertions have only been
  read. This is the largest remaining gap.
- The freeze mechanic has no end-to-end coverage at all — only unit tests of the
  pure planner.
- Nobody has opened the interface in a browser. `NEXT_PUBLIC_SITE_URL` is also
  missing.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
