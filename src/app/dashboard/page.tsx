import Link from 'next/link'
import { redirect } from 'next/navigation'
import AppHeader from '@/components/layout/app-header'
import AvatarStage from '@/components/streak/avatar-stage'
import FreezeMeter from '@/components/streak/freeze-meter'
import StreakChain from '@/components/streak/streak-chain'
import StreakStats from '@/components/streak/streak-stats'
import Panel from '@/components/ui/panel'
import { requireSessionUser } from '@/lib/dal/session'
import { getProfile } from '@/lib/dal/user'
import { getOwnPromiseView } from '@/lib/dal/promise'
import { readThemeCookie } from '@/lib/theme'
import { buildChain } from '@/lib/view/chain'
import CheckInForm from './checkin-form'

export default async function DashboardPage() {
  await requireSessionUser()

  const profile = await getProfile()

  // redirect() throws a control-flow exception, so it must stay outside any
  // try/catch. A swallowed redirect is what used to strand new users here.
  if (!profile) redirect('/onboarding')

  const promise = await getOwnPromiseView(profile)
  if (!promise) redirect('/onboarding')

  const theme = await readThemeCookie()

  const cells = buildChain({
    today: promise.today,
    checkinDates: promise.recentCheckins,
    frozenDates: promise.recentFrozen,
    startedOn: promise.startedOn,
  })

  return (
    <main className="mx-auto flex w-full max-w-[42rem] flex-col gap-6 p-4 sm:p-8">
      <AppHeader username={profile.username} theme={theme} />

      <Panel title="ACTIVE QUEST" className="flex flex-col items-center gap-6">
        <h1 className="min-w-0 text-balance text-center [font-size:clamp(0.75rem,3.5vw,1.25rem)] [overflow-wrap:anywhere]">
          {promise.title}
        </h1>

        <AvatarStage currentStreak={promise.currentStreak} />

        <div className="w-full">
          <StreakStats
            current={promise.currentStreak}
            best={promise.bestStreak}
          />
        </div>

        <CheckInForm
          checkedInToday={promise.checkedInToday}
          timezone={profile.timezone}
        />

        <div className="w-full">
          <StreakChain cells={cells} />
        </div>

        {promise.startedOn === null ? (
          <p className="font-mono text-xs text-ink-muted">
            Your chain starts today.
          </p>
        ) : null}

        {promise.startedOn !== null &&
        promise.currentStreak === 0 &&
        promise.bestStreak > 0 ? (
          <p className="font-mono text-xs text-ink-muted">
            Your chain broke at {promise.bestStreak} days. Start again.
          </p>
        ) : null}

        <FreezeMeter balance={promise.freezeBalance} />
      </Panel>

      <p className="text-center">
        <Link
          href={`/${profile.username}`}
          className="font-mono text-xs underline"
        >
          View public profile
        </Link>
      </p>
    </main>
  )
}
