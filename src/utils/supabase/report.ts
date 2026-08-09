import 'server-only'
import { logError } from '@/lib/log'
import type { SupabaseCredentials } from './credentials'

/**
 * Records a missing Supabase configuration, once per runtime.
 *
 * The guard matters because the middleware runs on every request: without it a
 * misconfigured deployment would bury its own diagnosis under thousands of
 * copies. Once is enough — the condition cannot change while the process
 * lives, since these values are fixed at build time.
 *
 * Measured, not assumed: thirty requests produce **two** lines, not one. The
 * middleware runs in the edge runtime and the server client in Node, so each
 * holds its own copy of this module. Two is the ceiling, and two is fine.
 */
let reported = false

export function reportIfMisconfigured({ missing }: SupabaseCredentials): void {
  if (missing.length === 0 || reported) return
  reported = true

  logError(
    'supabase.misconfigured',
    new Error(`${missing.join(', ')} not set at build time`),
    {
      // `NEXT_PUBLIC_*` values are baked into the bundle, so adding them to the
      // environment is not enough — the deployment has to be built again, and
      // without the build cache. Saying so here saves that round trip.
      remedy: 'set the variables, then rebuild without the build cache',
    },
  )
}
