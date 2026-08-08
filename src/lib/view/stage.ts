export type Stage = 'dormant' | 'walking' | 'running' | 'blazing' | 'crowned'

interface StageThreshold {
  stage: Stage
  min: number
}

/** Ordered high to low so the first match wins. */
const THRESHOLDS: StageThreshold[] = [
  { stage: 'crowned', min: 100 },
  { stage: 'blazing', min: 30 },
  { stage: 'running', min: 7 },
  { stage: 'walking', min: 1 },
  { stage: 'dormant', min: 0 },
]

export function stageOf(currentStreak: number): Stage {
  const match = THRESHOLDS.find(
    (threshold) => currentStreak >= threshold.min,
  )
  return match ? match.stage : 'dormant'
}

/** Days left until the avatar changes, or null once it cannot change again. */
export function daysToNextStage(currentStreak: number): number | null {
  // Thresholds run high to low; the last one above the current streak is the
  // next one the user will reach.
  const next = [...THRESHOLDS]
    .reverse()
    .find((threshold) => threshold.min > currentStreak)

  return next ? next.min - currentStreak : null
}
