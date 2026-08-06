/** A calendar date as `YYYY-MM-DD`, always interpreted in a user's timezone. */
export type LocalDate = string

const MS_PER_DAY = 86_400_000

function toUtcMillis(date: LocalDate): number {
  const [year, month, day] = date.split('-').map(Number)
  return Date.UTC(year, month - 1, day)
}

function fromUtcMillis(millis: number): LocalDate {
  const date = new Date(millis)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}

/**
 * The calendar date an instant falls on in `timeZone`.
 * This is the only place the app converts an instant into a day.
 */
export function localDateOf(instant: Date, timeZone: string): LocalDate {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant)

  const valueOf = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)!.value

  return `${valueOf('year')}-${valueOf('month')}-${valueOf('day')}`
}

/**
 * Shifts a local date by whole days.
 * The arithmetic stays in UTC, so daylight saving transitions cannot skew it.
 */
export function addDays(date: LocalDate, days: number): LocalDate {
  return fromUtcMillis(toUtcMillis(date) + days * MS_PER_DAY)
}

/** Whole days from `from` to `to`. Negative when `to` precedes `from`. */
export function daysBetween(from: LocalDate, to: LocalDate): number {
  return Math.round((toUtcMillis(to) - toUtcMillis(from)) / MS_PER_DAY)
}

/** Every date from `from` to `to` inclusive. Empty when the range is inverted. */
export function datesBetween(from: LocalDate, to: LocalDate): LocalDate[] {
  const span = daysBetween(from, to)
  if (span < 0) return []
  return Array.from({ length: span + 1 }, (_, offset) => addDays(from, offset))
}
