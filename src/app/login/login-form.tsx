'use client'

import Link from 'next/link'
import { useActionState, useState } from 'react'
import Field from '@/components/ui/field'
import PixelButton from '@/components/ui/pixel-button'
import { login, signup } from './actions'

type LoginMode = 'login' | 'signup'

/**
 * Every settled outcome carries the mode it came from.
 *
 * That guards a narrower case than it first appears. Switching modes also
 * marks the outcome stale (see `stale` below), which alone would hide a
 * message from the mode the user left. What the mode tag additionally covers
 * is an outcome arriving *after* the user has moved on and submitted again:
 * the new submission clears `stale`, so without the tag a rejected sign-in
 * could surface on the sign-up form it never belonged to.
 *
 * `check_email` carries it for the same reason — a signup confirmation
 * resolving after a switch to sign-in announced a registration to someone
 * looking at a login form.
 */
type LoginState =
  | { status: 'idle' }
  | { status: 'error'; message: string; mode: LoginMode }
  | { status: 'check_email'; mode: LoginMode }

const INITIAL_STATE: LoginState = { status: 'idle' }

export default function LoginForm() {
  const [isLogin, setIsLogin] = useState(true)

  // useActionState cannot reset its own state from an event handler, only by
  // running the action again — so leaving a mode has to be recorded
  // separately. Anything the user navigates away from is stale: the outcome
  // described an attempt they have since abandoned.
  //
  // Cleared at the start of every submission, so the next attempt shows its
  // own result.
  //
  // Tagging the outcome with its mode is not enough on its own. Leaving a
  // mode and coming back makes the tag match again, and the message returns —
  // an error the user had already dismissed by walking away. That defect
  // survived a passing test: the test asserted before the action resolved, so
  // it was measuring an empty form and would have passed against any
  // implementation at all.
  const [stale, setStale] = useState(false)

  function switchTo(mode: LoginMode) {
    setIsLogin(mode === 'login')
    setStale(true)
  }

  // The wrapper runs on the client and calls the existing server actions, so
  // their signatures stay untouched.
  const [state, action, pending] = useActionState(
    async (_prev: LoginState, formData: FormData): Promise<LoginState> => {
      setStale(false)
      const mode: LoginMode = isLogin ? 'login' : 'signup'

      if (isLogin) {
        // On success login() redirects, which throws a control-flow exception,
        // so nothing after this await runs and the component unmounts.
        const result = await login(formData)
        return result?.error
          ? { status: 'error', message: result.error, mode }
          : { status: 'idle' }
      }

      const result = await signup(formData)
      if (result?.error) {
        return { status: 'error', message: result.error, mode }
      }
      return { status: 'check_email', mode }
    },
    INITIAL_STATE,
  )

  const currentMode: LoginMode = isLogin ? 'login' : 'signup'

  // The one place the two staleness rules are applied, so a future outcome
  // cannot be rendered having passed only one of them.
  const outcome =
    state.status !== 'idle' && !stale && state.mode === currentMode
      ? state
      : null

  if (outcome?.status === 'check_email') {
    return (
      <div className="flex flex-col items-center gap-6 text-center">
        <p role="status">REGISTRATION SUCCESSFUL</p>
        <p className="font-mono text-xs text-ink-muted">
          Check your email to verify the account before signing in.
        </p>
        <PixelButton
          type="button"
          variant="primary"
          full
          onClick={() => switchTo('login')}
        >
          Back to sign in
        </PixelButton>
        <Link href="/" className="font-mono text-xs underline">
          Back to home
        </Link>
      </div>
    )
  }

  return (
    <form action={action} className="flex flex-col gap-6">
      {outcome?.status === 'error' ? (
        <p role="alert" className="font-mono text-xs text-streak">
          {outcome.message}
        </p>
      ) : null}

      <Field id="email" label="Email">
        <input
          type="email"
          id="email"
          name="email"
          className="nes-input"
          autoComplete="email"
          required
        />
      </Field>

      <Field
        id="password"
        label="Password"
        hint={isLogin ? undefined : 'At least 6 characters.'}
      >
        <input
          type="password"
          id="password"
          name="password"
          className="nes-input"
          autoComplete={isLogin ? 'current-password' : 'new-password'}
          aria-describedby={isLogin ? undefined : 'password-hint'}
          required
        />
      </Field>

      <PixelButton type="submit" variant="primary" full aria-busy={pending}>
        {pending ? 'PLEASE WAIT...' : isLogin ? 'SIGN IN' : 'SIGN UP'}
      </PixelButton>

      <button
        type="button"
        className="font-mono text-xs underline"
        onClick={() => switchTo(isLogin ? 'signup' : 'login')}
      >
        {isLogin
          ? 'No account yet? Sign up'
          : 'Already have an account? Sign in'}
      </button>

      <Link href="/" className="text-center font-mono text-xs underline">
        Back to home
      </Link>
    </form>
  )
}
