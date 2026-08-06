import { addDays, type LocalDate } from './dates'

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
