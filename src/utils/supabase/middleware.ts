import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { supabaseCredentials } from './credentials'
import { reportIfMisconfigured } from './report'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const credentials = supabaseCredentials()
  reportIfMisconfigured(credentials)

  const supabase = createServerClient(
    credentials.url,
    credentials.key,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          // No `options` here on purpose: they describe how a cookie is sent
          // to the browser, and this copy never leaves the server. The
          // response below is where they matter.
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  await supabase.auth.getUser()

  return supabaseResponse
}
