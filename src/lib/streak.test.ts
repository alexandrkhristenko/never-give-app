import { describe, expect, it } from 'vitest'
import { calculateStreak, earnedFreezeBalance, planFreezes } from './streak'

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

  it('a freeze alone can extend a streak', () => {
    // Check-in on 08-08, freeze on 08-09, today is 08-10.
    // This covers 08-08, 08-09, 08-10 (today), so current streak is 3... wait.
    // Actually, today is 08-10. If today is not covered, yesterday must be.
    // Frozen dates: ['2026-08-09'], checkinDates: ['2026-08-08']
    // So covered days are 08-08, 08-09. Today (08-10) is not covered.
    // So the current streak should end at yesterday (08-09), which is covered.
    // That would make current = 2 (08-08 and 08-09).
    expect(streak(['2026-08-08'], ['2026-08-09'])).toEqual({ current: 2, best: 2 })
  })
})

function plan(
  checkinDates: string[],
  frozenDates: string[],
  freezeBalance: number,
) {
  return planFreezes({ checkinDates, frozenDates, today: TODAY, freezeBalance })
}

describe('planFreezes', () => {
  it('does nothing when there is no history', () => {
    expect(plan([], [], 3)).toEqual({ datesToFreeze: [], streakSurvives: false })
  })

  it('does nothing when the user checked in today', () => {
    expect(plan(['2026-08-10'], [], 3)).toEqual({
      datesToFreeze: [],
      streakSurvives: true,
    })
  })

  it('does nothing when the user checked in yesterday', () => {
    // Today is still in progress, so there is no completed miss yet.
    expect(plan(['2026-08-09'], [], 3)).toEqual({
      datesToFreeze: [],
      streakSurvives: true,
    })
  })

  it('freezes a single missed day', () => {
    expect(plan(['2026-08-08'], [], 1)).toEqual({
      datesToFreeze: ['2026-08-09'],
      streakSurvives: true,
    })
  })

  it('freezes every day of a gap it can cover', () => {
    expect(plan(['2026-08-06'], [], 3)).toEqual({
      datesToFreeze: ['2026-08-07', '2026-08-08', '2026-08-09'],
      streakSurvives: true,
    })
  })

  it('spends nothing when the gap is wider than the balance', () => {
    // All or nothing: a partly covered gap breaks the streak anyway.
    expect(plan(['2026-08-01'], [], 3)).toEqual({
      datesToFreeze: [],
      streakSurvives: false,
    })
  })

  it('spends nothing when the balance is empty', () => {
    expect(plan(['2026-08-08'], [], 0)).toEqual({
      datesToFreeze: [],
      streakSurvives: false,
    })
  })

  it('counts already frozen days as covered', () => {
    expect(plan(['2026-08-07'], ['2026-08-08'], 1)).toEqual({
      datesToFreeze: ['2026-08-09'],
      streakSurvives: true,
    })
  })

  it('measures the gap from the most recent covered day', () => {
    expect(plan(['2026-08-01', '2026-08-08'], [], 1)).toEqual({
      datesToFreeze: ['2026-08-09'],
      streakSurvives: true,
    })
  })
})

describe('earnedFreezeBalance', () => {
  it('grants a freeze every seven days', () => {
    expect(earnedFreezeBalance(7, 0)).toBe(1)
    expect(earnedFreezeBalance(14, 1)).toBe(2)
  })

  it('grants nothing on other days', () => {
    expect(earnedFreezeBalance(1, 0)).toBe(0)
    expect(earnedFreezeBalance(6, 0)).toBe(0)
    expect(earnedFreezeBalance(8, 1)).toBe(1)
  })

  it('grants nothing for an empty streak', () => {
    expect(earnedFreezeBalance(0, 2)).toBe(2)
  })

  it('never exceeds the cap', () => {
    expect(earnedFreezeBalance(7, 3)).toBe(3)
    expect(earnedFreezeBalance(28, 3)).toBe(3)
  })
})
