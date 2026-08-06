import 'server-only'
import { asc, eq } from 'drizzle-orm'
import { checkins, promises, streak_freezes, users } from '@/db/schema'
import { withAnon, withUser, type DbTransaction } from '@/db/rls'
import { localDateOf, type LocalDate } from '@/lib/dates'
import {
  calculateStreak,
  earnedFreezeBalance,
  planFreezes,
} from '@/lib/streak'
import { chainWindowStart } from '@/lib/view/chain'
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

/** Keeps only the dates the chain can show, so the DTO stays small. */
function withinChainWindow(
  dates: LocalDate[],
  today: LocalDate,
): LocalDate[] {
  const from = chainWindowStart(today)
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
 * Spends freezes on any completed day the user missed, then reports the
 * resulting coverage. Idempotent: a day already in `streak_freezes` is never
 * paid for twice.
 */
async function applyPendingFreezes(
  tx: DbTransaction,
  promiseId: string,
  profile: Profile,
  today: LocalDate,
): Promise<CoverageState> {
  const checkinDates = await selectCheckinDates(tx, promiseId)
  const frozenDates = await selectFrozenDates(tx, promiseId)

  const plan = planFreezes({
    checkinDates,
    frozenDates,
    today,
    freezeBalance: profile.freezeBalance,
  })

  if (plan.datesToFreeze.length === 0) {
    return { checkinDates, frozenDates, freezeBalance: profile.freezeBalance }
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

  const freezeBalance = profile.freezeBalance - plan.datesToFreeze.length

  await tx
    .update(users)
    .set({ streak_freezes_balance: freezeBalance })
    .where(eq(users.id, profile.id))

  return {
    checkinDates,
    frozenDates: [...frozenDates, ...plan.datesToFreeze],
    freezeBalance,
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

    const coverage = await applyPendingFreezes(tx, promise.id, profile, today)

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
 * The result is what the UI celebrates with, so it has to say whether a
 * freeze was actually earned rather than leaving the page to guess.
 */
export async function checkIn(
  profile: Profile,
  now: Date = new Date(),
): Promise<CheckInResult> {
  const today = localDateOf(now, profile.timezone)

  return withUser(profile.id, async (tx) => {
    const promise = await selectPrimaryPromise(tx, profile.id)
    if (!promise) return { alreadyCheckedIn: false, earnedFreeze: false }

    const coverage = await applyPendingFreezes(tx, promise.id, profile, today)

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
 */
export async function getPublicPromiseView(
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
}
