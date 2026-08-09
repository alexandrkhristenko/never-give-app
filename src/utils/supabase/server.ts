import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { supabaseCredentials } from './credentials'
import { reportIfMisconfigured } from './report'

export async function createClient() {
  const cookieStore = await cookies()

  const credentials = supabaseCredentials()
  reportIfMisconfigured(credentials)

  return createServerClient(
    credentials.url,
    credentials.key,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  )
}
