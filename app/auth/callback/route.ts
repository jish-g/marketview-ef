import { NextRequest, NextResponse } from 'next/server'
import { createAuthServerClient } from '@/lib/supabase/auth-server'

// Exchanges the Supabase email-confirmation `?code=` for a session. Required
// for the /signup email link flow to complete instead of erroring.
//
// The exchange is what marks the address confirmed, but the session it mints
// would otherwise sign the visitor straight into the dashboard — anyone
// holding the emailed link (a forwarded mail, a shared inbox) would be in
// without ever proving they know the password. So the session is discarded
// immediately and the user is sent to /login to sign in normally.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get('code')

  if (code) {
    const supabase = await createAuthServerClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      await supabase.auth.signOut({ scope: 'local' })
      return NextResponse.redirect(`${origin}/login?confirmed=1`)
    }
  }

  return NextResponse.redirect(`${origin}/auth/error`)
}
