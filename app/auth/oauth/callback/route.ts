import { NextRequest, NextResponse } from 'next/server'
import { createAuthServerClient } from '@/lib/supabase/auth-server'

// OAuth (Google) return leg. Kept separate from /auth/callback on purpose:
// that route deliberately throws away the session it mints, because there
// the link arrives by email and holding it must not equal being signed in.
// Here the user just authenticated with Google in this browser, so the
// session is what we want and is kept.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get('code')
  const providerError = searchParams.get('error_code') ?? searchParams.get('error')

  if (code) {
    const supabase = await createAuthServerClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}/dashboard`)
    }
    return NextResponse.redirect(`${origin}/auth/error?error=${encodeURIComponent(error.code ?? 'exchange_failed')}`)
  }

  // Google or Supabase refused (consent denied, misconfigured client, …).
  return NextResponse.redirect(`${origin}/auth/error?error=${encodeURIComponent(providerError ?? 'oauth_no_code')}`)
}
