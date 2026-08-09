import { addDays, datesBetween, type LocalDate } from '../dates'

/** Days the chain shows on `sm` and wider. */
export const CHAIN_DAYS = 30

/** Days the chain shows below `sm`. The rest are hidden with CSS. */
export const CHAIN_DAYS_COMPACT = 14

export type CellState = 'checked' | 'frozen' | 'missed' | 'empty'

export interface Cell {
  date: LocalDate
  state: CellState
}

export interface ChainInput {
  today: LocalDate
  checkinDates: LocalDate[]
  frozenDates: LocalDate[]
  /** The first check-in in view. The chain starts here while it fits. */
  startedOn: LocalDate | null
  days?: number
}

export interface ChainSummary {
  checked: number
  frozen: number
  missed: number
}

/** The later of two dates. `LocalDate` is `YYYY-MM-DD`, so string order is date order. */
function later(a: LocalDate, b: LocalDate): LocalDate {
  return a > b ? a : b
}

/**
 * The earliest day a chain of `days` can ever reach back to.
 *
 * This is the fetch bound, not the render window: the DAL keeps only dates from
 * here on, and every window below is a sub-range of it. Keep the two apart —
 * widening the render window past this returns days whose data was never loaded.
 */
export function chainWindowStart(
  today: LocalDate,
  days: number = CHAIN_DAYS,
): LocalDate {
  return addDays(today, -(days - 1))
}

/**
 * First day the chain renders, inclusive.
 *
 * A streak reads left to right, so it has to begin on the left. Anchored to
 * today instead, a three-day-old account showed its whole history pressed
 * against the right edge, behind twenty-seven cells for days when the account
 * did not exist — which reads as a chain that has already ended rather than one
 * that has just begun.
 *
 * Once the history outgrows the window the anchor gives way and the window
 * slides, so an established account renders exactly as it did before.
 *
 * The window can therefore end after today. `buildChain` states what those
 * days are.
 */
export function chainRenderStart(
  today: LocalDate,
  startedOn: LocalDate | null,
  days: number = CHAIN_DAYS,
): LocalDate {
  const sliding = chainWindowStart(today, days)
  return startedOn === null ? sliding : later(startedOn, sliding)
}

/**
 * First day the compact chain shows, where only `CHAIN_DAYS_COMPACT` cells fit.
 *
 * The same rule as the full window, applied to a shorter one, which is what
 * makes the two agree on which end to drop. Trimming a fixed count off the
 * front — correct while today was always the last cell — would now hide a young
 * streak in its entirety, because a young streak *is* the front.
 */
export function compactWindowStart(
  windowStart: LocalDate,
  today: LocalDate,
  days: number = CHAIN_DAYS_COMPACT,
): LocalDate {
  return later(windowStart, chainWindowStart(today, days))
}

export function buildChain(input: ChainInput): Cell[] {
  const days = input.days ?? CHAIN_DAYS
  const checked = new Set(input.checkinDates)
  const frozen = new Set(input.frozenDates)
  const start = chainRenderStart(input.today, input.startedOn, days)

  return datesBetween(start, addDays(start, days - 1)).map((date): Cell => {
    if (checked.has(date)) return { date, state: 'checked' }
    if (frozen.has(date)) return { date, state: 'frozen' }

    // A day that has not arrived, and a user who has never checked in, both
    // have nothing to miss. Anchoring moved this from the left edge of the
    // window to the right; the rule behind it did not change.
    const nothingToMiss = date > input.today || input.startedOn === null
    return { date, state: nothingToMiss ? 'empty' : 'missed' }
  })
}

export function summarizeChain(cells: Cell[]): ChainSummary {
  return {
    checked: cells.filter((cell) => cell.state === 'checked').length,
    frozen: cells.filter((cell) => cell.state === 'frozen').length,
    missed: cells.filter((cell) => cell.state === 'missed').length,
  }
}
