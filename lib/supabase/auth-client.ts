import { createBrowserClient } from '@supabase/ssr'

// Dedicated client for auth/session, kept separate from `lib/supabase/client.ts` (market
// data reads) so each caller only pulls in the concern it needs. NEXT_PUBLIC_SUPABASE_URL
// here and the market-data project in `lib/supabase/client.ts` are, in fact, the same
// Supabase project -- confirmed by querying auth.users directly (see supabase/functions/
// admin-users) -- despite this file previously documenting them as separate projects.
export function createAuthClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookieOptions: { secure: process.env.NODE_ENV === 'production' },
    },
  )
}
