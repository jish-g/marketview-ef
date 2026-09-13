import { NextRequest, NextResponse } from 'next/server'
import { createAuthServerClient } from '@/lib/supabase/auth-server'

// Email-confirmation return leg for the /signup flow. The exchange both
// confirms the address and mints a session, and we keep that session: the
// user goes straight to the dashboard instead of being asked to type the
// password they just set.
//
// The tradeoff is that the emailed link *is* a login for as long as it is
// valid — anyone holding the mail (a forward, a shared inbox, a scanner
// that prefetches links) lands in signed in. Chosen deliberately for the
// smoother signup; revisit if accounts start carrying anything sensitive.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get('code')

  if (code) {
    const supabase = await createAuthServerClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}/dashboard`)
    }
  }

  return NextResponse.redirect(`${origin}/auth/error`)
}
