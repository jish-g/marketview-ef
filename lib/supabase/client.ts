import { createBrowserClient } from '@supabase/ssr'

// This app reads from an existing, externally-managed Supabase project
// (populated by two scheduled automations outside this app). The table is
// exposed to `anon` with RLS restricted to SELECT only — no writes, no
// migrations. The publishable key below is safe to expose client-side.
const PREMARKET_SUPABASE_URL =
  process.env.NEXT_PUBLIC_PREMARKET_SUPABASE_URL || 'https://vkcklvoizfpbnjdgaxai.supabase.co'
const PREMARKET_SUPABASE_KEY =
  process.env.NEXT_PUBLIC_PREMARKET_SUPABASE_KEY || 'sb_publishable_-am88LW21cvkYYA_H9vqWA_K42a7bXG'

export function createClient() {
  return createBrowserClient(PREMARKET_SUPABASE_URL, PREMARKET_SUPABASE_KEY)
}
