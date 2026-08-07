'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import Field from '@/components/ui/field'
import PixelButton from '@/components/ui/pixel-button'
import { PROMISE_MAX_LENGTH } from '@/lib/validation'
import { completeOnboarding, type OnboardingState } from './actions'

const INITIAL_STATE: OnboardingState = {}

export default function OnboardingForm() {
  const [state, action, pending] = useActionState(
    completeOnboarding,
    INITIAL_STATE,
  )
  const timezoneRef = useRef<HTMLInputElement>(null)
  const [username, setUsername] = useState('')
  const [promiseLength, setPromiseLength] = useState(0)

  useEffect(() => {
    if (timezoneRef.current) {
      timezoneRef.current.value =
        Intl.DateTimeFormat().resolvedOptions().timeZone
    }
  }, [])

  return (
    <form action={action} className="flex flex-col gap-6">
      {state.error ? (
        <p role="alert" className="font-mono text-xs text-streak">
          {state.error}
        </p>
      ) : null}

      <Field
        id="username"
        label="Choose a username"
        hint={`never-give.app/${username || 'username'}`}
      >
        <input
          type="text"
          id="username"
          name="username"
          className="nes-input"
          required
          minLength={3}
          maxLength={20}
          pattern="[a-zA-Z0-9_]+"
          autoComplete="off"
          title="Letters, digits and underscores, 3-20 characters"
          aria-describedby="username-hint"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
        />
      </Field>

      <Field
        id="promise"
        label="Your main promise"
        hint={`${promiseLength} / ${PROMISE_MAX_LENGTH}`}
      >
        <input
          type="text"
          id="promise"
          name="promise"
          className="nes-input"
          placeholder="e.g. Code every day"
          required
          maxLength={PROMISE_MAX_LENGTH}
          aria-describedby="promise-hint"
          onChange={(event) => setPromiseLength(event.target.value.length)}
        />
      </Field>

      <Field id="visibility" label="Profile visibility">
        <div className="nes-select">
          <select
            required
            id="visibility"
            name="visibility"
            defaultValue="public"
          >
            <option value="public">Public (recommended)</option>
            <option value="unlisted">Unlisted (link only)</option>
          </select>
        </div>
      </Field>

      <input type="hidden" name="timezone" ref={timezoneRef} defaultValue="UTC" />

      <PixelButton type="submit" variant="primary" full aria-busy={pending}>
        {pending ? 'STARTING...' : 'START GAME'}
      </PixelButton>
    </form>
  )
}
