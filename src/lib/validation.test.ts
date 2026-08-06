import { describe, expect, it } from 'vitest'
import {
  PROMISE_MAX_LENGTH,
  validatePromiseTitle,
  validateUsername,
} from './validation'

describe('validatePromiseTitle', () => {
  it('accepts an ordinary promise', () => {
    expect(validatePromiseTitle('Code every day')).toBeNull()
  })

  it('rejects blank input, including whitespace only', () => {
    expect(validatePromiseTitle('')).toBe('empty')
    expect(validatePromiseTitle('   ')).toBe('empty')
  })

  it('accepts the boundary length', () => {
    expect(validatePromiseTitle('a'.repeat(PROMISE_MAX_LENGTH))).toBeNull()
  })

  it('rejects one character past the boundary', () => {
    expect(validatePromiseTitle('a'.repeat(PROMISE_MAX_LENGTH + 1))).toBe(
      'too_long',
    )
  })

  it('measures the trimmed value', () => {
    const padded = `  ${'a'.repeat(PROMISE_MAX_LENGTH)}  `
    expect(validatePromiseTitle(padded)).toBeNull()
  })
})

describe('validateUsername', () => {
  it('accepts letters, digits and underscores', () => {
    expect(validateUsername('player1')).toBeNull()
    expect(validateUsername('Player_One')).toBeNull()
    expect(validateUsername('___')).toBeNull()
  })

  it('rejects names that are too short or too long', () => {
    expect(validateUsername('ab')).toBe('invalid_format')
    expect(validateUsername('a'.repeat(21))).toBe('invalid_format')
  })

  it('accepts the boundary lengths', () => {
    expect(validateUsername('abc')).toBeNull()
    expect(validateUsername('a'.repeat(20))).toBeNull()
  })

  it('rejects empty input', () => {
    expect(validateUsername('')).toBe('invalid_format')
  })

  it('rejects disallowed characters', () => {
    expect(validateUsername('player one')).toBe('invalid_format')
    expect(validateUsername('player-one')).toBe('invalid_format')
    expect(validateUsername('player.one')).toBe('invalid_format')
    expect(validateUsername('игрок1')).toBe('invalid_format')
  })

  it('rejects route names that would collide with the app', () => {
    expect(validateUsername('dashboard')).toBe('reserved')
    expect(validateUsername('login')).toBe('reserved')
    expect(validateUsername('api')).toBe('reserved')
  })

  it('rejects reserved names regardless of case', () => {
    expect(validateUsername('Dashboard')).toBe('reserved')
    expect(validateUsername('ADMIN')).toBe('reserved')
  })
})
