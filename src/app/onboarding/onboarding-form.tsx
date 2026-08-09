'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import Field from '@/components/ui/field'
import PixelButton from '@/components/ui/pixel-button'
import { PROMISE_MAX_LENGTH } from '@/lib/validation'
import {
  checkUsername,
  completeOnboarding,
  type OnboardingField,
  type OnboardingState,
  type UsernameStatus,
} from './actions'

const INITIAL_STATE: OnboardingState = {}

/** Long enough not to fire on every keystroke, short enough to feel live. */
const CHECK_DELAY_MS = 450

const STATUS_TEXT: Partial<Record<UsernameStatus, string>> = {
  available: 'Available.',
  taken: 'Already taken.',
  reserved: 'Reserved. Pick another one.',
  rate_limited: 'Too many checks. The form will still tell you on submit.',
  // 'invalid' says nothing: the field's own hint and validation already
  // describe the format, and repeating it under a half-typed name reads as
  // being scolded mid-word.
}

export default function OnboardingForm({
  host,
}: {
  /** Where this deployment actually answers. Passed in: see `siteHost`. */
  host: string
}) {
  const [state, action, pending] = useActionState(
    completeOnboarding,
    INITIAL_STATE,
  )
  const timezoneRef = useRef<HTMLInputElement>(null)
  const [username, setUsername] = useState('')
  // The answer is stored with the name it answers. "Still checking" is then
  // derived — `checked.name !== username` — rather than being a state of its
  // own, which also means the effect never calls setState synchronously.
  const [checked, setChecked] = useState<{
    name: string
    status: UsernameStatus
  } | null>(null)
  const [promiseLength, setPromiseLength] = useState(0)

  useEffect(() => {
    if (timezoneRef.current) {
      timezoneRef.current.value =
        Intl.DateTimeFormat().resolvedOptions().timeZone
    }
  }, [])

  useEffect(() => {
    if (username.length === 0) return

    // Two guards, because they catch different things. `current` drops a
    // response whose input has already changed; storing the name alongside the
    // status means that even a response that slips through is only displayed
    // against the name it was asked about. Without the second, somebody typing
    // quickly could see "Available" attached to a name nobody checked.
    let current = true
    const timer = setTimeout(async () => {
      const status = await checkUsername(username)
      if (current) setChecked({ name: username, status })
    }, CHECK_DELAY_MS)

    return () => {
      current = false
      clearTimeout(timer)
    }
  }, [username])

  // Only shown once the answer belongs to what is currently typed.
  const usernameStatus =
    checked && checked.name === username ? checked.status : null

  // A field-scoped error goes to that Field; anything unattributable (a
  // database failure) stays a form-level message.
  const errorFor = (field: OnboardingField) =>
    state.field === field ? state.error : undefined
  const describedBy = (field: OnboardingField) =>
    state.field === field ? `${field}-hint ${field}-error` : `${field}-hint`

  return (
    <form action={action} className="flex flex-col gap-6">
      {state.error && !state.field ? (
        <p role="alert" className="font-mono text-xs text-streak">
          {state.error}
        </p>
      ) : null}

      <Field
        id="username"
        label="Choose a username"
        hint={`${host}/${username || 'username'}`}
        error={errorFor('username')}
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
          aria-describedby={describedBy('username')}
          aria-invalid={state.field === 'username' || undefined}
          value={username}
          onChange={(event) => setUsername(event.target.value)}
        />
      </Field>

      {/*
        Only settled answers reach the live region. Announcing "Checking…" and
        then the result turns every pause in typing into two interruptions, and
        the intermediate state is not something anyone needs to act on.
      */}
      <p
        role="status"
        className={`-mt-4 font-mono text-xs ${
          usernameStatus === 'available' ? 'text-freeze' : 'text-streak'
        }`}
      >
        {usernameStatus ? STATUS_TEXT[usernameStatus] : null}
      </p>

      <Field
        id="promise"
        label="Your main promise"
        hint={`${promiseLength} / ${PROMISE_MAX_LENGTH}`}
        error={errorFor('promise')}
      >
        <input
          type="text"
          id="promise"
          name="promise"
          className="nes-input"
          placeholder="e.g. Code every day"
          required
          maxLength={PROMISE_MAX_LENGTH}
          aria-describedby={describedBy('promise')}
          aria-invalid={state.field === 'promise' || undefined}
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

      {/* Deliberately empty rather than `UTC`: the effect above fills it, and a
          submit that beats hydration must be distinguishable from a browser
          that really is in UTC. The server decides what to store — see
          `resolveTimezone`. */}
      <input type="hidden" name="timezone" ref={timezoneRef} defaultValue="" />

      <PixelButton type="submit" variant="primary" full aria-busy={pending}>
        {pending ? 'STARTING...' : 'START GAME'}
      </PixelButton>
    </form>
  )
}
