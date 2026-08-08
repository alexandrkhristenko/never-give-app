import 'server-only'
import { headers } from 'next/headers'
import { sql } from 'drizzle-orm'
import { withAnon } from '@/db/rls'
import { logError } from '@/lib/log'

/**
 * Request rate limiting, counted in Postgres.
 *
 * Process memory is not an option. On serverless the module is re-created on
 * every cold start and there are as many copies as there are instances, so an
 * in-memory counter gives the *appearance* of a limit while the real ceiling
 * is limit × instances and resets whenever the platform feels like it. That is
 * the same bargain this project refused for the content-security policy:
 * better no limiter than a decorative one, because code above a decorative
 * limiter believes it is protected.
 *
 * The counter lives in `private.rate_limits` and is only reachable through a
 * `security definer` function — see migration 0007, including why it is not in
 * the `public` schema Supabase publishes over HTTP.
 */

/** Buckets are namespaced so one endpoint's budget is not another's. */
export type RateLimitScope = 'signin' | 'signup' | 'onboarding' | 'username'

/**
 * The caller's address, as far as it can be trusted.
 *
 * `x-forwarded-for` is only meaningful behind a proxy that sets it, which is
 * the deployment target here. Taking the first entry is right for that case:
 * the platform appends, so the leftmost value is the one it observed. Running
 * this behind something that passes a client-supplied header through unchanged
 * would let a caller pick their own bucket.
 */
async function clientAddress(): Promise<string> {
  const headerList = await headers()

  const forwarded = headerList.get('x-forwarded-for')
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim()
    if (first) return first
  }

  const real = headerList.get('x-real-ip')
  if (real) return real.trim()

  // Local development has no proxy in front. Everyone shares one bucket, which
  // is wrong in production and harmless on one machine.
  return 'unknown'
}

interface Limit {
  /** Requests allowed inside the window. */
  max: number
  /** Window length in seconds. */
  windowSeconds: number
}

const LIMITS: Record<RateLimitScope, Limit> = {
  // Supabase applies its own limits to auth, so these exist to stop somebody
  // burning our function invocations rather than to protect the credentials.
  signin: { max: 20, windowSeconds: 300 },
  signup: { max: 10, windowSeconds: 3600 },

  // Onboarding reports "this username is already taken", which makes every
  // submission a probe. The limit is what keeps that from being an efficient
  // way to enumerate who has an account.
  onboarding: { max: 30, windowSeconds: 3600 },

  // The live availability check is an enumeration oracle by construction: it
  // exists to answer exactly the question an enumerator is asking. Generous
  // enough to type a name and try a few alternatives, far too slow to sweep a
  // dictionary.
  username: { max: 60, windowSeconds: 600 },
}

/**
 * Records one request against the caller's budget for `scope`.
 *
 * Returns false when the budget is spent.
 *
 * Fails **closed** — a database error is reported as "over the limit" rather
 * than waved through. That is cheap here in a way it usually is not: the
 * counter lives in the same database every page already needs, so a failure
 * that would block the limiter was going to fail the request anyway. Failing
 * open would only mean the enumeration guard is the first thing to disappear
 * exactly when the system is unhealthy.
 */
export async function withinRateLimit(scope: RateLimitScope): Promise<boolean> {
  const { max, windowSeconds } = LIMITS[scope]
  return spendBudget(`${scope}:${await clientAddress()}`, max, windowSeconds)
}

/**
 * The half of `withinRateLimit` that does not need a request.
 *
 * Split out so the behaviour that actually matters — that the count is atomic,
 * that buckets are independent, that a window really expires — can be tested.
 * `headers()` only resolves inside a request, so a test of the whole function
 * would have had to mock the one part worth trusting and skip the rest.
 */
export async function spendBudget(
  bucket: string,
  max: number,
  windowSeconds: number,
): Promise<boolean> {
  try {
    return await withAnon(async (tx) => {
      const result = await tx.execute(
        sql`select private.rate_limit_hit(${bucket}, ${max},
              make_interval(secs => ${windowSeconds})) as allowed`,
      )

      const rows = result as unknown as Array<{ allowed: boolean }>
      return rows[0]?.allowed === true
    })
  } catch (error) {
    // Without this line a database outage is indistinguishable from ordinary
    // traffic hitting its limit — every user is refused, and the logs say
    // nothing but "too many attempts". The bucket is safe to record; it is an
    // address and a scope, not content.
    logError('ratelimit.unavailable', error, { bucket })
    return false
  }
}

/** The message shown when a budget is spent. Shared so it reads the same everywhere. */
export const RATE_LIMITED_MESSAGE = 'Too many attempts. Wait a minute and try again.'
