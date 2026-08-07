import type { Metadata } from 'next'
import { Press_Start_2P } from 'next/font/google'
import { readThemeCookie } from '@/lib/theme'
import './globals.css'

// The `cyrillic` subset is gone: the interface is English only.
const pressStart2P = Press_Start_2P({
  weight: '400',
  variable: '--font-press-start',
  subsets: ['latin'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'never-give.app',
  description: 'Promise publicly. Check in daily. Do not break the chain.',
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Reading the cookie here puts data-theme into the initial HTML, so there is
  // no flash of the wrong theme and no blocking inline script.
  //
  // A null theme renders no attribute at all, which is what lets the
  // prefers-color-scheme media query decide on a first visit.
  const theme = await readThemeCookie()

  return (
    <html
      lang="en"
      data-theme={theme}
      className={`${pressStart2P.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-bg text-ink">{children}</body>
    </html>
  )
}
