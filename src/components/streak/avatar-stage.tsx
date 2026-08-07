import { daysToNextStage, stageOf } from '@/lib/view/stage'

export default function AvatarStage({ currentStreak }: { currentStreak: number }) {
  const stage = stageOf(currentStreak)
  const remaining = daysToNextStage(currentStreak)

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="avatar-stage" data-stage={stage} data-testid="avatar">
        <i className="nes-mario" aria-hidden="true" />
      </div>
      <p className="font-mono text-xs text-ink-muted">
        {remaining === null
          ? 'Final form reached.'
          : `${remaining} more ${remaining === 1 ? 'day' : 'days'} to the next form.`}
      </p>
    </div>
  )
}
