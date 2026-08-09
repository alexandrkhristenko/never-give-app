/**
 * The app's own public address, and where the value came from.
 *
 * Three call sites need it — the OG `metadataBase`, the share bar and the
 * confirmation-mail redirect — and all three spelled it inline as
 * `process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'`.
 *
 * That fallback made the production deployment advertise
 * `http://localhost:3000/<name>/opengraph-image` as its `og:image`. Every
 * platform that unfurls a shared link went to fetch it from its own machine and
 * found nothing, so the card was blank everywhere and correct in the renderer —
 * which is exactly the pair of facts that keeps a bug alive.
 *
 * Worse than a missing variable: Next already falls back to
 * `VERCEL_PROJECT_PRODUCTION_URL` on its own, and setting `metadataBase`
 * explicitly overrode that with localhost. The configuration that would have
 * worked untouched was being replaced by one that could not.
 *
 * So the deployment URL is now consulted before giving up. `localhost` remains
 * last, because in local development it is the right answer and a production
 * URL would be the wrong one: the share button would copy a link to somebody
 * else's account.
 *
 * `VERCEL_PROJECT_PRODUCTION_URL` and not `VERCEL_URL`: the latter is unique per
 * deployment, and this same value is what has to appear in the Supabase Redirect
 * URLs allowlist. Per-deployment hosts would need a new entry for every preview,
 * so a preview's card pointing at the production profile is the cheaper trade —
 * it is the same profile either way.
 */

const LOCAL = 'http://localhost:3000'

/** Names in the order they are consulted, for the diagnostic below. */
export type SiteUrlSource =
  | 'NEXT_PUBLIC_SITE_URL'
  | 'VERCEL_PROJECT_PRODUCTION_URL'
  | 'localhost'

export interface SiteUrl {
  /** Absolute, with a scheme and no trailing slash. */
  url: string
  source: SiteUrlSource
}

/**
 * Vercel supplies a bare host. A pasted value may carry a scheme, a trailing
 * slash, or neither, and every caller here concatenates a path onto it.
 */
function normalize(value: string): string {
  const withScheme = /^https?:\/\//.test(value) ? value : `https://${value}`
  return withScheme.replace(/\/+$/, '')
}

export function siteUrl(): SiteUrl {
  // Named literally, not looked up: Next substitutes `process.env.NEXT_PUBLIC_*`
  // at build time only where it appears as a literal.
  const configured = process.env.NEXT_PUBLIC_SITE_URL
  if (configured) {
    return { url: normalize(configured), source: 'NEXT_PUBLIC_SITE_URL' }
  }

  const deployed = process.env.VERCEL_PROJECT_PRODUCTION_URL
  if (deployed) {
    return {
      url: normalize(deployed),
      source: 'VERCEL_PROJECT_PRODUCTION_URL',
    }
  }

  return { url: LOCAL, source: 'localhost' }
}
