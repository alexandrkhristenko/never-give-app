'use client'

import { useEffect, useState, useTransition } from 'react'
import { setTheme } from '@/app/theme-actions'

// Declared locally on purpose. `src/lib/theme.ts` is marked `server-only`, so
// importing its `Theme` type here would pull a server module into the client
// bundle and fail the build.
type Theme = 'light' | 'dark'

export default function ThemeToggle({ stored }: { stored: Theme | null }) {
  const [effective, setEffective] = useState<Theme | null>(stored)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    // With no cookie the media query decides what is actually on screen, and
    // only the browser knows that.
    if (stored) return
    setEffective(
      window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light',
    )
  }, [stored])

  const next: Theme = effective === 'dark' ? 'light' : 'dark'

  return (
    <button
      type="button"
      className="nes-btn"
      aria-label={`Switch to ${next} theme`}
      aria-busy={pending}
      onClick={() => {
        setEffective(next)
        startTransition(() => setTheme(next))
      }}
    >
      {next === 'dark' ? 'DARK' : 'LIGHT'}
    </button>
  )
}
