import type { ReactNode } from 'react'

interface PanelProps {
  title?: string
  className?: string
  children: ReactNode
}

export default function Panel({ title, className = '', children }: PanelProps) {
  return (
    <section
      className={`nes-container ${title ? 'with-title' : ''} ${className}`}
    >
      {title ? <p className="title">{title}</p> : null}
      {children}
    </section>
  )
}
