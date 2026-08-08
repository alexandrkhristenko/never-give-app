'use client'

import { useActionState, useState } from 'react'
import Field from '@/components/ui/field'
import PixelButton from '@/components/ui/pixel-button'
import { confirmDeleteAccount, type SettingsState } from './actions'

const INITIAL_STATE: SettingsState = {}

/**
 * Deleting the account.
 *
 * Two stages, because this is the one action on the site that cannot be
 * undone. The first click only reveals the confirmation; nothing is sent. The
 * confirmation is the username, typed — a checkbox next to a red button gets
 * ticked by the same reflex that clicks the button.
 */
export default function DeleteAccount({ username }: { username: string }) {
  const [state, action, pending] = useActionState(
    confirmDeleteAccount,
    INITIAL_STATE,
  )
  const [armed, setArmed] = useState(false)

  if (!armed) {
    return (
      <div className="flex flex-col gap-4">
        <p className="font-mono text-xs text-ink-muted">
          Deleting removes your profile, your promise, every check-in and every
          earned freeze. Your public page stops existing and the username
          becomes available again. This cannot be undone.
        </p>
        <PixelButton
          type="button"
          variant="danger"
          full
          onClick={() => setArmed(true)}
        >
          DELETE ACCOUNT
        </PixelButton>
      </div>
    )
  }

  return (
    <form action={action} className="flex flex-col gap-6">
      {state.error ? (
        <p role="alert" className="font-mono text-xs text-streak">
          {state.error}
        </p>
      ) : null}

      <input type="hidden" name="username" value={username} />

      <Field
        id="confirm"
        label={`Type ${username} to confirm`}
        hint="There is no undo and no export. Everything goes."
      >
        <input
          type="text"
          id="confirm"
          name="confirm"
          className="nes-input"
          autoComplete="off"
          // A password manager has no business filling this in, and neither
          // does the browser's own history of what you typed last time.
          autoCorrect="off"
          spellCheck={false}
          required
          aria-describedby="confirm-hint"
        />
      </Field>

      <PixelButton type="submit" variant="danger" full aria-busy={pending}>
        {pending ? 'DELETING...' : 'DELETE MY ACCOUNT FOREVER'}
      </PixelButton>

      <button
        type="button"
        className="font-mono text-xs underline"
        onClick={() => setArmed(false)}
      >
        Cancel, keep my account
      </button>
    </form>
  )
}
