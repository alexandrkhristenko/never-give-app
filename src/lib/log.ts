import 'server-only'

/**
 * Structured server-side logging.
 *
 * `docs/known-issues.md` 2.6 records that no error monitoring is wired up, and
 * treats that as one problem. It is two, and only one of them needs an
 * account: Sentry needs a DSN nobody has handed over yet, but *what gets
 * recorded* is entirely in this repository's control — and several failures
 * were being discarded before anything could have collected them.
 * `updatePromise` swallowed every database error into the string `'unknown'`.
 * No monitoring service can report what was never written down.
 *
 * One JSON object per line, because every platform that collects stdout can
 * parse that, and none of them can usefully group a sentence. Sentry, if it
 * arrives, replaces the `emit` function and nothing else.
 *
 * ## What must never appear here
 *
 * Email addresses, promise text, usernames, tokens. Log the user id, the
 * error code, the constraint that was tripped — enough to find the row, not
 * enough to read it. A log line is a copy of production data that outlives the
 * request, gets shipped to a third party and is read by people who never asked
 * for the responsibility.
 */

type Level = 'error' | 'warn' | 'info'

/** Structured context. Ids and codes; never user content — see above. */
export type LogFields = Record<string, string | number | boolean | null>

/** Postgres-shaped fields worth keeping, dug out of however the driver wrapped them. */
function describeError(error: unknown): LogFields {
  if (!(error instanceof Error)) {
    return { error: typeof error === 'string' ? error : String(error) }
  }

  const fields: LogFields = { error: error.message, name: error.name }

  // Drizzle wraps driver errors and puts the original under `cause`, which is
  // how a taken username once reported itself as an unknown failure. Walking
  // the chain is the difference between "something went wrong" and "23505 on
  // users_username_lower_idx".
  for (
    let current: unknown = error;
    current;
    current = (current as { cause?: unknown }).cause
  ) {
    if (typeof current !== 'object') break
    const candidate = current as {
      code?: unknown
      constraint_name?: unknown
      routine?: unknown
    }
    if (typeof candidate.code === 'string') fields.code = candidate.code
    if (typeof candidate.constraint_name === 'string') {
      fields.constraint = candidate.constraint_name
    }
    if (typeof candidate.routine === 'string') fields.routine = candidate.routine
  }

  return fields
}

function emit(level: Level, event: string, fields: LogFields): void {
  const line = JSON.stringify({
    level,
    event,
    // The platform stamps its own arrival time, but that is when the line was
    // ingested, not when the thing happened.
    at: new Date().toISOString(),
    ...fields,
  })

  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
}

/**
 * A failure the user was told about, or should have been.
 *
 * `event` is a stable identifier to group and alert on — `'promise.update'`,
 * not a sentence that will be reworded next time somebody edits it.
 */
export function logError(
  event: string,
  error: unknown,
  fields: LogFields = {},
): void {
  emit('error', event, { ...fields, ...describeError(error) })
}

/** Something recovered from, but that nobody chose. */
export function logWarn(event: string, fields: LogFields = {}): void {
  emit('warn', event, fields)
}
