import { MAX_FREEZE_BALANCE } from '@/lib/streak'

export default function FreezeMeter({ balance }: { balance: number }) {
  const pips = Array.from({ length: MAX_FREEZE_BALANCE }, (_, index) =>
    index < balance ? '*' : '-',
  ).join(' ')

  return (
    <p className="font-mono text-xs text-ink-muted">
      FREEZES{' '}
      <span aria-hidden="true" className="text-freeze">
        {pips}
      </span>
      <span className="sr-only">
        <span data-testid="freeze-balance">{balance}</span> of{' '}
        {MAX_FREEZE_BALANCE} available
      </span>
    </p>
  )
}
