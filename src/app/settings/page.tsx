import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import AppHeader from '@/components/layout/app-header'
import Panel from '@/components/ui/panel'
import { requireSessionUser } from '@/lib/dal/session'
import { getProfile } from '@/lib/dal/user'
import { getOwnPromiseView } from '@/lib/dal/promise'
import { readThemeCookie } from '@/lib/theme'
import { logError } from '@/lib/log'
import DeleteAccount from './delete-account'
import PromiseForm from './promise-form'
import TimezoneForm from './timezone-form'

export const metadata: Metadata = {
  title: 'Settings',
  // Nothing here is worth indexing and the page is behind a session anyway.
  robots: { index: false, follow: false },
}

/**
 * The zones this server can actually honour.
 *
 * Taken from the server's ICU rather than the browser's on purpose: the
 * browser may know zones this runtime does not, and offering one that
 * `Intl.DateTimeFormat` here will later reject is how a settings screen stores
 * a value that breaks every subsequent date calculation.
 */
function supportedTimezones(): string[] {
  try {
    return Intl.supportedValuesOf('timeZone')
  } catch (error) {
    // Older ICU builds lack the enumeration. A single-entry list keeps the
    // control honest rather than showing an empty select — but a settings
    // screen offering exactly one timezone is a broken screen, not a quirk,
    // so it is worth saying so out loud.
    logError('settings.timezones_unavailable', error)
    return ['UTC']
  }
}

export default async function SettingsPage() {
  await requireSessionUser()

  const profile = await getProfile()
  // redirect() throws a control-flow exception, so it stays outside try/catch.
  if (!profile) redirect('/onboarding')

  const promise = await getOwnPromiseView(profile)
  if (!promise) redirect('/onboarding')

  const theme = await readThemeCookie()

  return (
    <main className="mx-auto flex w-full max-w-[42rem] flex-col gap-6 p-4 sm:p-8">
      <AppHeader username={profile.username} theme={theme} />

      <h1 className="text-center [font-size:clamp(0.75rem,3.5vw,1.25rem)]">
        SETTINGS
      </h1>

      <Panel title="YOUR PROMISE" className="flex flex-col gap-6">
        <PromiseForm
          defaultTitle={promise.title}
          defaultVisibility={promise.visibility}
          username={profile.username}
        />
      </Panel>

      <Panel title="TIMEZONE" className="flex flex-col gap-6">
        <TimezoneForm
          current={profile.timezone}
          zones={supportedTimezones()}
          today={promise.today}
        />
      </Panel>

      <Panel title="DANGER ZONE" className="flex flex-col gap-6">
        <DeleteAccount username={profile.username} />
      </Panel>

      <p className="text-center">
        <Link href="/dashboard" className="font-mono text-xs underline">
          Back to dashboard
        </Link>
      </p>
    </main>
  )
}
