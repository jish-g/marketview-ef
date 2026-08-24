'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { BarChart3, Moon, Sun } from 'lucide-react'
import { createAuthClient } from '@/lib/supabase/auth-client'

// Only the credential/existence signal is genericized — naming it would
// confirm whether the admin email is registered. Errors the user can act on
// are passed through, and anything unexpected is reported as such.
function loginErrorMessage(error: unknown): string {
  const { code, status } = (error ?? {}) as { code?: string; status?: number }
  if (code === 'email_not_confirmed') return 'Please confirm the account email before signing in.'
  if (code === 'over_request_rate_limit' || status === 429) return 'Too many attempts. Please wait a moment and try again.'
  if (code === 'invalid_credentials') return 'Invalid email or password.'
  return 'Something went wrong. Please try again.'
}

export default function LoginPage() {
  const [dark, setDark] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  useEffect(() => { document.documentElement.classList.toggle('dark', dark) }, [dark])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const supabase = createAuthClient()
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
      router.push('/dashboard')
    } catch (error: unknown) {
      console.error('[v0] Login error:', error)
      setError(loginErrorMessage(error))
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
        <form className="login-card" onSubmit={handleSubmit}>
          <p className="eyebrow">Admin sign in</p>
          <h1>Sign in to MarketCue</h1>
          <p className="login-lede">Access the Trade execution desk.</p>

          <label className="login-field">
            <span>Email</span>
            <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@example.com" />
          </label>
          <label className="login-field">
            <span>Password</span>
            <input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>

          {error && <p className="login-error">{error}</p>}

          <button type="submit" className="action-button action-button-success login-submit" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </section>
    </main>
  )
}
