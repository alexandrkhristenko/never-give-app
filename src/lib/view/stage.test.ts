import { describe, expect, it } from 'vitest'
import { daysToNextStage, stageOf } from './stage'

describe('stageOf', () => {
  it.each([
    [0, 'dormant'],
    [1, 'walking'],
    [6, 'walking'],
    [7, 'running'],
    [29, 'running'],
    [30, 'blazing'],
    [99, 'blazing'],
    [100, 'crowned'],
    [10_000, 'crowned'],
  ])('maps a streak of %i to %s', (streak, stage) => {
    expect(stageOf(streak)).toBe(stage)
  })
})

describe('daysToNextStage', () => {
  it.each([
    [0, 1],
    [1, 6],
    [6, 1],
    [7, 23],
    [29, 1],
    [30, 70],
    [99, 1],
  ])('reports %i days short of the next stage from %i', (streak, remaining) => {
    expect(daysToNextStage(streak)).toBe(remaining)
  })

  it('returns null at the final stage', () => {
    expect(daysToNextStage(100)).toBeNull()
    expect(daysToNextStage(500)).toBeNull()
  })
})
