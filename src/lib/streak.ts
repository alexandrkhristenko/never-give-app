import { addDays, datesBetween, type LocalDate } from './dates'

export interface StreakInput {
  /** Dates the user actually checked in on. */
  checkinDates: LocalDate[]
  /** Dates a streak freeze was spent on. */
  frozenDates: LocalDate[]
  /** The user's current local date. */
  today: LocalDate
}

export interface StreakResult {
  current: number
  best: number
}

/** Check-ins and freezes merged, deduplicated, ascending. */
export function coveredDays(
  checkinDates: LocalDate[],
  frozenDates: LocalDate[],
): LocalDate[] {
  return [...new Set([...checkinDates, ...frozenDates])].sort()
}

function runEndingAt(covered: Set<LocalDate>, anchor: LocalDate): number {
  let length = 0
  let cursor = anchor

  while (covered.has(cursor)) {
    length += 1
    cursor = addDays(cursor, -1)
  }

  return length
}

export function calculateStreak({
  checkinDates,
  frozenDates,
  today,
}: StreakInput): StreakResult {
  const ascending = coveredDays(checkinDates, frozenDates)
  if (ascending.length === 0) return { current: 0, best: 0 }

  const covered = new Set(ascending)

  // Today only anchors the streak once it is covered; until the day is over,
  // yesterday still counts as the end of a live streak.
  const yesterday = addDays(today, -1)
  const anchor = covered.has(today)
    ? today
    : covered.has(yesterday)
      ? yesterday
      : null

  const current = anchor === null ? 0 : runEndingAt(covered, anchor)

  let best = 1
  let run = 1
  for (let index = 1; index < ascending.length; index += 1) {
    run = ascending[index] === addDays(ascending[index - 1], 1) ? run + 1 : 1
    if (run > best) best = run
  }

  return { current, best }
}

/** Days of unbroken streak needed to earn one freeze. */
export const FREEZE_EARN_INTERVAL = 7

/** Hard cap on how many freezes a user may hold. */
export const MAX_FREEZE_BALANCE = 3

export interface FreezePlanInput extends StreakInput {
  freezeBalance: number
}

export interface FreezePlan {
  /** Days to record a freeze for. Empty when nothing is spent. */
  datesToFreeze: LocalDate[]
  streakSurvives: boolean
}

/**
 * Decides which missed days a freeze should cover.
 * Pure: it plans, the caller writes.
 */
export function planFreezes({
  checkinDates,
  frozenDates,
  today,
  freezeBalance,
}: FreezePlanInput): FreezePlan {
  const ascending = coveredDays(checkinDates, frozenDates)
  if (ascending.length === 0) {
    return { datesToFreeze: [], streakSurvives: false }
  }

  const lastCovered = ascending[ascending.length - 1]

  // Today is not a miss until it is over, so the gap can only end at yesterday.
  const gap = datesBetween(addDays(lastCovered, 1), addDays(today, -1))
  if (gap.length === 0) {
    return { datesToFreeze: [], streakSurvives: true }
  }

  // All or nothing: covering part of a gap still breaks the streak, so the
  // freezes are better kept for a gap that can actually be closed.
  if (gap.length > freezeBalance) {
    return { datesToFreeze: [], streakSurvives: false }
  }

  return { datesToFreeze: gap, streakSurvives: true }
}

/**
 * The freeze balance after a check-in that extended the streak to
 * `streakLength`. Returns `currentBalance` unchanged when nothing is earned.
 */
export function earnedFreezeBalance(
  streakLength: number,
  currentBalance: number,
): number {
  const earnsFreeze =
    streakLength > 0 && streakLength % FREEZE_EARN_INTERVAL === 0

  if (!earnsFreeze) return currentBalance

  return Math.min(currentBalance + 1, MAX_FREEZE_BALANCE)
}
