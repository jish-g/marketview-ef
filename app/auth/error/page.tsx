import Link from 'next/link'
import { BarChart3 } from 'lucide-react'

// `error` comes from the URL, so it is attacker-controlled. Only rendered
// when it looks like a Supabase error code, never as free text someone can
// choose — otherwise this card would happily display their own copy.
export default async function AuthErrorPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams
  const code = params?.error
  const isErrorCode = typeof code === 'string' && /^[a-z0-9_]{1,64}$/.test(code)

  return (
    <main className="landing-shell">
      <header className="landing-topbar">
        <div className="brand-mark">
          <div className="brand-symbol"><BarChart3 size={16} /></div>
          <div><strong>MarketCue</strong><span>TRADE ANALYSIS PLATFORM</span></div>
        </div>
      </header>

      <section className="login-shell">
        <div className="login-card">
          <p className="eyebrow">Sign in error</p>
          <h1>Something went wrong</h1>
          <p className="login-lede">{isErrorCode ? `Code error: ${code}` : 'An unspecified error occurred confirming your account.'}</p>
          <Link href="/login" className="action-button action-button-success login-submit text-center">
            Back to sign in
          </Link>
        </div>
      </section>
    </main>
  )
}
