'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { BarChart3, Moon, Sun } from 'lucide-react'
import { createAuthClient } from '@/lib/supabase/auth-client'

// Only the credential/existence signal is genericized — naming it would
// confirm whether an email is already registered. Errors the user can act
// on are passed through, and anything unexpected is reported as such.
function signupErrorMessage(error: unknown): string {
  const { code, status } = (error ?? {}) as { code?: string; status?: number }
  if (code === 'user_already_exists') return 'An account with that email already exists.'
  if (code === 'weak_password') return 'Please choose a stronger password.'
  if (code === 'over_request_rate_limit' || code === 'over_email_send_rate_limit' || status === 429) return 'Too many attempts. Please wait a moment and try again.'
  return 'Something went wrong. Please try again.'
}

export default function SignupPage() {
  const [dark, setDark] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [phone, setPhone] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => { document.documentElement.classList.toggle('dark', dark) }, [dark])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const supabase = createAuthClient()
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL ?? `${window.location.origin}/auth/callback`,
          data: { phone },
        },
      })
      if (error) throw error
      setSubmitted(true)
    } catch (error: unknown) {
      console.error('[v0] Signup error:', error)
      setError(signupErrorMessage(error))
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="landing-shell">
      <header className="landing-topbar">
        <div className="brand-mark">
          <div className="brand-symbol"><BarChart3 size={16} /></div>
          <div><strong>MarketCue</strong><span>TRADE ANALYSIS PLATFORM</span></div>
        </div>
        <button className="icon-button" onClick={() => setDark(!dark)} aria-label="Toggle theme">
          {dark ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </header>

      <section className="login-shell">
        {submitted ? (
          <div className="login-card">
            <p className="eyebrow">Almost there</p>
            <h1>Check your email</h1>
            <p className="login-lede">We sent a confirmation link to {email}. Verify your email before signing in.</p>
            <Link href="/login" className="action-button action-button-success login-submit text-center">
              Back to sign in
            </Link>
          </div>
        ) : (
          <form className="login-card" onSubmit={handleSubmit}>
            <p className="eyebrow">Create an account</p>
            <h1>Sign up for MarketCue</h1>
            <p className="login-lede">Get access to the dashboard.</p>

            <label className="login-field">
              <span>Email</span>
              <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
            </label>
            <label className="login-field">
              <span>Password</span>
              <input type="password" required autoComplete="new-password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
            <label className="login-field">
              <span>Phone number</span>
              <input type="tel" required autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 555 123 4567" />
            </label>

            {error && <p className="login-error">{error}</p>}

            <button type="submit" className="action-button action-button-success login-submit" disabled={loading}>
              {loading ? 'Creating account…' : 'Sign up'}
            </button>

            <p className="login-lede mt-3.5 text-center">
              Already have an account? <Link href="/login" className="text-foreground underline">Sign in</Link>
            </p>
          </form>
        )}
      </section>
    </main>
  )
}
