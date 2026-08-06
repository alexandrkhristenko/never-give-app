import { createClient } from '@/utils/supabase/server';
import { redirect } from 'next/navigation';
import { type Provider } from '@supabase/supabase-js';

export async function POST(request: Request) {
  const formData = await request.formData();
  const provider = formData.get('provider') as Provider;

  if (provider) {
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
  }
  
  redirect('/?error=Could not authenticate');
}
