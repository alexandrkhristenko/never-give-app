import Link from 'next/link'
import { redirect } from 'next/navigation'
import AppHeader from '@/components/layout/app-header'
import StreakChain from '@/components/streak/streak-chain'
import Panel from '@/components/ui/panel'
import { pixelButtonClass } from '@/components/ui/pixel-button'
import { datesBetween } from '@/lib/dates'
import { readThemeCookie } from '@/lib/theme'
import { buildChain } from '@/lib/view/chain'
import { createClient } from '@/utils/supabase/server'

// Fixed dates keep the demo deterministic: no system clock, no hydration drift.
const DEMO_TODAY = '2026-08-10'
const DEMO_START = '2026-07-16'
const DEMO_FROZEN = '2026-08-02'
const DEMO_MISSED = '2026-07-28'

const DEMO_CHAIN = buildChain({
  today: DEMO_TODAY,
  checkinDates: datesBetween(DEMO_START, DEMO_TODAY).filter(
    (date) => date !== DEMO_FROZEN && date !== DEMO_MISSED,
  ),
  frozenDates: [DEMO_FROZEN],
  startedOn: DEMO_START,
})

const FREEZE_DEMO = buildChain({
  today: '2026-08-10',
  checkinDates: datesBetween('2026-08-01', '2026-08-10').filter(
    (date) => date !== '2026-08-06',
  ),
  frozenDates: ['2026-08-06'],
  startedOn: '2026-08-01',
  days: 10,
})

const STEPS = [
  {
    title: '1. PROMISE',
    body: 'Say out loud what you will do every single day. One promise, in public.',
  },
  {
    title: '2. CHECK IN',
    body: 'Tap the button once a day. Your day ends at midnight in your own timezone.',
  },
  {
    title: '3. DO NOT BREAK IT',
    body: 'Every check-in adds a link. Your profile shows the whole chain to anyone.',
  },
]

export default async function Home() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Outside any try/catch: redirect() throws a control-flow exception.
  if (user) redirect('/dashboard')

  const theme = await readThemeCookie()

  return (
    <main className="mx-auto flex w-full max-w-[42rem] flex-col gap-8 p-4 sm:p-8">
      <AppHeader theme={theme} />

      <Panel className="flex flex-col items-center gap-6 text-center">
        <h1 className="[font-size:clamp(1rem,5vw,1.75rem)]">never-give.app</h1>
        <p className="font-mono text-sm text-ink-muted">
          Promise publicly. Check in daily. Do not break the chain.
        </p>

        <div className="flex w-full flex-col gap-3">
          <form action="/auth/signin" method="post">
            <input type="hidden" name="provider" value="google" />
            <button type="submit" className={pixelButtonClass('default', true)}>
              Sign in with Google
            </button>
          </form>

          <form action="/auth/signin" method="post">
            <input type="hidden" name="provider" value="github" />
            <button type="submit" className={pixelButtonClass('default', true)}>
              Sign in with GitHub
            </button>
          </form>

          <Link href="/login" className={pixelButtonClass('primary', true)}>
            Continue with email
          </Link>
        </div>
      </Panel>

      <Panel title="HOW IT WORKS" className="flex flex-col gap-6">
        {STEPS.map((step) => (
          <div key={step.title} className="min-w-0">
            <h2 className="text-sm">{step.title}</h2>
            <p className="mt-2 font-mono text-xs text-ink-muted">{step.body}</p>
          </div>
        ))}
      </Panel>

      <Panel title="FREEZES" className="flex flex-col gap-4">
        <p className="font-mono text-xs text-ink-muted">
          Miss a day and a freeze covers it automatically. You earn one every
          seven days, and you can hold three.
        </p>

        <StreakChain cells={FREEZE_DEMO} />

        <p className="font-mono text-xs text-ink-muted">
          All or nothing: if your freezes cannot cover the whole gap, none are
          spent. A partly rescued chain would break anyway, so they are kept for
          next time.
        </p>
      </Panel>

      <Panel title="A REAL CHAIN" className="flex flex-col gap-4">
        <StreakChain cells={DEMO_CHAIN} />
        <p className="font-mono text-xs text-ink-muted">
          This is what your public profile shows. One missed day, one saved by a
          freeze, the rest earned.
        </p>
      </Panel>

      <footer className="text-center font-mono text-xs text-ink-muted">
        never-give.app
      </footer>
    </main>
  )
}
