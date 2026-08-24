import { createBrowserClient } from '@supabase/ssr'

// Dedicated client for the single-admin auth project connected to this app.
// Distinct from `lib/supabase/client.ts`, which points at a separate,
// externally-managed Supabase project used only for market data.
export function createAuthClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookieOptions: { secure: process.env.NODE_ENV === 'production' },
    },
  )
}
