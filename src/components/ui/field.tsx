import type { ReactNode } from 'react'

interface FieldProps {
  id: string
  label: string
  hint?: ReactNode
  error?: string
  children: ReactNode
}

/**
 * Renders the label, hint and error around a control.
 *
 * The ids are conventional: the control itself must carry
 * `aria-describedby="<id>-hint <id>-error"` and `aria-invalid` — a wrapper
 * cannot set attributes on a child it does not own.
 */
export default function Field({
  id,
  label,
  hint,
  error,
  children,
}: FieldProps) {
  return (
    <div className="nes-field">
      <label htmlFor={id}>{label}</label>
      {children}
      {hint ? (
        <span
          id={`${id}-hint`}
          className="mt-2 block font-mono text-xs text-ink-muted"
        >
          {hint}
        </span>
      ) : null}
      {error ? (
        <span
          id={`${id}-error`}
          role="alert"
          className="mt-2 block font-mono text-xs text-streak"
        >
          {error}
        </span>
      ) : null}
    </div>
  )
}
