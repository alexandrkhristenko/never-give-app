import { test as base } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

export interface TestUser {
  id: string
  email: string
  password: string
  username: string
}

export const test = base.extend<{ user: TestUser }>({
  user: async ({}, use, testInfo) => {
    const stamp = `${Date.now()}${testInfo.workerIndex}`
    const email = `e2e-${stamp}@never-give.test`
    const password = `Pw-${stamp}-aA1!`
    const username = `e2e_${stamp}`.slice(0, 20)

    // email_confirm skips the verification mail, which a browser test
    // cannot complete.
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
    if (error) throw error

    await use({ id: data.user.id, email, password, username })

    // Cascades through public.users, promises, checkins and streak_freezes.
    await admin.auth.admin.deleteUser(data.user.id)
  },
})

export { expect } from '@playwright/test'
