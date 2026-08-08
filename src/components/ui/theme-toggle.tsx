'use client'

import { useSyncExternalStore, useTransition } from 'react'
import { setTheme } from '@/app/theme-actions'

// Declared locally on purpose. `src/lib/theme.ts` is marked `server-only`, so
// importing its `Theme` type here would pull a server module into the client
// bundle and fail the build.
type Theme = 'light' | 'dark'

const PREFERS_DARK = '(prefers-color-scheme: dark)'

function subscribe(onChange: () => void) {
  const query = window.matchMedia(PREFERS_DARK)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

/**
 * What the operating system asks for.
 *
 * Only the browser can answer, so the server snapshot is `null`.
 * `useSyncExternalStore` is the sanctioned way to read a browser API during
 * render: seeding `useState` from a `useEffect` sets state synchronously
 * inside an effect, which triggers cascading renders.
 */
function useSystemTheme(): Theme | null {
  return useSyncExternalStore(
    subscribe,
    () => (window.matchMedia(PREFERS_DARK).matches ? 'dark' : 'light'),
    () => null,
  )
}

export default function ThemeToggle({ stored }: { stored: Theme | null }) {
  const system = useSystemTheme()
  const [pending, startTransition] = useTransition()

  // An explicit choice wins; otherwise the media query decides.
  const effective = stored ?? system
  const next: Theme = effective === 'dark' ? 'light' : 'dark'

  return (
    <button
      type="button"
      className="nes-btn"
      aria-label={`Switch to ${next} theme`}
      aria-busy={pending}
      onClick={() => startTransition(() => setTheme(next))}
    >
      {next === 'dark' ? 'DARK' : 'LIGHT'}
    </button>
  )
}
