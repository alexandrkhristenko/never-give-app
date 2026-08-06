import { describe, expect, it } from 'vitest'
import { addDays, datesBetween, daysBetween, localDateOf } from './dates'

describe('localDateOf', () => {
  it('resolves the calendar date in the given timezone', () => {
    // 23:30 UTC is already the next day in Kyiv (UTC+3).
    const instant = new Date('2026-08-06T23:30:00Z')

    expect(localDateOf(instant, 'UTC')).toBe('2026-08-06')
    expect(localDateOf(instant, 'Europe/Kyiv')).toBe('2026-08-07')
    expect(localDateOf(instant, 'America/New_York')).toBe('2026-08-06')
  })

  it('resolves the previous day for timezones behind UTC', () => {
    // 02:00 UTC is still the previous evening in Los Angeles (UTC-7).
    const instant = new Date('2026-08-06T02:00:00Z')

    expect(localDateOf(instant, 'UTC')).toBe('2026-08-06')
    expect(localDateOf(instant, 'America/Los_Angeles')).toBe('2026-08-05')
  })

  it('pads single-digit months and days', () => {
    expect(localDateOf(new Date('2026-01-02T12:00:00Z'), 'UTC')).toBe('2026-01-02')
  })
})

describe('addDays', () => {
  it('moves forward and backward', () => {
    expect(addDays('2026-08-06', 1)).toBe('2026-08-07')
    expect(addDays('2026-08-06', -1)).toBe('2026-08-05')
    expect(addDays('2026-08-06', 0)).toBe('2026-08-06')
  })

  it('crosses month and year boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
  })

  it('handles a leap day', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDays('2028-02-29', 1)).toBe('2028-03-01')
  })

  it('is unaffected by daylight saving transitions', () => {
    // Europe/Kyiv springs forward on 2026-03-29. Pure date math must not care.
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30')
  })
})

describe('daysBetween', () => {
  it('counts whole days and is signed', () => {
    expect(daysBetween('2026-08-01', '2026-08-10')).toBe(9)
    expect(daysBetween('2026-08-10', '2026-08-01')).toBe(-9)
    expect(daysBetween('2026-08-06', '2026-08-06')).toBe(0)
  })
})

describe('datesBetween', () => {
  it('returns an inclusive range', () => {
    expect(datesBetween('2026-08-06', '2026-08-09')).toEqual([
      '2026-08-06',
      '2026-08-07',
      '2026-08-08',
      '2026-08-09',
    ])
  })

  it('returns a single date when both ends match', () => {
    expect(datesBetween('2026-08-06', '2026-08-06')).toEqual(['2026-08-06'])
  })

  it('returns nothing when the range is inverted', () => {
    expect(datesBetween('2026-08-09', '2026-08-06')).toEqual([])
  })
})
