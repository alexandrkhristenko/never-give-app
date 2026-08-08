import 'server-only'
import { cache } from 'react'
import { asc, eq } from 'drizzle-orm'
import { checkins, promises, streak_freezes, users } from '@/db/schema'
import { withAnon, withUser, type DbTransaction } from '@/db/rls'
import { localDateOf, type LocalDate } from '@/lib/dates'
import {
  calculateStreak,
  earnedFreezeBalance,
  planFreezes,
} from '@/lib/streak'
import { CHAIN_DAYS, chainWindowStart } from '@/lib/view/chain'
import { validatePromiseTitle, validateUsername } from '@/lib/validation'
import type { Profile, PublicProfile } from './user'

export interface PromiseView {
  id: string
  title: string
  visibility: string
  today: LocalDate
  checkedInToday: boolean
  currentStreak: number
  bestStreak: number
  freezeBalance: number
  startedOn: LocalDate | null
  recentCheckins: LocalDate[]
  recentFrozen: LocalDate[]
}

export interface PublicPromiseView {
  title: string
  visibility: string
  today: LocalDate
  currentStreak: number
  bestStreak: number
  startedOn: LocalDate | null
  recentCheckins: LocalDate[]
  recentFrozen: LocalDate[]
}

interface PromiseRow {
  id: string
  title: string
  visibility: string
}

/** The earliest date in the list, or null when it is empty. */
function earliest(dates: LocalDate[]): LocalDate | null {
  // LocalDate is always YYYY-MM-DD, so string ordering is date ordering.
  return dates.length === 0 ? null : dates.reduce((a, b) => (a < b ? a : b))
}

/**
 * Keeps only the dates the chain can show, so the DTO stays small.
 * The window is contractually tied to `CHAIN_DAYS`: it must match what the
 * chain view actually renders, not whichever default `chainWindowStart`
 * happens to have.
 */
function withinChainWindow(
  dates: LocalDate[],
  today: LocalDate,
): LocalDate[] {
  const from = chainWindowStart(today, CHAIN_DAYS)
  return dates.filter((date) => date >= from && date <= today)
}

/** The MVP shows a single promise: the oldest one the user created. */
async function selectPrimaryPromise(
  tx: DbTransaction,
  userId: string,
): Promise<PromiseRow | null> {
  const rows = await tx
    .select({
      id: promises.id,
      title: promises.title,
      visibility: promises.visibility,
    })
    .from(promises)
    .where(eq(promises.user_id, userId))
    .orderBy(asc(promises.created_at))
    .limit(1)

  return rows[0] ?? null
}

async function selectCheckinDates(
  tx: DbTransaction,
  promiseId: string,
): Promise<LocalDate[]> {
  const rows = await tx
    .select({ localDate: checkins.local_date })
    .from(checkins)
    .where(eq(checkins.promise_id, promiseId))

  return rows.map((row) => row.localDate)
}

async function selectFrozenDates(
  tx: DbTransaction,
  promiseId: string,
): Promise<LocalDate[]> {
  const rows = await tx
    .select({ localDate: streak_freezes.local_date })
    .from(streak_freezes)
    .where(eq(streak_freezes.promise_id, promiseId))

  return rows.map((row) => row.localDate)
}

interface CoverageState {
  checkinDates: LocalDate[]
  frozenDates: LocalDate[]
  freezeBalance: number
}

/**
 * Reads `users.streak_freezes_balance` and locks the row `FOR UPDATE`.
 *
 * A snapshot taken outside this transaction (e.g. from `getProfile()`, which
 * runs its own transaction and is memoised by React `cache()`) is stale the
 * instant a concurrent check-in or dashboard load spends or earns a freeze.
 * The row lock is what serializes two such transactions against each other,
 * starting from this statement — plan and both writes below must use the
 * value read here, never a caller-supplied snapshot.
 */
async function lockFreezeBalance(
  tx: DbTransaction,
  userId: string,
): Promise<number> {
  const rows = await tx
    .select({ freezeBalance: users.streak_freezes_balance })
    .from(users)
    .where(eq(users.id, userId))
    .for('update')

  return rows[0]?.freezeBalance ?? 0
}

/**
 * Spends freezes on any completed day the user missed, then reports the
 * resulting coverage. Idempotent: a day already in `streak_freezes` is never
 * paid for twice.
 */
async function applyPendingFreezes(
  tx: DbTransaction,
  promiseId: string,
  userId: string,
  today: LocalDate,
): Promise<CoverageState> {
  const freezeBalance = await lockFreezeBalance(tx, userId)

  const checkinDates = await selectCheckinDates(tx, promiseId)
  const frozenDates = await selectFrozenDates(tx, promiseId)

  const plan = planFreezes({
    checkinDates,
    frozenDates,
    today,
    freezeBalance,
  })

  if (plan.datesToFreeze.length === 0) {
    return { checkinDates, frozenDates, freezeBalance }
  }

  await tx
    .insert(streak_freezes)
    .values(
      plan.datesToFreeze.map((localDate) => ({
        promise_id: promiseId,
        local_date: localDate,
      })),
    )
    .onConflictDoNothing()

  const nextBalance = freezeBalance - plan.datesToFreeze.length

  await tx
    .update(users)
    .set({ streak_freezes_balance: nextBalance })
    .where(eq(users.id, userId))

  return {
    checkinDates,
    frozenDates: [...frozenDates, ...plan.datesToFreeze],
    freezeBalance: nextBalance,
  }
}

/** The owner's view of their promise. Spends due freezes as a side effect. */
export async function getOwnPromiseView(
  profile: Profile,
  now: Date = new Date(),
): Promise<PromiseView | null> {
  const today = localDateOf(now, profile.timezone)

  return withUser(profile.id, async (tx) => {
    const promise = await selectPrimaryPromise(tx, profile.id)
    if (!promise) return null

    const coverage = await applyPendingFreezes(
      tx,
      promise.id,
      profile.id,
      today,
    )

    const { current, best } = calculateStreak({
      checkinDates: coverage.checkinDates,
      frozenDates: coverage.frozenDates,
      today,
    })

    return {
      id: promise.id,
      title: promise.title,
      visibility: promise.visibility,
      today,
      checkedInToday: coverage.checkinDates.includes(today),
      currentStreak: current,
      bestStreak: best,
      freezeBalance: coverage.freezeBalance,
      startedOn: earliest(coverage.checkinDates),
      recentCheckins: withinChainWindow(coverage.checkinDates, today),
      recentFrozen: withinChainWindow(coverage.frozenDates, today),
    }
  })
}

export interface CheckInResult {
  alreadyCheckedIn: boolean
  earnedFreeze: boolean
}

/**
 * Records today's check-in and grants a freeze when the streak hits a
 * multiple of seven. Safe to call twice: the unique constraint on
 * (promise_id, local_date) makes the second call a no-op.
 *
 * Returns `null` when the user has no promise yet — deliberately distinct
 * from a real, non-earning check-in result, which a caller must not confuse
 * with "nothing was written."
 *
 * The result is what the UI celebrates with, so it has to say whether a
 * freeze was actually earned rather than leaving the page to guess.
 */
export async function checkIn(
  profile: Profile,
  now: Date = new Date(),
): Promise<CheckInResult | null> {
  const today = localDateOf(now, profile.timezone)

  return withUser(profile.id, async (tx) => {
    const promise = await selectPrimaryPromise(tx, profile.id)
    if (!promise) return null

    const coverage = await applyPendingFreezes(
      tx,
      promise.id,
      profile.id,
      today,
    )

    const inserted = await tx
      .insert(checkins)
      .values({ promise_id: promise.id, local_date: today })
      .onConflictDoNothing()
      .returning({ id: checkins.id })

    // Already checked in today. No new row means no freeze is earned either.
    if (inserted.length === 0) {
      return { alreadyCheckedIn: true, earnedFreeze: false }
    }

    const { current } = calculateStreak({
      checkinDates: [...coverage.checkinDates, today],
      frozenDates: coverage.frozenDates,
      today,
    })

    const nextBalance = earnedFreezeBalance(current, coverage.freezeBalance)
    if (nextBalance === coverage.freezeBalance) {
      return { alreadyCheckedIn: false, earnedFreeze: false }
    }

    await tx
      .update(users)
      .set({ streak_freezes_balance: nextBalance })
      .where(eq(users.id, profile.id))

    return { alreadyCheckedIn: false, earnedFreeze: true }
  })
}

/**
 * The public view of a promise. Read-only on purpose: an anonymous visitor
 * must never trigger a write, so due freezes are not spent here.
 *
 * Memoised per render with React `cache()`: the profile page calls this both
 * from `generateMetadata` and from the page body, and without memoisation
 * those run as two independent transactions that could observe different
 * data — e.g. a promise flipped to private between them would still be
 * described in the `<title>`.
 */
export const getPublicPromiseView = cache(async function getPublicPromiseView(
  profile: PublicProfile,
  now: Date = new Date(),
): Promise<PublicPromiseView | null> {
  const today = localDateOf(now, profile.timezone)

  return withAnon(async (tx) => {
    // Under the anon role a private promise simply is not returned.
    const promise = await selectPrimaryPromise(tx, profile.id)
    if (!promise) return null

    const checkinDates = await selectCheckinDates(tx, promise.id)
    const frozenDates = await selectFrozenDates(tx, promise.id)

    const { current, best } = calculateStreak({
      checkinDates,
      frozenDates,
      today,
    })

    return {
      title: promise.title,
      visibility: promise.visibility,
      today,
      currentStreak: current,
      bestStreak: best,
      startedOn: earliest(checkinDates),
      recentCheckins: withinChainWindow(checkinDates, today),
      recentFrozen: withinChainWindow(frozenDates, today),
    }
  })
})

export type OnboardingError =
  | 'invalid_username'
  | 'reserved_username'
  | 'username_taken'
  | 'empty_promise'
  | 'promise_too_long'
  | 'unknown'

export interface OnboardingInput {
  username: string
  promiseTitle: string
  visibility: string
  timezone: string
}

/**
 * A browser can report a zone this runtime's ICU does not know — newer tzdata
 * on the client than on the server is enough. Storing it unchecked would make
 * every later `localDateOf` throw, and with no settings screen there would be
 * no way back.
 */
function safeTimezone(timezone: string): string {
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: timezone })
    return timezone
  } catch {
    return 'UTC'
  }
}

/** Postgres unique-violation SQLSTATE. */
const UNIQUE_VIOLATION = '23505'

/**
 * The constraint a unique violation tripped, or null when the error is
 * something else. postgres-js exposes it as `constraint_name`.
 */
function violatedConstraint(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null

  const candidate = error as { code?: unknown; constraint_name?: unknown }
  if (candidate.code !== UNIQUE_VIOLATION) return null

  return typeof candidate.constraint_name === 'string'
    ? candidate.constraint_name
    : ''
}

/**
 * Creates the user's profile row and their first promise.
 *
 * `users.id` is set from the verified auth id and the conflict target is `id`,
 * not `email`: a row whose id drifts from auth.users.id is invisible to every
 * RLS policy.
 */
export async function createProfileAndPromise(
  session: { id: string; email: string },
  input: OnboardingInput,
): Promise<OnboardingError | null> {
  const usernameError = validateUsername(input.username)
  if (usernameError === 'invalid_format') return 'invalid_username'
  if (usernameError === 'reserved') return 'reserved_username'

  const titleError = validatePromiseTitle(input.promiseTitle)
  if (titleError === 'empty') return 'empty_promise'
  if (titleError === 'too_long') return 'promise_too_long'

  const title = input.promiseTitle.trim()

  const visibility = input.visibility === 'unlisted' ? 'unlisted' : 'public'
  const timezone = safeTimezone(input.timezone)

  try {
    await withUser(session.id, async (tx) => {
      await tx
        .insert(users)
        .values({
          id: session.id,
          email: session.email,
          username: input.username,
          timezone,
        })
        .onConflictDoUpdate({
          target: users.id,
          set: { username: input.username, timezone },
        })

      // The MVP rule of "one promise per user" is enforced here, in
      // application code, on purpose: `docs/data-model.md` deliberately
      // leaves the schema open to multiple promises as a roadmap item, so no
      // unique index exists. Without this check, a double-click on "START
      // GAME" or a replayed POST would insert a second (or Nth) promise row.
      // Load-bearing ordering: the users upsert above must come first. Two
      // concurrent submissions both write that row, so the second blocks on
      // its lock and only then re-reads — under READ COMMITTED it therefore
      // sees the first transaction's committed promise and skips its own
      // insert. Verified against a live database with two connections.
      // Swapping these two statements silently breaks the guarantee.
      const existing = await selectPrimaryPromise(tx, session.id)
      if (!existing) {
        await tx.insert(promises).values({
          user_id: session.id,
          title,
          visibility,
          cadence: 'daily',
          status: 'active',
        })
      }
    })
  } catch (error) {
    const constraint = violatedConstraint(error)

    // Both the plain unique constraint and the case-insensitive index count
    // as "taken". An email collision is a different problem and must not be
    // reported as a username one.
    if (constraint !== null && constraint.includes('username')) {
      return 'username_taken'
    }

    console.error('Failed to complete onboarding', error)
    return 'unknown'
  }

  return null
}
