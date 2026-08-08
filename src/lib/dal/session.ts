import 'server-only'
import { cache } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'

export interface SessionUser {
  id: string
  email: string
}

/**
 * The signed-in user, verified against the Supabase auth server.
 *
 * `getUser()` is used rather than `getSession()` on purpose: the latter only
 * decodes a cookie, which the client controls.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user?.email) return null

  return { id: user.id, email: user.email }
})

/** Same as `getSessionUser`, but sends anonymous visitors to the landing page. */
export async function requireSessionUser(): Promise<SessionUser> {
  const user = await getSessionUser()

  // redirect() throws a control-flow exception. Never wrap it in try/catch.
  if (!user) redirect('/')

  return user
}
