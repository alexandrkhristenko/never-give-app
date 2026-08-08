'use client'

import { useActionState, useState } from 'react'
import Field from '@/components/ui/field'
import PixelButton from '@/components/ui/pixel-button'
import { saveTimezone, type SettingsState } from './actions'

const INITIAL_STATE: SettingsState = {}

/** Today's date in a zone, in the same YYYY-MM-DD form the server stores. */
function dateIn(timezone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(
      new Date(),
    )
  } catch {
    return '—'
  }
}

export default function TimezoneForm({
  current,
  zones,
  today,
}: {
  current: string
  zones: string[]
  today: string
}) {
  const [state, action, pending] = useActionState(saveTimezone, INITIAL_STATE)
  const [selected, setSelected] = useState(current)

  const detected = Intl.DateTimeFormat().resolvedOptions().timeZone
  const changed = selected !== current
  // The only consequence a person can act on: whether the day boundary moves
  // far enough that today itself is a different date.
  const shifts = changed && dateIn(selected) !== dateIn(current)

  return (
    <form action={action} className="flex flex-col gap-6">
      {state.error && !state.field ? (
        <p role="alert" className="font-mono text-xs text-streak">
          {state.error}
        </p>
      ) : null}

      <p className="font-mono text-xs text-ink-muted">
        Your streak day starts and ends in this zone. Today is {today} for you.
      </p>

      <Field
        id="timezone"
        label="Timezone"
        hint={
          detected && detected !== selected
            ? `This device reports ${detected}.`
            : 'Matches this device.'
        }
        error={state.field === 'timezone' ? state.error : undefined}
      >
        <div className="nes-select">
          <select
            required
            id="timezone"
            name="timezone"
            value={selected}
            aria-describedby={
              state.field === 'timezone'
                ? 'timezone-hint timezone-error'
                : 'timezone-hint'
            }
            aria-invalid={state.field === 'timezone' || undefined}
            onChange={(event) => setSelected(event.target.value)}
          >
            {/* A stored zone this server no longer enumerates would otherwise
                vanish from the list, silently reselecting something else. */}
            {zones.includes(current) ? null : (
              <option value={current}>{current}</option>
            )}
            {zones.map((zone) => (
              <option key={zone} value={zone}>
                {zone}
              </option>
            ))}
          </select>
        </div>
      </Field>

      {/*
        The limitation is announced on the path that leads to it, before the
        change, rather than discovered afterwards as a streak that moved on its
        own. `checkins.local_date` was computed against the zone in force at the
        time and is not recomputed — there is no stored offset to recompute it
        from. See docs/debt.md C4.
      */}
      {changed ? (
        <div
          role="status"
          className="flex flex-col gap-2 font-mono text-xs text-ink-muted"
        >
          <p>
            Past check-ins keep the dates they were recorded with. Only future
            ones use the new zone.
          </p>
          {shifts ? (
            <p className="text-streak">
              Right now it is {dateIn(current)} in {current} but{' '}
              {dateIn(selected)} in {selected}. Saving this moves where today
              ends, so a check-in you have already made may land on what the
              app now calls yesterday.
            </p>
          ) : null}
        </div>
      ) : null}

      {/* Not disabled when nothing has changed. A disabled control drops out
          of the tab order and explains nothing — the same reasoning that
          replaced the disabled check-in button. Saving an unchanged zone
          writes the same value and says so. */}
      <PixelButton type="submit" variant="primary" full aria-busy={pending}>
        {pending ? 'SAVING...' : 'SAVE TIMEZONE'}
      </PixelButton>

      {state.saved ? (
        <p role="status" className="text-center font-mono text-xs text-streak">
          {state.saved}
        </p>
      ) : null}
    </form>
  )
}
