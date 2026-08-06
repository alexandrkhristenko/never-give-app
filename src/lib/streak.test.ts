import { describe, expect, it } from 'vitest'
import { calculateStreak } from './streak'

const TODAY = '2026-08-10'

function streak(checkinDates: string[], frozenDates: string[] = []) {
  return calculateStreak({ checkinDates, frozenDates, today: TODAY })
}

describe('calculateStreak', () => {
  it('reports zero for a promise with no history', () => {
    expect(streak([])).toEqual({ current: 0, best: 0 })
  })

  it('counts a check-in made today', () => {
    expect(streak(['2026-08-10'])).toEqual({ current: 1, best: 1 })
  })

  it('keeps the streak alive when only yesterday is covered', () => {
    // Today is not a miss until it is over.
    expect(streak(['2026-08-09'])).toEqual({ current: 1, best: 1 })
  })

  it('breaks the streak when yesterday was missed', () => {
    expect(streak(['2026-08-08'])).toEqual({ current: 0, best: 1 })
  })

  it('counts a consecutive run ending today', () => {
    expect(streak(['2026-08-08', '2026-08-09', '2026-08-10'])).toEqual({
      current: 3,
      best: 3,
    })
  })

  it('counts a consecutive run ending yesterday', () => {
    expect(streak(['2026-08-07', '2026-08-08', '2026-08-09'])).toEqual({
      current: 3,
      best: 3,
    })
  })

  it('treats frozen days as covered', () => {
    expect(streak(['2026-08-08', '2026-08-10'], ['2026-08-09'])).toEqual({
      current: 3,
      best: 3,
    })
  })

  it('remembers the best run after the current one breaks', () => {
    const checkins = [
      '2026-08-01',
      '2026-08-02',
      '2026-08-03',
      '2026-08-04',
      '2026-08-10',
    ]
    expect(streak(checkins)).toEqual({ current: 1, best: 4 })
  })

  it('ignores duplicate dates', () => {
    expect(streak(['2026-08-10', '2026-08-10', '2026-08-09'])).toEqual({
      current: 2,
      best: 2,
    })
  })

  it('ignores the order the dates arrive in', () => {
    expect(streak(['2026-08-09', '2026-08-10', '2026-08-08'])).toEqual({
      current: 3,
      best: 3,
    })
  })

  it('does not double-count a day that is both checked in and frozen', () => {
    expect(streak(['2026-08-10'], ['2026-08-10'])).toEqual({
      current: 1,
      best: 1,
    })
  })

  it('counts a run that crosses a month boundary', () => {
    expect(streak(['2026-07-31', '2026-08-01'])).toEqual({ current: 0, best: 2 })
  })
})
