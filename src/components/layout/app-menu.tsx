'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { signOut } from '@/app/logout-actions'

export default function AppMenu({ username }: { username: string }) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }

    function onPointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }

    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [open])

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        className="nes-btn"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Account menu"
        onClick={() => setOpen((value) => !value)}
      >
        MENU
      </button>

      {open ? (
        <div
          role="menu"
          className="nes-container absolute right-0 z-10 mt-2 flex w-56 flex-col gap-2"
        >
          <Link
            role="menuitem"
            href={`/${username}`}
            className="font-mono text-xs underline"
          >
            View public profile
          </Link>
          <form action={signOut}>
            <button
              role="menuitem"
              type="submit"
              className="font-mono text-xs underline"
            >
              Log out
            </button>
          </form>
        </div>
      ) : null}
    </div>
  )
}
