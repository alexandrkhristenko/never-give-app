import type { MetadataRoute } from 'next'

/**
 * The product spreads by somebody posting a link to their profile, so those
 * pages should be indexable. Everything behind a session should not: crawling
 * it is pointless, and `/dashboard` under a signed-out crawler is a redirect
 * to a landing page it already has.
 *
 * `unlisted` promises are handled a level up — `generateMetadata` puts a
 * `noindex` on those individual pages, which is the only place that can know a
 * given profile's visibility. This file cannot express "some profiles but not
 * others" and does not try to.
 *
 * No sitemap is advertised, deliberately. The only URLs worth listing are the
 * profiles, and a file enumerating them would be a public list of everyone who
 * has an account — reintroducing by the front door the account-existence
 * disclosure that `generateMetadata` and the OG route were both changed to
 * close. The static pages are one link apart and need no help being found.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/dashboard', '/onboarding', '/login', '/auth/'],
    },
  }
}
