'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'

export async function signOut(): Promise<void> {
  const supabase = await createClient()
  await supabase.auth.signOut()

  // Outside any try/catch: redirect() throws a control-flow exception.
  redirect('/')
}
