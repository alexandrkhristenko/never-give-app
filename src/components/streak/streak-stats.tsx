/*
 * The count is the only thing on this screen anyone came to see, so it gets a
 * hard offset shadow — the trick the era used to lift a sprite off a
 * background without a blur it could not afford.
 */
const NUMBER_CLASS =
  'leading-none [font-size:clamp(1.75rem,10vw,3.5rem)] [text-shadow:var(--shadow-pixel-text)]'

interface StreakStatsProps {
  current: number
  best: number
}

export default function StreakStats({ current, best }: StreakStatsProps) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="min-w-0 text-center">
        <p className={`text-streak ${NUMBER_CLASS}`} data-testid="current-streak">
          {current}
        </p>
        <p className="mt-2 font-mono text-xs text-ink-muted">CURRENT</p>
      </div>
      <div className="min-w-0 text-center">
        <p className={NUMBER_CLASS} data-testid="best-streak">
          {best}
        </p>
        <p className="mt-2 font-mono text-xs text-ink-muted">BEST</p>
      </div>
    </div>
  )
}
