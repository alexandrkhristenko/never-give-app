import { createBrowserClient } from '@supabase/ssr'
import { supabaseCredentials } from './credentials'

export function createClient() {
  const { url, key } = supabaseCredentials()
  return createBrowserClient(url, key)
}
