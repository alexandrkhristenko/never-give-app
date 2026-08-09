/**
 * The Supabase project's public address and key, and whether they are actually
 * configured.
 *
 * Three call sites need this — the browser client, the server client and the
 * middleware — and all three used to spell it inline as
 * `process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://dummy.supabase.co'`. That
 * fallback is why a deployment with no Supabase settings looked healthy: public
 * pages render, because they read Postgres directly, and `supabase-js` does not
 * throw on an unreachable host — it reports "no session" and moves on. So the
 * site is up, nobody can sign in, and the only clue is `fetch failed` from a
 * form. It cost an hour of looking in the wrong place.
 *
 * The fallback stays, deliberately. Removing it would take the public profiles
 * down along with sign-in, and those genuinely still work. What changes is that
 * the misconfiguration now says its own name — see the callers, which log it.
 *
 * Both key names are accepted because both are real. `docs/architecture.md` §9
 * prefers `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and CI builds with it, while
 * every client here read `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Following the
 * documentation therefore produced a deployment that could not authenticate.
 *
 * The variables are named literally rather than looked up through an array:
 * Next replaces `process.env.NEXT_PUBLIC_*` at build time only where it appears
 * as a literal, so `process.env[name]` would quietly be undefined in the
 * browser bundle.
 */

const PLACEHOLDER_URL = 'https://dummy.supabase.co'
const PLACEHOLDER_KEY = 'dummy'

export interface SupabaseCredentials {
  url: string
  key: string
  /** Variable names that were expected and not found. Empty when configured. */
  missing: string[]
}

export function supabaseCredentials(): SupabaseCredentials {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  const missing: string[] = []
  if (!url) missing.push('NEXT_PUBLIC_SUPABASE_URL')
  if (!key) {
    missing.push(
      'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY',
    )
  }

  return {
    url: url || PLACEHOLDER_URL,
    key: key || PLACEHOLDER_KEY,
    missing,
  }
}
