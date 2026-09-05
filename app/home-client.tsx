'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { ArrowRight, BarChart3, BookOpen, CheckCircle2, Clock3, Gauge, LogIn, LogOut, Moon, Newspaper, Send, Sun } from 'lucide-react'
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

type HomeClientProps = {
  tradeDate: string
  initialPre: Row | null
  initialPost: Row | null
}

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

export default function HomeClient({ tradeDate: initialTradeDate, initialPre, initialPost }: HomeClientProps) {
  const [dark, setDark] = useState(false)
  const { session, loading, signOut } = useSession()
  useEffect(() => { document.documentElement.classList.toggle('dark', dark) }, [dark])
  const supabase = createClient()

  // Recomputed client-side too (not just trusting the server prop) so a tab left
  // open across midnight IST still re-keys onto the new trade date.
  const tradeDate = todayIST()
  const preferPost = istHour() >= 20

  const { data: pre } = useSWR(
    ['home-premarket', tradeDate],
    async () => {
      const { data, error } = await supabase.from('premarket_dashboard').select('prev_day_change_pct_nifty, prev_day_change_pct_sensex, prev_day_change_pts_nifty, prev_day_change_pts_sensex, india_vix, days_to_expiry_nifty, days_to_expiry_sensex, market_bias_nifty, market_bias_sensex').eq('trade_date', tradeDate).maybeSingle()
      if (error) throw error
      return data as Row | null
    },
    { fallbackData: tradeDate === initialTradeDate ? initialPre : undefined }
  )

  const { data: post } = useSWR(
    ['home-postmarket', tradeDate],
    async () => {
      const { data, error } = await supabase.from('postmarket_summary').select('day_change_pct_nifty, day_change_pct_sensex, day_high_nifty, day_low_nifty, day_high_sensex, day_low_sensex, recap_story_nifty, recap_story_sensex').eq('trade_date', tradeDate).maybeSingle()
      if (error) throw error
      return data as Row | null
    },
    { fallbackData: tradeDate === initialTradeDate ? initialPost : undefined }
  )

  // Pre-market note line: the "today's opening read" this used to show reads
  // market_bias_nifty/sensex, which is only computed once the 9:30 AM open phase runs -- so
  // showing it on the 8:58 AM pre-market card was either blank or stale. What's genuinely
  // known at that hour is how the PRIOR day went, so this fetches the most recent
  // postmarket_summary row strictly before today and shows a short recap of that instead --
  // same "prefer the AI recap_story, fall back to a short rules sentence" pattern already used
  // on the dashboard's own Pre-market banner (see app/dashboard/page.tsx priorDayLines).
  const { data: priorDay } = useSWR(
    ['home-priorday', tradeDate],
    async () => {
      const { data, error } = await supabase.from('postmarket_summary').select('trade_date, day_change_pct_nifty, day_change_pct_sensex, recap_story_nifty').lt('trade_date', tradeDate).order('trade_date', { ascending: false }).limit(1).maybeSingle()
      if (error) throw error
      return data as Row | null
    }
  )

  const showPost = preferPost && !!post
  const pending = showPost ? !post : !pre
  // Pre-market can't know today's gap -- that needs today's actual open price, which doesn't
  // exist until the market opens at 9:15 AM. What IS genuinely known pre-market is how the
  // prior session closed, so the card shows "Prev close" (% and points) instead of a "Gap" that
  // would otherwise always read null/misleading before the open phase has run.
  const fmtPrevClose = (pct: any, pts: any) => pct != null ? `${fmtPct(pct)}${pts != null ? ` (${Number(pts) > 0 ? '+' : ''}${Number(pts).toFixed(1)} pts)` : ''}` : null
  const prevCloseNifty = fmtPrevClose(pre?.prev_day_change_pct_nifty, pre?.prev_day_change_pts_nifty)
  const prevCloseSensex = fmtPrevClose(pre?.prev_day_change_pct_sensex, pre?.prev_day_change_pts_sensex)

  // Short fallback sentence when the prior day has no AI-phrased recap_story yet (e.g. it
  // predates that feature, or the AI call failed that day) -- built only from the prior day's
  // own close-to-close % move, so it stays honest about what's actually known rather than
  // guessing at bias language.
  const priorDayFallback = priorDay?.day_change_pct_nifty != null
    ? `Nifty closed ${Number(priorDay.day_change_pct_nifty) >= 0 ? '+' : ''}${priorDay.day_change_pct_nifty}%${priorDay.day_change_pct_sensex != null ? `, Sensex ${Number(priorDay.day_change_pct_sensex) >= 0 ? '+' : ''}${priorDay.day_change_pct_sensex}%` : ''} in the prior session.`
    : null

  const readLine = showPost
    ? (post?.recap_story_nifty ?? null)
    : (priorDay?.recap_story_nifty ?? priorDayFallback)

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
          <a href="https://t.me/marketcue_in" target="_blank" rel="noopener noreferrer" className="sign-in-link"><Send size={13} /> Join Telegram</a>
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
          <p className="eyebrow">Market intelligence for Nifty and Sensex option traders</p>
          <h1 className="landing-headline">Everyone gives you data. <span className="landing-headline-accent">We read it.</span></h1>
          <p className="landing-lede">The day&apos;s option data, read into bias and readiness — so the call is yours, with context behind it.</p>
          <div className="landing-hero-ctas">
            <Link href="/dashboard" className="landing-cta-primary">Enter dashboard <ArrowRight size={15} /></Link>
            <Link href="/nifty-sensex-today" className="landing-cta-secondary"><Newspaper size={15} /> Nifty and Sensex today</Link>
            <a href="https://t.me/marketcue_in" target="_blank" rel="noopener noreferrer" className="landing-cta-secondary"><Send size={15} /> Join Telegram</a>
          </div>
        </div>

        <div className="landing-hero-showcase">
          <div className="landing-snapshot-card">
            <div className="landing-snapshot-head">
              <span className="landing-live-dot" aria-hidden="true" />
              <span className="landing-snapshot-meta">{showPost ? 'Post-market' : 'Pre-market'} snapshot · {nowLabelIST()}</span>
              <span className={`landing-snapshot-badge ${showPost ? 'landing-snapshot-badge-post' : 'landing-snapshot-badge-pre'}`}>{showPost ? 'Post-market' : 'Pre-market'}</span>
            </div>
            {pending ? (
              <div className="landing-snapshot-pending">
                <p>{showPost ? 'Post-market wrap lands here shortly after the close.' : 'Pre-market snapshot lands here at 8:59 AM IST.'}</p>
              </div>
            ) : (
              <>
                <div className="landing-snapshot-rows">
                  <div className="landing-snapshot-row">
                    <div>
                      <span className="landing-snapshot-row-label">Nifty 50</span>
                      <span className="landing-snapshot-row-sub">{showPost ? (post?.day_low_nifty != null && post?.day_high_nifty != null ? `${post.day_low_nifty} – ${post.day_high_nifty}` : '') : (pre?.days_to_expiry_nifty != null ? `${pre.days_to_expiry_nifty}d to expiry` : '')}</span>
                    </div>
                    <div className="landing-snapshot-row-value">
                      <span className="landing-snapshot-row-tag">{showPost ? 'Closed' : 'Prev Close'}</span>
                      <strong>{showPost ? (fmtPct(post?.day_change_pct_nifty) && <em className={tone(post?.day_change_pct_nifty)}>{fmtPct(post?.day_change_pct_nifty)}</em>) : (prevCloseNifty != null && <em className={tone(pre?.prev_day_change_pct_nifty)}>{prevCloseNifty}</em>)}</strong>
                    </div>
                  </div>
                  <div className="landing-snapshot-divider" />
                  <div className="landing-snapshot-row">
                    <div>
                      <span className="landing-snapshot-row-label">Sensex</span>
                      <span className="landing-snapshot-row-sub">{showPost ? (post?.day_low_sensex != null && post?.day_high_sensex != null ? `${post.day_low_sensex} – ${post.day_high_sensex}` : '') : (pre?.days_to_expiry_sensex != null ? `${pre.days_to_expiry_sensex}d to expiry` : '')}</span>
                    </div>
                    <div className="landing-snapshot-row-value">
                      <span className="landing-snapshot-row-tag">{showPost ? 'Closed' : 'Prev Close'}</span>
                      <strong>{showPost ? (fmtPct(post?.day_change_pct_sensex) && <em className={tone(post?.day_change_pct_sensex)}>{fmtPct(post?.day_change_pct_sensex)}</em>) : (prevCloseSensex != null && <em className={tone(pre?.prev_day_change_pct_sensex)}>{prevCloseSensex}</em>)}</strong>
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
                  <Link href="/nifty-sensex-today">Read the full {showPost ? 'post-market' : 'pre-market'} <ArrowRight size={13} /></Link>
                </div>
              </>
            )}
          </div>
        </div>
      </section>

      <section className="landing-band landing-positioning">
        <div className="landing-section-inner">
          <h2 className="eyebrow">Why MarketCue</h2>
          <p className="landing-body-text">Raw options data — gap, OI, PCR, max pain, IV, VIX — is available everywhere and looks the same on every terminal. The edge isn&apos;t access to data, it&apos;s reading it the same disciplined way every session.</p>
          <p className="landing-body-text">MarketCue runs that data through a documented, rules-based framework to produce one read instead of six charts to interpret yourself.</p>
        </div>
      </section>

      <section className="landing-differentiators">
        <h2 className="eyebrow">What makes it different</h2>
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
          <h2 className="eyebrow">How it works</h2>
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

      <section className="landing-band landing-evergreen">
        <div className="landing-section-inner">
          <h2 className="eyebrow">Today's numbers</h2>
          <p className="landing-body-text">Live, single-metric reads that update on every checkpoint — each one pulled straight from the same rules engine behind the daily pre-market and post-market calls.</p>
          <div className="landing-evergreen-grid">
            <Link href="/india-vix-today" className="landing-evergreen-link">India VIX today</Link>
            <Link href="/gift-nifty-today" className="landing-evergreen-link">GIFT Nifty today</Link>
            <Link href="/sensex-option-chain" className="landing-evergreen-link">Sensex option chain</Link>
            <Link href="/nse-option-chain-analysis" className="landing-evergreen-link">NSE option chain analysis</Link>
            <Link href="/nifty-pcr-today" className="landing-evergreen-link">Nifty PCR today</Link>
            <Link href="/nifty-max-pain-today" className="landing-evergreen-link">Nifty Max Pain today</Link>
            <Link href="/nifty-support-resistance-today" className="landing-evergreen-link">Nifty support &amp; resistance today</Link>
            <Link href="/fii-dii-data-today" className="landing-evergreen-link">FII DII data today</Link>
          </div>
        </div>
      </section>

      <section className="landing-closing">
        <div className="landing-closing-card">
          <div className="landing-closing-ctas">
            <Link href="/nifty-sensex-today" className="landing-cta-primary"><Newspaper size={15} /> Nifty and Sensex today</Link>
            <Link href="/rules" className="landing-cta-secondary">Read the rules engine</Link>
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
            <Link href="/nifty-sensex-today">Nifty and Sensex today</Link>
            <Link href="/rules">Rules engine</Link>
            <Link href="/about">About</Link>
          </div>
          <div className="landing-footer-col">
            <span>Today's numbers</span>
            <Link href="/india-vix-today">India VIX</Link>
            <Link href="/gift-nifty-today">GIFT Nifty</Link>
            <Link href="/sensex-option-chain">Sensex option chain</Link>
          </div>
          <div className="landing-footer-col">
            <span>About</span>
            <Link href="/nifty-sensex-today">How it works</Link>
            <Link href="/nifty-sensex-today">Disclaimer</Link>
          </div>
          <div className="landing-footer-col">
            <span>Community</span>
            <a href="https://t.me/marketcue_in" target="_blank" rel="noopener noreferrer">Telegram channel</a>
            <a href="https://www.linkedin.com/company/marketcue-in" target="_blank" rel="noopener noreferrer">LinkedIn</a>
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
