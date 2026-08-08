import AppHeader from '@/components/layout/app-header'
import Panel from '@/components/ui/panel'
import { readThemeCookie } from '@/lib/theme'
import LoginForm from './login-form'

export default async function LoginPage() {
  const theme = await readThemeCookie()

  return (
    <main className="mx-auto flex w-full max-w-[42rem] flex-col gap-6 p-4 sm:p-8">
      <AppHeader theme={theme} />
      <Panel title="SIGN IN">
        <LoginForm />
      </Panel>
    </main>
  )
}
