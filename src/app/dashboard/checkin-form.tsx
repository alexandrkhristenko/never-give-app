'use client'

import { useActionState } from 'react'
import PixelButton from '@/components/ui/pixel-button'
import { checkInAction, type CheckInState } from './actions'

const INITIAL_STATE: CheckInState = { status: 'idle' }

interface CheckInFormProps {
  checkedInToday: boolean
  timezone: string
}

export default function CheckInForm({
  checkedInToday,
  timezone,
}: CheckInFormProps) {
  const [state, action, pending] = useActionState(checkInAction, INITIAL_STATE)

  // No action to offer means no button. A disabled button leaves the tab order
  // and announces nothing about why it is unavailable.
  //
  // The wording says "after midnight" rather than counting hours down: an hour
  // count rendered on the server goes stale on screen until the next
  // revalidation, while midnight in the user's own timezone is always true.
  if (checkedInToday) {
    return (
      <div className="w-full text-center">
        <p role="status" className="border-4 border-edge p-3">
          DONE FOR TODAY
        </p>
        <p className="mt-2 font-mono text-xs text-ink-muted">
          Next check-in after midnight ({timezone}).
        </p>
        {state.status === 'ok' && state.earnedFreeze ? (
          <p role="status" className="mt-2 font-mono text-xs text-freeze">
            +1 FREEZE
          </p>
        ) : null}
      </div>
    )
  }

  return (
    <form action={action} className="w-full text-center">
      <PixelButton type="submit" variant="success" full aria-busy={pending}>
        {pending ? 'CHECKING IN...' : 'CHECK IN TODAY'}
      </PixelButton>
      {state.status === 'error' ? (
        <p role="alert" className="mt-2 font-mono text-xs text-streak">
          {state.message}
        </p>
      ) : null}
    </form>
  )
}
