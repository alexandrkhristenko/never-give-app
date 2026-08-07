import Link from 'next/link'
import ThemeToggle from '@/components/ui/theme-toggle'
import AppMenu from './app-menu'

interface AppHeaderProps {
  /** Omitted for signed-out visitors: there is no menu to show them. */
  username?: string
  theme: 'light' | 'dark' | null
}

export default function AppHeader({ username, theme }: AppHeaderProps) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3">
      <Link href="/" className="min-w-0 truncate">
        never-give.app
      </Link>

      <div className="flex items-center gap-2">
        {username ? (
          <span className="hidden font-mono text-xs text-ink-muted sm:inline">
            @{username}
          </span>
        ) : null}
        <ThemeToggle stored={theme} />
        {username ? <AppMenu username={username} /> : null}
      </div>
    </header>
  )
}
