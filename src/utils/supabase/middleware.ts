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

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Optimistic, not authorisation. The DAL and RLS still decide who sees which
  // rows — this only spares the framework from streaming a page that is about
  // to be thrown away, and spares the caller a 200 that means "no". Next's own
  // guidance puts exactly this much in middleware and no more.
  //
  // The call above was already being made and its result discarded, so the
  // check costs nothing that was not already being spent.
  if (!user && isPrivate(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'

    const redirect = NextResponse.redirect(url)
    // The refreshed session cookies have to survive the redirect, or the next
    // request arrives with the stale pair this function exists to replace.
    supabaseResponse.cookies
      .getAll()
      .forEach((cookie) => redirect.cookies.set(cookie))

    return redirect
  }

  return supabaseResponse
}

/** Routes that are meaningless without a session. */
const PRIVATE_PREFIXES = ['/dashboard', '/settings', '/onboarding'] as const

/**
 * Prefix matching with an explicit boundary.
 *
 * `startsWith('/dashboard')` alone would also claim `/dashboardguy`, and a
 * username is a root segment here — that is a profile somebody could register,
 * not a private route.
 */
function isPrivate(pathname: string): boolean {
  return PRIVATE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  )
}
