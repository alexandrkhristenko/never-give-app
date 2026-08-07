'use client'

import { useState } from 'react'
import PixelButton from '@/components/ui/pixel-button'

interface ShareBarProps {
  url: string
  title: string
}

export default function ShareBar({ url, title }: ShareBarProps) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard access can be denied. The links below still work.
      setCopied(false)
    }
  }

  async function share() {
    // navigator.share exists mostly on mobile; elsewhere fall back to copying.
    if (typeof navigator.share !== 'function') return copy()

    try {
      await navigator.share({ title, url })
    } catch {
      // The user dismissed the sheet. Nothing to do.
    }
  }

  const text = encodeURIComponent(title)
  const target = encodeURIComponent(url)

  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      <PixelButton variant="primary" onClick={share}>
        SHARE
      </PixelButton>
      <PixelButton onClick={copy} aria-live="polite">
        {copied ? 'COPIED' : 'COPY LINK'}
      </PixelButton>
      <a
        className="nes-btn inline-flex items-center justify-center"
        href={`https://x.com/intent/tweet?text=${text}&url=${target}`}
        target="_blank"
        rel="noreferrer noopener"
      >
        X
      </a>
      <a
        className="nes-btn inline-flex items-center justify-center"
        href={`https://t.me/share/url?url=${target}&text=${text}`}
        target="_blank"
        rel="noreferrer noopener"
      >
        TG
      </a>
    </div>
  )
}
