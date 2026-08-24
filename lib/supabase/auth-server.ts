import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// Server-side counterpart to `lib/supabase/auth-client.ts`, for the same
// single-admin auth project. Used only by the /auth/callback route that
// exchanges a signup confirmation code for a session.
export async function createAuthServerClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookieOptions: { secure: process.env.NODE_ENV === 'production' },
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
          } catch {
            // Called from a Server Component render; safe to ignore since
            // this app doesn't rely on proxy-based session refresh.
          }
        },
      },
    },
  )
}
