'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { ArrowRight, BarChart3, BookOpen, CheckCircle2, Clock3, Gauge, LogIn, LogOut, Moon, Newspaper, Sun } from 'lucide-react'
import { useSession } from '@/hooks/use-session'
import { createClient } from '@/lib/supabase/client'

const differentiators = [
  { icon: Gauge, title: 'Reads, not just reports', description: 'Weighted bias scoring from Gap, OI, PCR, and Max Pain — not a raw data dump.' },
  { icon: Clock3, title: 'Built for the full session', description: 'Pre-market call, Mid-market check, Post-close review — same logic every time.' },
  { icon: BookOpen, title: 'Rules you can audit', description: 'Every recommendation traces to a documented scoring rule, not a black box.' },
  { icon: CheckCircle2, title: 'One read, not six charts', description: 'Collapses the session into a single, explained read.' },
]

const howItWorks = [
  { step: '01', title: 'We capture the session', description: 'Gap, OI, PCR, IV, and VIX, pulled at every phase of the trading day.' },
  { step: '02', title: 'Rules produce a read', description: 'A documented scoring framework, not a model guessing at patterns.' },
  { step: '03', title: 'You get one clear read', description: 'Published pre-market and post-market, every session.' },
]

type Row = Record<string, any>

function fmtPct(v: any) {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return `${n > 0 ? '+' : ''}${v}%`
}
function tone(v: any) {
  const n = Number(v)
  return Number.isNaN(n) || n === 0 ? '' : n > 0 ? 'positive' : 'negative'
}
function todayIST() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}
function nowLabelIST() {
  return new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date())
}
function istHour() {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', hour: 'numeric', hour12: false }).format(new Date()))
}

export default function LandingPage() {
  const [dark, setDark] = useState(false)
  const { session, loading, signOut } = useSession()
  useEffect(() => { document.documentElement.classList.toggle('dark', dark) }, [dark])
  const supabase = createClient()

  const tradeDate = todayIST()
  const preferPost = istHour() >= 20

  const { data: pre } = useSWR(['home-premarket', tradeDate], async () => {
    const { data, error } = await supabase.from('premarket_dashboard').select('gap_points_nifty, gap_points_sensex, prev_close_nifty, prev_close_sensex, india_vix, days_to_expiry_nifty, days_to_expiry_sensex, market_bias_nifty, market_bias_sensex').eq('trade_date', tradeDate).maybeSingle()
    if (error) throw error
    return data as Row | null
  })

  const { data: post } = useSWR(['home-postmarket', tradeDate], async () => {
    const { data, error } = await supabase.from('postmarket_summary').select('day_change_pct_nifty, day_change_pct_sensex, day_high_nifty, day_low_nifty, day_high_sensex, day_low_sensex, recap_story_nifty, recap_story_sensex').eq('trade_date', tradeDate).maybeSingle()
    if (error) throw error
    return data as Row | null
  })

  const showPost = preferPost && !!post
  const gapPctNifty = pre?.gap_points_nifty != null && pre?.prev_close_nifty ? +((Number(pre.gap_points_nifty) / Number(pre.prev_close_nifty)) * 100).toFixed(2) : null
  const gapPctSensex = pre?.gap_points_sensex != null && pre?.prev_close_sensex ? +((Number(pre.gap_points_sensex) / Number(pre.prev_close_sensex)) * 100).toFixed(2) : null

  const readLine = showPost
    ? (post?.recap_story_nifty ?? null)
    : (pre?.market_bias_nifty ? `Nifty ${String(pre.market_bias_nifty).toLowerCase()}, Sensex ${String(pre?.market_bias_sensex ?? pre.market_bias_nifty).toLowerCase()} — today's opening read.` : null)

  return (
    <main className="landing-shell">
      <header className="landing-topbar">
        <div className="brand-mark">
          <div className="brand-symbol"><BarChart3 size={16} /></div>
          <div><strong>MarketCue</strong><span>TRADE ANALYSIS PLATFORM</span></div>
        </div>
        <div className="topbar-meta">
          <Link href="/dashboard" className="topbar-link">Dashboard</Link>
          <Link href="/nifty-sensex-today" className="topbar-link">Nifty and Sensex today</Link>
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

      <section className="landing-hero">
        <div className="landing-hero-copy">
          <p className="eyebrow">Market intelligence platform</p>
          <h1 className="landing-headline">Everyone gives you data. <span className="landing-headline-accent">We read it.</span></h1>
          <p className="landing-lede">A daily read on Nifty and Sensex, built from a rules engine you can audit — not a black box.</p>
          <div className="landing-hero-ctas">
            <Link href="/dashboard" className="landing-cta-primary">Enter dashboard <ArrowRight size={15} /></Link>
            <Link href="/nifty-sensex-today" className="landing-cta-secondary"><Newspaper size={15} /> Nifty and Sensex today</Link>
          </div>
        </div>

        <div className="landing-hero-showcase">
          <div className="landing-snapshot-card">
            <div className="landing-snapshot-head">
              <span className="landing-live-dot" aria-hidden="true" />
              <span className="landing-snapshot-meta">{showPost ? 'Post-market' : 'Pre-market'} snapshot · {nowLabelIST()}</span>
              <span className={`landing-snapshot-badge ${showPost ? 'landing-snapshot-badge-post' : 'landing-snapshot-badge-pre'}`}>{showPost ? 'Post-market' : 'Pre-market'}</span>
            </div>
            <div className="landing-snapshot-rows">
              <div className="landing-snapshot-row">
                <div>
                  <span className="landing-snapshot-row-label">Nifty 50</span>
                  <span className="landing-snapshot-row-sub">{showPost ? (post?.day_low_nifty != null && post?.day_high_nifty != null ? `${post.day_low_nifty} – ${post.day_high_nifty}` : '') : (pre?.days_to_expiry_nifty != null ? `${pre.days_to_expiry_nifty}d to expiry` : '')}</span>
                </div>
                <div className="landing-snapshot-row-value">
                  <span className="landing-snapshot-row-tag">{showPost ? 'Closed' : 'Gap'}</span>
                  <strong>{showPost ? (fmtPct(post?.day_change_pct_nifty) && <em className={tone(post?.day_change_pct_nifty)}>{fmtPct(post?.day_change_pct_nifty)}</em>) : (gapPctNifty != null && <em className={tone(gapPctNifty)}>{fmtPct(gapPctNifty)}</em>)}</strong>
                </div>
              </div>
              <div className="landing-snapshot-divider" />
              <div className="landing-snapshot-row">
                <div>
                  <span className="landing-snapshot-row-label">Sensex</span>
                  <span className="landing-snapshot-row-sub">{showPost ? (post?.day_low_sensex != null && post?.day_high_sensex != null ? `${post.day_low_sensex} – ${post.day_high_sensex}` : '') : (pre?.days_to_expiry_sensex != null ? `${pre.days_to_expiry_sensex}d to expiry` : '')}</span>
                </div>
                <div className="landing-snapshot-row-value">
                  <span className="landing-snapshot-row-tag">{showPost ? 'Closed' : 'Gap'}</span>
                  <strong>{showPost ? (fmtPct(post?.day_change_pct_sensex) && <em className={tone(post?.day_change_pct_sensex)}>{fmtPct(post?.day_change_pct_sensex)}</em>) : (gapPctSensex != null && <em className={tone(gapPctSensex)}>{fmtPct(gapPctSensex)}</em>)}</strong>
                </div>
              </div>
            </div>
            {!showPost && pre?.india_vix != null && (
              <div className="landing-snapshot-vix">
                <span>India VIX</span>
                <strong>{pre.india_vix}</strong>
              </div>
            )}
            {readLine && (
              <div className="landing-snapshot-note">
                <p>{readLine}</p>
              </div>
            )}
            <div className="landing-snapshot-link">
              <Link href="/nifty-sensex-today">Read the full {showPost ? 'post-market' : 'pre-market'} call <ArrowRight size={13} /></Link>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-band landing-positioning">
        <div className="landing-section-inner">
          <p className="eyebrow">Why MarketCue</p>
          <p className="landing-body-text">Raw options data — gap, OI, PCR, max pain, IV, VIX — is available everywhere and looks the same on every terminal. The edge isn&apos;t access to data, it&apos;s reading it the same disciplined way every session.</p>
          <p className="landing-body-text">MarketCue runs that data through a documented, rules-based framework to produce one read instead of six charts to interpret yourself.</p>
        </div>
      </section>

      <section className="landing-differentiators">
        <p className="eyebrow">What makes it different</p>
        <div className="landing-diff-grid">
          {differentiators.map(({ icon: Icon, title, description }) => (
            <article className="landing-diff-card" key={title}>
              <span className="landing-diff-icon"><Icon size={17} /></span>
              <strong>{title}</strong>
              <p>{description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-band landing-how">
        <div className="landing-section-inner">
          <p className="eyebrow">How it works</p>
          <div className="landing-how-grid">
            {howItWorks.map(({ step, title, description }) => (
              <article className="landing-how-card" key={step}>
                <span className="landing-how-step">{step}</span>
                <strong>{title}</strong>
                <p>{description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="landing-closing">
        <div className="landing-closing-card">
          <div className="landing-closing-ctas">
            <Link href="/dashboard" className="landing-cta-primary">Enter dashboard <ArrowRight size={15} /></Link>
            <Link href="/nifty-sensex-today" className="landing-cta-secondary"><Newspaper size={15} /> Nifty and Sensex today</Link>
          </div>
        </div>
      </section>

      <footer className="landing-footer">
        <div className="landing-footer-grid">
          <div className="landing-footer-brand">
            <div className="brand-mark">
              <div className="brand-symbol brand-symbol-sm"><BarChart3 size={13} /></div>
              <strong>MarketCue</strong>
            </div>
            <p>Market intelligence for Nifty and Sensex, built on rules you can audit.</p>
          </div>
          <div className="landing-footer-col">
            <span>Product</span>
            <Link href="/dashboard">Dashboard</Link>
            <Link href="/nifty-sensex-today">Nifty and Sensex today</Link>
            <Link href="/dashboard">Journal</Link>
          </div>
          <div className="landing-footer-col">
            <span>Session</span>
            <Link href="/dashboard">Pre-market</Link>
            <Link href="/dashboard">Mid-market</Link>
            <Link href="/dashboard">Post-market</Link>
          </div>
          <div className="landing-footer-col">
            <span>About</span>
            <Link href="/nifty-sensex-today">How it works</Link>
            <Link href="/nifty-sensex-today">Disclaimer</Link>
          </div>
        </div>
        <div className="landing-footer-bottom">
          <span>&copy; {new Date().getFullYear()} MarketCue. Not investment advice.</span>
          <span>Built on a rules-based market read engine</span>
        </div>
      </footer>
    </main>
  )
}
