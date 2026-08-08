import type { ComponentProps } from 'react'

export type PixelVariant =
  | 'default'
  | 'primary'
  | 'success'
  | 'warning'
  | 'danger'

const VARIANT_CLASS: Record<PixelVariant, string> = {
  default: '',
  primary: 'is-primary',
  success: 'is-success',
  warning: 'is-warning',
  // Not a red button. Red is spoken for twice over here — `is-success` is the
  // streak colour and `text-streak` is what every error message uses — so a
  // red destructive button would read as either an achievement or a message.
  // The inverted treatment carries the weight instead, and it is already this
  // interface's vocabulary: the panel titles are inverted the same way.
  danger: 'is-error',
}

/** Shared with links that need to look like buttons. */
export function pixelButtonClass(
  variant: PixelVariant = 'default',
  full = false,
): string {
  return [
    'nes-btn',
    VARIANT_CLASS[variant],
    full ? 'w-full' : '',
    'inline-flex items-center justify-center',
  ]
    .filter(Boolean)
    .join(' ')
}

interface PixelButtonProps extends ComponentProps<'button'> {
  variant?: PixelVariant
  full?: boolean
}

export default function PixelButton({
  variant = 'default',
  full = false,
  className = '',
  type = 'button',
  ...rest
}: PixelButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      className={`${pixelButtonClass(variant, full)} ${className}`}
    />
  )
}
