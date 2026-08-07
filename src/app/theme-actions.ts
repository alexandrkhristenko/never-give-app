'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365

export async function setTheme(theme: 'light' | 'dark'): Promise<void> {
  const store = await cookies()

  store.set('theme', theme, {
    maxAge: ONE_YEAR_SECONDS,
    path: '/',
    sameSite: 'lax',
  })

  // The attribute lives on <html> in the root layout, so every route re-renders.
  revalidatePath('/', 'layout')
}
