'use client'

import { useActionState, useState } from 'react'
import Field from '@/components/ui/field'
import PixelButton from '@/components/ui/pixel-button'
import { PROMISE_MAX_LENGTH } from '@/lib/validation'
import { savePromise, type SettingsField, type SettingsState } from './actions'

const INITIAL_STATE: SettingsState = {}

/** What each option actually does, in the words of the person affected. */
const VISIBILITY_HINT: Record<string, string> = {
  public: 'Anyone can find your profile and it may be indexed by search engines.',
  unlisted: 'Only people you send the link to can see it. Search engines are asked to skip it.',
  private: 'Nobody but you. The public page returns nothing at all.',
}

export default function PromiseForm({
  defaultTitle,
  defaultVisibility,
  username,
}: {
  defaultTitle: string
  defaultVisibility: string
  username: string
}) {
  const [state, action, pending] = useActionState(savePromise, INITIAL_STATE)
  const [title, setTitle] = useState(defaultTitle)
  const [visibility, setVisibility] = useState(defaultVisibility)

  const errorFor = (field: SettingsField) =>
    state.field === field ? state.error : undefined
  const describedBy = (field: SettingsField) =>
    state.field === field ? `${field}-hint ${field}-error` : `${field}-hint`

  return (
    <form action={action} className="flex flex-col gap-6">
      {state.error && !state.field ? (
        <p role="alert" className="font-mono text-xs text-streak">
          {state.error}
        </p>
      ) : null}

      <Field
        id="promise"
        label="What you are committing to"
        hint={`${title.length} / ${PROMISE_MAX_LENGTH}`}
        error={errorFor('promise')}
      >
        <input
          type="text"
          id="promise"
          name="promise"
          className="nes-input"
          required
          maxLength={PROMISE_MAX_LENGTH}
          aria-describedby={describedBy('promise')}
          aria-invalid={state.field === 'promise' || undefined}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
      </Field>

      <Field
        id="visibility"
        label="Who can see it"
        // The consequence is spelled out under the control rather than left to
        // the option's one-word name. "Unlisted" means nothing until you are
        // told what it costs you.
        hint={VISIBILITY_HINT[visibility]}
        error={errorFor('visibility')}
      >
        <div className="nes-select">
          <select
            required
            id="visibility"
            name="visibility"
            value={visibility}
            aria-describedby={describedBy('visibility')}
            onChange={(event) => setVisibility(event.target.value)}
          >
            <option value="public">Public</option>
            <option value="unlisted">Unlisted (link only)</option>
            <option value="private">Private</option>
          </select>
        </div>
      </Field>

      <p className="font-mono text-xs text-ink-muted [overflow-wrap:anywhere]">
        {visibility === 'private'
          ? 'While private, never-give.app/' + username + ' shows nothing.'
          : 'never-give.app/' + username}
      </p>

      <PixelButton type="submit" variant="primary" full aria-busy={pending}>
        {pending ? 'SAVING...' : 'SAVE'}
      </PixelButton>

      {/* A save that changes the screen in no visible way reads as a save that
          did not happen. `role="status"` announces it without stealing focus. */}
      {state.saved ? (
        <p role="status" className="text-center font-mono text-xs text-streak">
          {state.saved}
        </p>
      ) : null}
    </form>
  )
}
