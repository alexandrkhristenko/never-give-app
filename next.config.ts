import type { NextConfig } from 'next'

/**
 * The app is public and its distribution channel is a link somebody else posts,
 * so responses arrive in contexts we do not control. None of these headers were
 * being sent.
 *
 * The content-security policy is deliberately not among them yet: Next inlines
 * bootstrap scripts, so a policy strict enough to be worth having needs
 * per-request nonces threaded through the proxy, and a policy loose enough to
 * avoid that (`unsafe-inline`) buys close to nothing. Better absent than
 * decorative — see `docs/handover.md`.
 */
const securityHeaders = [
  // The product has no reason to be framed, and a habit tracker with a
  // one-click check-in button is exactly the shape clickjacking targets.
  { key: 'X-Frame-Options', value: 'DENY' },

  // Stops a browser from second-guessing a declared type — the OG route
  // serves user-influenced content as an image.
  { key: 'X-Content-Type-Options', value: 'nosniff' },

  // A profile URL identifies a person. Send the origin to other sites, and
  // the full path only to ourselves.
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },

  // Nothing here uses these, and saying so keeps an embedded third party from
  // asking on our behalf.
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  },
]

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
}

export default nextConfig
