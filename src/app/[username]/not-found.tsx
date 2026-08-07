import Link from 'next/link'
import Panel from '@/components/ui/panel'
import { pixelButtonClass } from '@/components/ui/pixel-button'

export default function ProfileNotFound() {
  return (
    <main className="mx-auto flex w-full max-w-[42rem] flex-col gap-6 p-4 sm:p-8">
      <Panel
        title="NO SUCH PLAYER"
        className="flex flex-col items-center gap-6 text-center"
      >
        <p className="font-mono text-sm">No player found at this address.</p>
        <Link href="/" className={pixelButtonClass('primary')}>
          Start your own quest
        </Link>
      </Panel>
    </main>
  )
}
