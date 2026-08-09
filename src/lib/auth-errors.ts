/**
 * The words a person sees when signing in did not work.
 *
 * The routes pick a code, this table turns it into a sentence, and the landing
 * page renders the sentence. Three files, one vocabulary.
 *
 * The text lives here rather than in the query parameter it arrives with,
 * because that parameter is written by whoever composed the link. Echoing it
 * would make `/?error=<anything>` a way to print arbitrary words on our own
 * page, over our own layout, above our own sign-in buttons. Whoever sends the
 * link chooses the code; we choose the sentence.
 */

export type AuthErrorCode = 'denied' | 'expired' | 'failed'

const MESSAGES: Record<AuthErrorCode, string> = {
  denied: 'Sign-in was cancelled.',
  expired: 'That link has expired. Request a new one.',
  failed: 'Sign-in could not be completed. Please try again.',
}

/**
 * The message for a `?error=` value, or null when there is no complaint.
 *
 * An unrecognised value still gets the general sentence: it means something did
 * go wrong on a path we have not enumerated, and silence would be the same
 * failure this module exists to remove. An array — a repeated parameter — is
 * treated as absent rather than resolved by guessing which one was meant.
 */
export function authErrorMessage(
  raw: string | string[] | undefined,
): string | null {
  if (typeof raw !== 'string' || raw === '') return null
  return MESSAGES[raw as AuthErrorCode] ?? MESSAGES.failed
}
