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
  /** The user's first check-in. Days before it are empty, not missed. */
  startedOn: LocalDate | null
  days?: number
}

export interface ChainSummary {
  checked: number
  frozen: number
  missed: number
}

/** First day the chain shows, inclusive. */
export function chainWindowStart(
  today: LocalDate,
  days: number = CHAIN_DAYS,
): LocalDate {
  return addDays(today, -(days - 1))
}

export function buildChain(input: ChainInput): Cell[] {
  const days = input.days ?? CHAIN_DAYS
  const checked = new Set(input.checkinDates)
  const frozen = new Set(input.frozenDates)

  return datesBetween(chainWindowStart(input.today, days), input.today).map(
    (date): Cell => {
      if (checked.has(date)) return { date, state: 'checked' }
      if (frozen.has(date)) return { date, state: 'frozen' }

      // Before the user's first check-in there was nothing to miss.
      const started = input.startedOn !== null && date >= input.startedOn
      return { date, state: started ? 'missed' : 'empty' }
    },
  )
}

export function summarizeChain(cells: Cell[]): ChainSummary {
  return {
    checked: cells.filter((cell) => cell.state === 'checked').length,
    frozen: cells.filter((cell) => cell.state === 'frozen').length,
    missed: cells.filter((cell) => cell.state === 'missed').length,
  }
}
