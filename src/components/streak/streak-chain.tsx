import type { CSSProperties } from 'react'
import { addDays, type LocalDate } from '@/lib/dates'
import {
  CHAIN_DAYS,
  CHAIN_DAYS_COMPACT,
  compactWindowStart,
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

export default function StreakChain({
  cells,
  today,
}: {
  cells: Cell[]
  today: LocalDate
}) {
  const summary = summarizeChain(cells)

  // Only a full-length chain gets trimmed below `sm`. A shorter one — the
  // ten-day illustration on the landing page — must render whole at every
  // width, or the CSS rule would hide all of it.
  const responsive = cells.length === CHAIN_DAYS

  // Which cells the compact chain keeps. Derived from the window's own start
  // rather than a fixed offset, because the window is anchored to the first
  // check-in until the history outgrows it — so the cells to drop are not
  // always the leading ones.
  const windowStart = cells.length > 0 ? cells[0].date : today
  const compactStart = compactWindowStart(windowStart, today)
  const compactEnd = addDays(compactStart, CHAIN_DAYS_COMPACT - 1)

  // Thirty list items would be thirty announcements. One summary is the point.
  // The window can run past today, so it is named by where it starts rather
  // than called the last thirty days, which it no longer always is.
  const label =
    `${cells.length}-day chain from ${windowStart}: ` +
    `${summary.checked} checked in, ${summary.frozen} frozen, ` +
    `${summary.missed} missed.`

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
        {cells.map((cell) => (
          <li
            key={cell.date}
            aria-hidden="true"
            data-state={cell.state}
            data-trimmed={
              responsive && (cell.date < compactStart || cell.date > compactEnd)
                ? ''
                : undefined
            }
            data-today={cell.date === today ? '' : undefined}
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
