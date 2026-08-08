import type { CSSProperties } from 'react'
import {
  CHAIN_DAYS,
  CHAIN_DAYS_COMPACT,
  summarizeChain,
  type Cell,
} from '@/lib/view/chain'

/*
 * Weight follows meaning. With one border colour for every cell, the untouched
 * days read as bright outlines on a dark screen and the earned ones vanished
 * between them — the chain advertised its gaps instead of its length. Days that
 * happened keep the full edge; days that did not recede toward the panel.
 *
 * The border lives here rather than in a stylesheet because `border-edge` is a
 * Tailwind utility, and the utilities layer outranks the components layer no
 * matter how specific the selector.
 */
const STATE_CLASS: Record<Cell['state'], string> = {
  checked: 'bg-streak border-edge',
  frozen: 'bg-freeze border-edge',
  missed: 'bg-miss border-edge/30',
  empty: 'bg-empty border-edge/30',
}

export default function StreakChain({ cells }: { cells: Cell[] }) {
  const summary = summarizeChain(cells)
  const lastDate = cells.length > 0 ? cells[cells.length - 1].date : null

  // Only a full-length chain gets trimmed below `sm`. A shorter one — the
  // ten-day illustration on the landing page — must render whole at every
  // width, or the CSS rule would hide all of it.
  const responsive = cells.length === CHAIN_DAYS

  // Thirty list items would be thirty announcements. One summary is the point.
  const label =
    `Last ${cells.length} days: ${summary.checked} checked in, ` +
    `${summary.frozen} frozen, ${summary.missed} missed.`

  return (
    <div className="min-w-0">
      <ol
        role="img"
        aria-label={label}
        data-testid="chain"
        data-responsive={responsive ? '' : undefined}
        className="chain"
        style={
          {
            '--chain-n': responsive ? CHAIN_DAYS_COMPACT : cells.length,
            '--chain-n-sm': cells.length,
          } as CSSProperties
        }
      >
        {cells.map((cell, index) => (
          <li
            key={cell.date}
            aria-hidden="true"
            data-state={cell.state}
            data-trimmed={
              responsive && index < CHAIN_DAYS - CHAIN_DAYS_COMPACT
                ? ''
                : undefined
            }
            data-today={cell.date === lastDate ? '' : undefined}
            className={`aspect-square border-2 ${STATE_CLASS[cell.state]}`}
          />
        ))}
      </ol>

      <p
        aria-hidden="true"
        className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-ink-muted"
      >
        <span className="min-w-0">
          <span className="mr-1 inline-block size-2 bg-streak align-middle" />
          check-in
        </span>
        <span className="min-w-0">
          <span className="mr-1 inline-block size-2 bg-freeze align-middle" />
          freeze
        </span>
        <span className="min-w-0">
          <span className="mr-1 inline-block size-2 bg-miss align-middle" />
          missed
        </span>
      </p>
    </div>
  )
}
