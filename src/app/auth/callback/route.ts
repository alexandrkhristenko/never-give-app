import { redirect } from 'next/navigation'
import { type AuthErrorCode } from '@/lib/auth-errors'
import { logError } from '@/lib/log'
import { createClient } from '@/utils/supabase/server'

/**
 * Which of our codes a Supabase refusal amounts to.
 *
 * The provider's own vocabulary is longer than ours and not ours to stabilise,
 * so anything unmapped becomes `failed` — a sentence we can stand behind —
 * rather than being passed through.
 */
function classify(error: string, code: string | null): AuthErrorCode {
  if (error === 'access_denied') return 'denied'
  if (code === 'otp_expired' || error === 'expired_token') return 'expired'
  return 'failed'
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const error = url.searchParams.get('error')

  // Supabase reports a refused or expired sign-in by sending the person back
  // here with these parameters. Reading `code` alone meant every one of those
  // ended up at /dashboard, which bounced them to /login with nothing said.
  if (error) {
    const outcome = classify(error, url.searchParams.get('error_code'))
    // `error_description` is the provider's sentence, and it is the only part
    // of this worth keeping — it is what tells the difference between a
    // cancelled consent screen and a misconfigured provider. It goes to the
    // log, not to the page.
    logError('auth.callback.refused', new Error(error), {
      outcome,
      description: url.searchParams.get('error_description'),
    })
    redirect(`/?error=${outcome}`)
  }

  if (!code) {
    // Arriving with neither a code nor a refusal means the flow did not
    // complete. Nothing to diagnose, but the person still needs telling.
    redirect('/?error=failed')
  }

  const supabase = await createClient()
  const { error: exchangeError } =
    await supabase.auth.exchangeCodeForSession(code)

  // The old version discarded this. An exchange fails on an expired link, a
  // replayed code, or a PKCE verifier that did not survive the round trip —
  // and every one of those looked exactly like success from here.
  if (exchangeError) {
    logError('auth.callback.exchange', exchangeError)
    redirect('/?error=failed')
  }

  redirect('/dashboard')
}
