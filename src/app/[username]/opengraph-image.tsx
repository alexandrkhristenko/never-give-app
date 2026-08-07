import { ImageResponse } from 'next/og'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { getPublicProfile } from '@/lib/dal/user'
import { getPublicPromiseView } from '@/lib/dal/promise'
import { buildChain, type Cell } from '@/lib/view/chain'

export const alt = 'never-give.app streak'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const pressStart2P = await readFile(
  join(process.cwd(), 'assets/PressStart2P-Regular.ttf'),
)

// Satori renders outside the document and cannot see the app's CSS variables,
// so the light-theme palette is written out here.
const INK = '#1a1d21'
const MUTED = '#5b6169'
const PANEL = '#ffffff'
const BG = '#14171a'
const CELL_COLOR: Record<Cell['state'], string> = {
  checked: '#b3341c',
  frozen: '#1c5f8f',
  missed: '#b9bec4',
  empty: '#dfe1e4',
}

export default async function Image({
  params,
}: {
  params: Promise<{ username: string }>
}) {
  const { username } = await params

  const profile = await getPublicProfile(username)
  const promise = profile ? await getPublicPromiseView(profile) : null

  const displayName = profile?.username ?? 'Player'
  const title = promise?.title ?? 'A new quest'
  const streak = promise?.currentStreak ?? 0

  const cells: Cell[] = promise
    ? buildChain({
        today: promise.today,
        checkinDates: promise.recentCheckins,
        frozenDates: promise.recentFrozen,
        startedOn: promise.startedOn,
      })
    : []

  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          backgroundColor: BG,
          padding: 40,
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: PANEL,
            border: `8px solid ${INK}`,
            width: '100%',
            height: '100%',
            padding: 60,
          }}
        >
          <div style={{ fontSize: 36, color: INK }}>{displayName}</div>
          <div style={{ fontSize: 18, color: MUTED, marginTop: 24 }}>
            is committing to
          </div>
          <div
            style={{
              fontSize: 34,
              color: INK,
              marginTop: 28,
              textAlign: 'center',
              // Satori has no line clamping, so keep long titles from
              // pushing the streak out of frame.
              maxWidth: 940,
            }}
          >
            {title.length > 48 ? `${title.slice(0, 45)}...` : title}
          </div>

          <div style={{ display: 'flex', gap: 6, marginTop: 44 }}>
            {cells.map((cell) => (
              <div
                key={cell.date}
                style={{
                  width: 26,
                  height: 26,
                  backgroundColor: CELL_COLOR[cell.state],
                  border: `3px solid ${INK}`,
                }}
              />
            ))}
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              marginTop: 44,
            }}
          >
            <span style={{ fontSize: 16, color: MUTED }}>CURRENT STREAK</span>
            <span style={{ fontSize: 88, color: CELL_COLOR.checked, marginTop: 16 }}>
              {streak}
            </span>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        {
          name: 'Press Start 2P',
          data: pressStart2P,
          style: 'normal',
          weight: 400,
        },
      ],
    },
  )
}
