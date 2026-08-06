import { describe, expect, it } from 'vitest'
import {
  CHAIN_DAYS,
  buildChain,
  chainWindowStart,
  summarizeChain,
} from './chain'

const TODAY = '2026-08-10'

describe('chainWindowStart', () => {
  it('spans CHAIN_DAYS days inclusive of today', () => {
    expect(chainWindowStart(TODAY)).toBe('2026-07-12')
  })

  it('honours a custom window length', () => {
    expect(chainWindowStart(TODAY, 14)).toBe('2026-07-28')
  })
})

describe('buildChain', () => {
  it('returns exactly CHAIN_DAYS cells ending on today', () => {
    const cells = buildChain({
      today: TODAY,
      checkinDates: [],
      frozenDates: [],
      startedOn: null,
    })

    expect(cells).toHaveLength(CHAIN_DAYS)
    expect(cells[0].date).toBe('2026-07-12')
    expect(cells[CHAIN_DAYS - 1].date).toBe(TODAY)
  })

  it('marks days before the first check-in as empty, not missed', () => {
    const cells = buildChain({
      today: TODAY,
      checkinDates: ['2026-08-09', '2026-08-10'],
      frozenDates: [],
      startedOn: '2026-08-09',
      days: 4,
    })

    expect(cells.map((cell) => cell.state)).toEqual([
      'empty',
      'empty',
      'checked',
      'checked',
    ])
  })

  it('distinguishes checked, frozen and missed days', () => {
    const cells = buildChain({
      today: TODAY,
      checkinDates: ['2026-08-07', '2026-08-10'],
      frozenDates: ['2026-08-08'],
      startedOn: '2026-08-07',
      days: 4,
    })

    expect(cells.map((cell) => cell.state)).toEqual([
      'checked',
      'frozen',
      'missed',
      'checked',
    ])
  })

  it('ignores dates outside the window', () => {
    const cells = buildChain({
      today: TODAY,
      checkinDates: ['2026-01-01'],
      frozenDates: [],
      startedOn: '2026-01-01',
      days: 3,
    })

    expect(cells.map((cell) => cell.state)).toEqual([
      'missed',
      'missed',
      'missed',
    ])
  })

  it('treats a user with no history as entirely empty', () => {
    const cells = buildChain({
      today: TODAY,
      checkinDates: [],
      frozenDates: [],
      startedOn: null,
      days: 3,
    })

    expect(cells.every((cell) => cell.state === 'empty')).toBe(true)
  })
})

describe('summarizeChain', () => {
  it('counts each state', () => {
    const cells = buildChain({
      today: TODAY,
      checkinDates: ['2026-08-07', '2026-08-10'],
      frozenDates: ['2026-08-08'],
      startedOn: '2026-08-07',
      days: 4,
    })

    expect(summarizeChain(cells)).toEqual({
      checked: 2,
      frozen: 1,
      missed: 1,
    })
  })
})
