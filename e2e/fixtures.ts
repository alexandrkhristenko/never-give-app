import { test as base } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

/**
 * Creating a test user needs the service-role key, which is not in `.env.local`
 * by design — anything the app's server runtime can read must not be able to
 * bypass row-level security. Building the client at import time would throw and
 * take the whole Playwright run down with it, including the suites that need no
 * session at all. So the check is deferred and the specs skip instead.
 */
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

export const hasAdminAccess = Boolean(SERVICE_ROLE_KEY)

export const missingKeyReason =
  'SUPABASE_SERVICE_ROLE_KEY is not set. Put it in .env.test.local — never in .env.local.'

function adminClient() {
  if (!SERVICE_ROLE_KEY) throw new Error(missingKeyReason)
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

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
    const { data, error } = await adminClient().auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
    if (error) throw error

    await use({ id: data.user.id, email, password, username })

    // Cascades through public.users, promises, checkins and streak_freezes.
    await adminClient().auth.admin.deleteUser(data.user.id)
  },
})

export { expect } from '@playwright/test'
