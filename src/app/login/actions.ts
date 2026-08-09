'use server';

import { createClient } from '@/utils/supabase/server';
import { redirect } from 'next/navigation';
import { refusalMessage, withinRateLimit } from '@/lib/rate-limit';

export async function login(formData: FormData) {
  // Checked before the credentials are read, so a caller cannot learn anything
  // about an address by how long the rejection takes.
  const budget = await withinRateLimit('signin');
  if (budget !== 'allowed') {
    return { error: refusalMessage(budget) };
  }

  const supabase = await createClient();

  const email = formData.get('email') as string;
  const password = formData.get('password') as string;

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { error: error.message };
  }

  redirect('/dashboard');
}

export async function signup(formData: FormData) {
  const budget = await withinRateLimit('signup');
  if (budget !== 'allowed') {
    return { error: refusalMessage(budget) };
  }

  const supabase = await createClient();

  const email = formData.get('email') as string;
  const password = formData.get('password') as string;
  
  // To redirect back to the app after email verification
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${siteUrl}/auth/callback`,
    },
  });

  if (error) {
    return { error: error.message };
  }

  return { success: true };
}
