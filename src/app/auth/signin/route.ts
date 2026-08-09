import { redirect } from 'next/navigation';
import { type Provider } from '@supabase/supabase-js';
import { logError } from '@/lib/log';
import { createClient } from '@/utils/supabase/server';

export async function POST(request: Request) {
  const formData = await request.formData();
  const provider = formData.get('provider') as Provider;

  if (!provider) {
    // Nothing was chosen: the form was submitted without its hidden field.
    redirect('/?error=failed');
  }

  const supabase = await createClient();
  const url = new URL(request.url);
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: `${url.origin}/auth/callback`,
    },
  });

  if (data.url) {
    redirect(data.url);
  }

  // This used to be discarded, and the fall-through below composed a sentence
  // that no page ever read. The provider name is safe to record — it is a
  // fixed set chosen by our own markup, not user input.
  //
  // A provider that is simply switched off in the Supabase project does not
  // arrive here: `signInWithOAuth` returns a perfectly good authorize URL and
  // the refusal happens at that endpoint, in the browser, as a 400. What this
  // catches is the call itself failing, or answering without a URL.
  logError('auth.signin.start', error ?? new Error('no authorize url returned'), {
    provider,
  });
  redirect('/?error=failed');
}
