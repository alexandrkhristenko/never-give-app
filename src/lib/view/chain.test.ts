import { describe, expect, it } from 'vitest'
import { addDays } from '../dates'
import {
  CHAIN_DAYS,
  CHAIN_DAYS_COMPACT,
  buildChain,
  chainRenderStart,
  chainWindowStart,
  compactWindowStart,
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

describe('chainRenderStart', () => {
  it('anchors to the first check-in while the history still fits', () => {
    expect(chainRenderStart(TODAY, '2026-08-08')).toBe('2026-08-08')
  })

  it('slides once the history outgrows the window', () => {
    expect(chainRenderStart(TODAY, '2026-01-01')).toBe('2026-07-12')
  })

  it('slides on the day the history exactly fills the window', () => {
    expect(chainRenderStart(TODAY, '2026-07-12')).toBe('2026-07-12')
  })

  it('falls back to the sliding window when there is no history', () => {
    expect(chainRenderStart(TODAY, null)).toBe('2026-07-12')
  })
})

describe('compactWindowStart', () => {
  // Trimming a fixed count off the front only works while today is the last
  // cell. These three cases are the ones that rule would get wrong.
  it('keeps a young streak visible instead of trimming it away', () => {
    expect(compactWindowStart('2026-08-08', TODAY)).toBe('2026-08-08')
  })

  it('trims the front for an established account, as it always did', () => {
    const windowStart = chainRenderStart(TODAY, '2026-01-01')
    expect(compactWindowStart(windowStart, TODAY)).toBe('2026-07-28')
    expect(chainWindowStart(TODAY, CHAIN_DAYS_COMPACT)).toBe('2026-07-28')
  })

  it('keeps today in view when the anchor is mid-window', () => {
    const windowStart = chainRenderStart(TODAY, '2026-07-21')
    expect(compactWindowStart(windowStart, TODAY)).toBe('2026-07-28')
  })

  // The compact window is rendered by hiding cells of the full one, so it has
  // to be a contiguous sub-range of it at every possible anchor.
  it.each(['2026-08-10', '2026-08-01', '2026-07-21', '2026-01-01', null])(
    'stays a sub-range of the full window when started on %s',
    (startedOn) => {
      const windowStart = chainRenderStart(TODAY, startedOn)
      const compactStart = compactWindowStart(windowStart, TODAY)
      const lastAllowed = addDays(windowStart, CHAIN_DAYS - CHAIN_DAYS_COMPACT)

      expect(compactStart >= windowStart).toBe(true)
      expect(compactStart <= lastAllowed).toBe(true)
      expect(addDays(compactStart, CHAIN_DAYS_COMPACT - 1) >= TODAY).toBe(true)
    },
  )
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

  it('starts at the first check-in so a young streak reads from the left', () => {
    const cells = buildChain({
      today: TODAY,
      checkinDates: ['2026-08-08', '2026-08-09', '2026-08-10'],
      frozenDates: [],
      startedOn: '2026-08-08',
    })

    expect(cells).toHaveLength(CHAIN_DAYS)
    expect(cells[0].date).toBe('2026-08-08')
    expect(cells.slice(0, 3).map((cell) => cell.state)).toEqual([
      'checked',
      'checked',
      'checked',
    ])
    expect(cells.slice(3).every((cell) => cell.state === 'empty')).toBe(true)
  })

  it('never calls a day that has not arrived missed', () => {
    const cells = buildChain({
      today: TODAY,
      checkinDates: ['2026-08-10'],
      frozenDates: [],
      startedOn: '2026-08-10',
    })

    expect(summarizeChain(cells).missed).toBe(0)
    expect(cells.filter((cell) => cell.date > TODAY)).toHaveLength(
      CHAIN_DAYS - 1,
    )
  })

  it('keeps today inside the window at every anchor', () => {
    for (const startedOn of ['2026-08-10', '2026-08-01', '2026-01-01', null]) {
      const cells = buildChain({
        today: TODAY,
        checkinDates: [],
        frozenDates: [],
        startedOn,
      })

      expect(cells.some((cell) => cell.date === TODAY)).toBe(true)
    }
  })

  it('marks days after today as empty, not missed', () => {
    const cells = buildChain({
      today: TODAY,
      checkinDates: ['2026-08-09', '2026-08-10'],
      frozenDates: [],
      startedOn: '2026-08-09',
      days: 4,
    })

    expect(cells.map((cell) => cell.state)).toEqual([
      'checked',
      'checked',
      'empty',
      'empty',
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
