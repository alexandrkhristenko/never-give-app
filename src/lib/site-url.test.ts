import { afterEach, describe, expect, it, vi } from 'vitest'
import { siteUrl } from './site-url'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('siteUrl', () => {
  it('prefers the configured value', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://never-give.app')
    vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', 'never-give-app.vercel.app')

    expect(siteUrl()).toEqual({
      url: 'https://never-give.app',
      source: 'NEXT_PUBLIC_SITE_URL',
    })
  })

  // The bug this module exists for: with only this branch missing, production
  // advertised `http://localhost:3000` as the origin of its OG image.
  it('falls back to the deployment host before giving up', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '')
    vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', 'never-give-app.vercel.app')

    expect(siteUrl()).toEqual({
      url: 'https://never-give-app.vercel.app',
      source: 'VERCEL_PROJECT_PRODUCTION_URL',
    })
  })

  it('uses localhost only when nothing else is known', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '')
    vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', '')

    expect(siteUrl()).toEqual({
      url: 'http://localhost:3000',
      source: 'localhost',
    })
  })

  // Every caller concatenates a path onto this, so a trailing slash would
  // produce `https://never-give.app//player`.
  it('drops a trailing slash', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://never-give.app/')

    expect(siteUrl().url).toBe('https://never-give.app')
  })

  it('adds a scheme to a bare host', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'never-give.app')

    expect(siteUrl().url).toBe('https://never-give.app')
  })

  it('keeps an explicit http scheme, so local overrides still work', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'http://localhost:4000')

    expect(siteUrl().url).toBe('http://localhost:4000')
  })
})
