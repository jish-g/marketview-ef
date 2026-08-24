'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Activity, ArrowRight, BarChart3, BookOpen, CheckCircle2, Clock3, Gauge, Layers3, Moon, Sun } from 'lucide-react'

const differentiators = [
  { icon: Gauge, title: 'Reads, not just reports', description: 'Weighted bias scoring from Gap, OI, PCR, and Max Pain — not a raw data dump.' },
  { icon: Clock3, title: 'Built for the full session', description: 'Pre-market call, Mid-market check, Post-close review — same logic every time.' },
  { icon: BookOpen, title: 'Rules you can audit', description: 'Every recommendation traces to a documented scoring rule, not a black box.' },
  { icon: CheckCircle2, title: 'One verdict, not six charts', description: 'Collapses the decision into a single strategy recommendation with reasoning.' },
]

const sessionMap = [
  { label: 'Pre-market', icon: Clock3 },
  { label: 'Market open', icon: Activity },
  { label: 'Verdict', icon: CheckCircle2 },
  { label: 'Mid-market', icon: Gauge },
  { label: 'Post-market', icon: Layers3 },
  { label: 'History', icon: BarChart3 },
]

export default function LandingPage() {
  const [dark, setDark] = useState(false)
  useEffect(() => { document.documentElement.classList.toggle('dark', dark) }, [dark])

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

      <section className="landing-hero">
        <p className="eyebrow">Market Intelligence Platform</p>
        <h1 className="landing-wordmark">MarketCue</h1>
        <p className="landing-tagline">Market Intelligence, Not Just Market Data</p>
        <p className="landing-lede">Everyone gives you data. We read it.</p>

        <div className="landing-verdict-card" aria-label="Sample verdict card">
          <div className="landing-verdict-head">
            <span className="eyebrow">Sample verdict</span>
            <h3>NIFTY</h3>
          </div>
          <div className="landing-verdict-badges">
            <span className="landing-verdict-badge landing-verdict-badge-danger">Bearish</span>
            <span className="landing-verdict-badge landing-verdict-badge-warning">Caution</span>
          </div>
          <strong className="landing-verdict-strategy">Put Credit Spread</strong>
          <p className="landing-verdict-reasoning">Bearish bias with expensive IV, so selling premium instead of buying.</p>
        </div>

        <Link href="/dashboard" className="detailed-read-link landing-cta">Enter Dashboard <ArrowRight size={15} /></Link>
      </section>

      <section className="landing-positioning">
        <p className="eyebrow">Why MarketCue</p>
        <p>Raw options data — gap, OI, PCR, max pain, IV, VIX — is available everywhere and looks the same on every terminal. The edge isn&apos;t access to data, it&apos;s reading it the same disciplined way every session.</p>
        <p>MarketCue runs that data through a 3-stage framework — Bias, Option Readiness, Strategy Recommendation — to produce one verdict instead of six charts to interpret yourself.</p>
      </section>

      <section className="landing-comparison">
        <p className="eyebrow">Raw data vs. our read</p>
        <div className="landing-comparison-grid">
          <div className="landing-comparison-col landing-comparison-raw">
            <span className="side-label">What every terminal shows you</span>
            <ul className="landing-raw-list">
              <li><span>Gap</span><b>-0.42%</b></li>
              <li><span>PCR</span><b>0.91</b></li>
              <li><span>Max pain</span><b>24300</b></li>
              <li><span>ATM IV</span><b>14.2</b></li>
              <li><span>India VIX</span><b>12.6</b></li>
              <li><span>OI resistance</span><b>Addition</b></li>
            </ul>
          </div>
          <div className="landing-comparison-col landing-comparison-read">
            <span className="side-label">What we tell you</span>
            <strong className="landing-comparison-headline">Bearish · Caution</strong>
            <p>Put Credit Spread. One read, one decision.</p>
          </div>
        </div>
      </section>

      <section className="landing-differentiators">
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
        <Link href="/dashboard" className="detailed-read-link landing-cta">Enter Dashboard <ArrowRight size={15} /></Link>
        <div className="landing-session-map">
          <span className="side-label">Session map</span>
          <div className="landing-session-list">
            {sessionMap.map(({ label, icon: Icon }) => (
              <span className="landing-session-item" key={label}><Icon size={14} /> {label}</span>
            ))}
          </div>
        </div>
      </footer>
    </main>
  )
}
