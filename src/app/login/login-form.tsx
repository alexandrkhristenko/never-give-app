'use client'

import Link from 'next/link'
import { useActionState, useState } from 'react'
import Field from '@/components/ui/field'
import PixelButton from '@/components/ui/pixel-button'
import { login, signup } from './actions'

type LoginMode = 'login' | 'signup'

/**
 * An error carries the mode it came from. Without that, failing a sign-in and
 * then switching to sign-up leaves the old message on screen describing a flow
 * the user is no longer in.
 */
type LoginState =
  | { status: 'idle' }
  | { status: 'error'; message: string; mode: LoginMode }
  | { status: 'check_email' }

const INITIAL_STATE: LoginState = { status: 'idle' }

export default function LoginForm() {
  const [isLogin, setIsLogin] = useState(true)
  // useActionState has no way to reset its own state from an event handler,
  // only by running the action again. This flag lets "Back to sign in"
  // return to the form without waiting on that; it is cleared at the start
  // of every submission so a later signup still shows its own check-email
  // screen.
  const [checkEmailDismissed, setCheckEmailDismissed] = useState(false)

  // The wrapper runs on the client and calls the existing server actions, so
  // their signatures stay untouched.
  const [state, action, pending] = useActionState(
    async (_prev: LoginState, formData: FormData): Promise<LoginState> => {
      setCheckEmailDismissed(false)
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
      return { status: 'check_email' }
    },
    INITIAL_STATE,
  )

  if (state.status === 'check_email' && !checkEmailDismissed) {
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
          onClick={() => {
            setIsLogin(true)
            setCheckEmailDismissed(true)
          }}
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
      {state.status === 'error' &&
      state.mode === (isLogin ? 'login' : 'signup') ? (
        <p role="alert" className="font-mono text-xs text-streak">
          {state.message}
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
        onClick={() => setIsLogin((value) => !value)}
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
