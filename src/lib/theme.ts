import 'server-only'
import { cookies } from 'next/headers'

export type Theme = 'light' | 'dark'

/**
 * The theme the user explicitly chose, or null when they never chose one.
 *
 * A null result means no `data-theme` attribute is rendered, which is exactly
 * what lets the prefers-color-scheme media query decide on a first visit.
 * Every server component that renders the header reads the cookie through
 * here — the parsing rule lives in one place.
 */
export async function readThemeCookie(): Promise<Theme | null> {
  const stored = (await cookies()).get('theme')?.value
  return stored === 'dark' || stored === 'light' ? stored : null
}
