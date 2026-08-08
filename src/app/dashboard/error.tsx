'use client' // Error boundaries must be Client Components

import { useEffect } from 'react'
import Panel from '@/components/ui/panel'
import PixelButton from '@/components/ui/pixel-button'

export default function DashboardError({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <main className="mx-auto flex w-full max-w-[42rem] flex-col gap-6 p-4 sm:p-8">
      <Panel
        title="GAME OVER"
        className="flex flex-col items-center gap-6 text-center"
      >
        <p className="font-mono text-sm">
          We could not load your quest. This is on us, not on your streak.
        </p>
        <PixelButton variant="warning" onClick={() => retry()}>
          Try again
        </PixelButton>
      </Panel>
    </main>
  )
}
