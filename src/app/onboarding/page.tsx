import { redirect } from 'next/navigation'
import Panel from '@/components/ui/panel'
import { requireSessionUser } from '@/lib/dal/session'
import { getProfile } from '@/lib/dal/user'
import { getOwnPromiseView } from '@/lib/dal/promise'
import OnboardingForm from './onboarding-form'

export default async function OnboardingPage() {
  await requireSessionUser()

  const profile = await getProfile()

  // Onboarding is only complete once BOTH the profile and its first promise
  // exist. Redirecting on the profile alone would bounce a user with no
  // promise between here and /dashboard forever.
  if (profile) {
    const promise = await getOwnPromiseView(profile)

    // Outside any try/catch: redirect() throws a control-flow exception.
    if (promise) redirect('/dashboard')
  }

  return (
    <main className="mx-auto flex w-full max-w-[42rem] flex-col gap-6 p-4 sm:p-8">
      <Panel title="WELCOME, PLAYER 1">
        <OnboardingForm />
      </Panel>
    </main>
  )
}
