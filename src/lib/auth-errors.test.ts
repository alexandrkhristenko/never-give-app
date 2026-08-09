import { describe, expect, it } from 'vitest'
import { authErrorMessage } from './auth-errors'

describe('authErrorMessage', () => {
  it('names each refusal the routes can produce', () => {
    expect(authErrorMessage('denied')).toBe('Sign-in was cancelled.')
    expect(authErrorMessage('expired')).toBe(
      'That link has expired. Request a new one.',
    )
    expect(authErrorMessage('failed')).toBe(
      'Sign-in could not be completed. Please try again.',
    )
  })

  it('says nothing when there is nothing to say', () => {
    expect(authErrorMessage(undefined)).toBeNull()
    expect(authErrorMessage('')).toBeNull()
  })

  // A query parameter is written by whoever sends the link, so it must never
  // reach the page. An unrecognised value falls back to our own sentence.
  it('never echoes what it was given', () => {
    const injected = '<script>alert(1)</script>'
    expect(authErrorMessage(injected)).toBe(
      'Sign-in could not be completed. Please try again.',
    )
    expect(authErrorMessage('Could not authenticate')).toBe(
      'Sign-in could not be completed. Please try again.',
    )
  })

  // Next hands a repeated parameter over as an array.
  it('ignores a repeated parameter instead of picking one', () => {
    expect(authErrorMessage(['denied', 'failed'])).toBeNull()
  })
})
