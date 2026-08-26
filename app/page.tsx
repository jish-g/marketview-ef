'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, BarChart3, BookOpen, CheckCircle2, Clock3, Gauge, LogIn, LogOut, Moon, Newspaper, Sun } from 'lucide-react'
import { useSession } from '@/hooks/use-session'

const differentiators = [
  { icon: Gauge, title: 'Reads, not just reports', description: 'Weighted bias scoring from Gap, OI, PCR, and Max Pain — not a raw data dump.' },
  { icon: Clock3, title: 'Built for the full session', description: 'Pre-market call, Mid-market check, Post-close review — same logic every time.' },
  { icon: BookOpen, title: 'Rules you can audit', description: 'Every recommendation traces to a documented scoring rule, not a black box.' },
  { icon: CheckCircle2, title: 'One verdict, not six charts', description: 'Collapses the decision into a single strategy recommendation with reasoning.' },
]

export default function LandingPage() {
  const [dark, setDark] = useState(false)
  const { session, loading, signOut } = useSession()
  useEffect(() => { document.documentElement.classList.toggle('dark', dark) }, [dark])

  return (
    <main className="landing-shell">
      <header className="landing-topbar">
        <div className="brand-mark">
          <div className="brand-symbol"><BarChart3 size={16} /></div>
          <div><strong>MarketCue</strong><span>TRADE ANALYSIS PLATFORM</span></div>
        </div>
        <div className="topbar-meta">
          {!loading && (session ? (
            <button type="button" className="sign-in-link" onClick={() => signOut()}><LogOut size={13} /> Sign out</button>
          ) : (
            <Link href="/login" className="sign-in-link"><LogIn size={13} /> Sign in</Link>
          ))}
          <button className="icon-button" onClick={() => setDark(!dark)} aria-label="Toggle theme">
            {dark ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>
      </header>

      <section className="landing-card landing-hero-card">
        <div className="landing-hero">
          <p className="eyebrow">Market intelligence platform</p>
          <h1 className="landing-headline">Everyone gives you data. We read it.</h1>
          <p className="landing-lede">A daily read on Nifty and Sensex, built from a rules engine you can audit — not a black box.</p>
          <div className="landing-hero-ctas">
            <Link href="/dashboard" className="landing-cta-primary">Enter dashboard <ArrowRight size={15} /></Link>
            <Link href="/nifty-sensex-today" className="landing-cta-secondary"><Newspaper size={15} /> Nifty and Sensex today</Link>
          </div>
        </div>
        <div className="landing-stat-strip">
          <span className="landing-stat-meta">Sample read · as on 26 Aug 2026, 12:16 pm</span>
          <div className="landing-stat-grid">
            <div><span>Nifty</span><strong>24,610 <em className="positive">+0.31%</em></strong></div>
            <div><span>Sensex</span><strong>80,210 <em className="negative">-0.18%</em></strong></div>
            <div><span>India VIX</span><strong>13.2</strong></div>
            <div><span>Expiry</span><strong>3d</strong></div>
          </div>
        </div>
      </section>

      <section className="landing-card">
        <p className="eyebrow">Why MarketCue</p>
        <p className="landing-body-text">Raw options data — gap, OI, PCR, max pain, IV, VIX — is available everywhere and looks the same on every terminal. The edge isn&apos;t access to data, it&apos;s reading it the same disciplined way every session.</p>
        <p className="landing-body-text">MarketCue runs that data through a documented, rules-based framework to produce one read instead of six charts to interpret yourself.</p>
      </section>

      <section className="landing-card">
        <p className="eyebrow">What makes it different</p>
        <div className="landing-diff-grid">
          {differentiators.map(({ icon: Icon, title, description }) => (
            <article className="landing-diff-card" key={title}>
              <Icon size={18} />
              <strong>{title}</strong>
              <p>{description}</p>
            </article>
          ))}
        </div>
      </section>

      <footer className="landing-footer">
        <Link href="/dashboard" className="landing-cta-primary">Enter dashboard <ArrowRight size={15} /></Link>
      </footer>
    </main>
  )
}
