import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import AppHeader from '@/components/layout/app-header'
import ShareBar from '@/components/share/share-bar'
import AvatarStage from '@/components/streak/avatar-stage'
import StreakChain from '@/components/streak/streak-chain'
import StreakStats from '@/components/streak/streak-stats'
import Panel from '@/components/ui/panel'
import { pixelButtonClass } from '@/components/ui/pixel-button'
import { getPublicProfile } from '@/lib/dal/user'
import { getPublicPromiseView } from '@/lib/dal/promise'
import { readThemeCookie } from '@/lib/theme'
import { buildChain } from '@/lib/view/chain'

interface PageProps {
  params: Promise<{ username: string }>
}

// Same fallback as `src/app/login/actions.ts` and README §Переменные: an unset
// variable means local development, so the share button must copy a localhost
// URL rather than a production one that may resolve to somebody else's account.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { username } = await params

  const profile = await getPublicProfile(username)
  const promise = profile ? await getPublicPromiseView(profile) : null

  // A private promise and a username nobody registered must be
  // indistinguishable here, exactly as they are in the page body. Returning a
  // profile-shaped title for one and a generic one for the other would turn
  // the <title> tag into an account-existence oracle.
  if (!profile || !promise) {
    return { title: 'Player not found - never-give.app' }
  }

  return {
    title: `${profile.username}'s Streak - never-give.app`,
    description: `${profile.username} is committing to: ${promise.title}`,
    // Unlisted profiles are reachable by link but must stay out of search.
    robots:
      promise.visibility === 'unlisted'
        ? { index: false, follow: false }
        : undefined,
  }
}

export default async function PublicProfilePage({ params }: PageProps) {
  const { username } = await params

  const profile = await getPublicProfile(username)

  // notFound() throws a control-flow exception, so it stays out of try/catch.
  if (!profile) notFound()

  // Under the anon role a private promise is simply not returned.
  const promise = await getPublicPromiseView(profile)
  if (!promise) notFound()

  const theme = await readThemeCookie()

  const cells = buildChain({
    today: promise.today,
    checkinDates: promise.recentCheckins,
    frozenDates: promise.recentFrozen,
    startedOn: promise.startedOn,
  })

  return (
    <main className="mx-auto flex w-full max-w-[42rem] flex-col gap-6 p-4 sm:p-8">
      {/* No username: the visitor is not necessarily signed in. */}
      <AppHeader theme={theme} />

      <Panel className="flex flex-col items-center gap-6">
        <h1 className="min-w-0 truncate">{profile.username}</h1>
        <p className="font-mono text-xs text-ink-muted">is committing to</p>

        <p className="min-w-0 text-balance text-center [font-size:clamp(0.75rem,3.5vw,1.25rem)] [overflow-wrap:anywhere]">
          {promise.title}
        </p>

        <AvatarStage currentStreak={promise.currentStreak} />

        <div className="w-full">
          <StreakStats
            current={promise.currentStreak}
            best={promise.bestStreak}
          />
        </div>

        <div className="w-full">
          <StreakChain cells={cells} />
        </div>

        {promise.startedOn ? (
          <p className="font-mono text-xs text-ink-muted">
            since {promise.startedOn}
          </p>
        ) : null}
      </Panel>

      <ShareBar
        url={`${SITE_URL}/${profile.username}`}
        title={`${profile.username} is committing to: ${promise.title}`}
      />

      <p className="text-center">
        <Link href="/" className={pixelButtonClass('primary')}>
          Start your own quest
        </Link>
      </p>
    </main>
  )
}
