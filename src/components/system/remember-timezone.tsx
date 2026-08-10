'use client'

import { useEffect } from 'react'

/**
 * Writes the browser's timezone into a cookie, so the server has it even when a
 * form is submitted before React has hydrated.
 *
 * Renders nothing. It exists because the onboarding form fills a hidden field
 * from an effect, and a submit that beat hydration therefore carried no zone at
 * all — reproduced on production with the JS chunks held back, creating an
 * account in UTC for a browser in America/New_York. See docs/debt.md D4.
 *
 * Mounted in the root layout rather than in the form: this only helps if it runs
 * on an *earlier* page than the one that submits. Reaching onboarding requires
 * signing in first, so by then this has run on the landing page and on the login
 * form, minutes earlier. Putting it next to the form would reproduce the very
 * race it removes.
 *
 * The value is a zone name — not a secret, not an identifier, and no use to
 * anybody who reads it. `SameSite=Lax` rather than `Strict`: a server action is
 * a same-site POST, but `Strict` also withholds the cookie on the first
 * navigation in from an OAuth provider, which is exactly when onboarding
 * happens.
 */
export default function RememberTimezone() {
  useEffect(() => {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (!zone) return

    document.cookie = `tz=${encodeURIComponent(zone)}; path=/; max-age=31536000; samesite=lax`
  }, [])

  return null
}
