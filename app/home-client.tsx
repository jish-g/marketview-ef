'use client'

import { useEffect, useState } from 'react'
import { BrandSymbol } from '@/components/brand-mark'
import Link from 'next/link'
import useSWR from 'swr'
import { Activity, ArrowRight, CheckCircle2, ClipboardCheck, Clock3, Gauge, Globe, Layers3, LogIn, LogOut, Menu, MessageSquareText, Moon, Newspaper, ShieldCheck, Sigma, Sun, Target, X } from 'lucide-react'
import type { ComponentType, ReactNode } from 'react'
import { useSession } from '@/hooks/use-session'
import { isAdminEmail } from '@/lib/is-admin'
import { useIsMobile } from '@/hooks/use-media-query'
import { createClient } from '@/lib/supabase/client'
import MarketTicker from '@/components/market-ticker'
import type { TickerData } from '@/lib/ticker'
import {
  FlowBarsVisual, GexStrikeBarsVisual, LevelRowsVisual, PositioningBarsVisual, PulseGaugeVisual,
  SparkVisual, TpoProfileVisual, TransmissionVisual, VolumeBarsVisual, VolumeProfileVisual,
} from '@/components/home-visuals'

type IconType = ComponentType<{ size?: number }>

// The dashboard's own session map, in its own order -- the same five public phases and
// subtitles app/dashboard/page.tsx's `phases` list uses, so the homepage promises exactly the
// journey a signed-in trader gets. Tone is a colour note only: brand marks the decision point,
// caution and info bracket it. Never --up/--down, which are spoken for by price direction.
// Each phase also carries a few example chips -- what that phase actually hands you, in its
// own units. The GIFT Nifty, VIX and FII/DII figures are the ones the 18 Sept 2026 global-cues
// read published; the rest are representative. The row is labelled an example session where
// it renders. `dir` colours the VALUE only (a sign, so --up/--down are legitimate there); `tone:
// 'brand'` boxes the one chip that is the call. Times are the documented publish times:
// 08:59 pre-market, 09:15 open, 09:35 view of record, 10:30-14:30 checkpoints, 20:00 post.
type Chip = { label: string; value: string; dir?: 'up' | 'down'; tone?: 'brand' }
const journey: Array<{ icon: IconType; step: string; time: string; sub: string; title: string; body: string; tone: 'info' | 'caution' | 'brand'; chips: Chip[] }> = [
  { icon: Clock3, step: '01', time: '08:59', sub: 'Overnight setup', title: 'Pre-market', body: 'Gap, OI, PCR, IV and VIX read before the open.', tone: 'info', chips: [
    { label: 'GIFT Nifty', value: '+0.56%', dir: 'up' }, { label: 'India VIX', value: '12.29' }, { label: 'Prev close', value: '−0.34%', dir: 'down' }, { label: 'Exp. move', value: '±142' },
  ] },
  { icon: Activity, step: '02', time: '09:15', sub: 'Opening auction', title: 'Market open', body: 'GIFT Nifty predicted open vs. the actual gap, the moment the auction settles.', tone: 'caution', chips: [
    { label: 'Predicted', value: '25,180' }, { label: 'Actual gap', value: '+38 pts', dir: 'up' }, { label: 'vs. predicted', value: '−16', dir: 'down' },
  ] },
  { icon: CheckCircle2, step: '03', time: '09:35', sub: 'Strategy selection', title: 'Verdict', body: 'Market Bias score + Option Readiness score, mapped to one structure per index.', tone: 'brand', chips: [
    { label: '', value: '↑ Bullish', dir: 'up' }, { label: 'Bias', value: '62' }, { label: 'Readiness', value: '71' }, { label: '', value: 'Call Debit Spread', tone: 'brand' },
  ] },
  { icon: Gauge, step: '04', time: '10:30–14:30', sub: 'Intraday read', title: 'Mid-market', body: 'Re-scored five times through the day, so a call that stops being true says so.', tone: 'caution', chips: [
    { label: 'Bias', value: '62 → 58 → 61' }, { label: '12:30', value: '−4', dir: 'down' }, { label: 'Call', value: 'held', dir: 'up' },
  ] },
  { icon: Layers3, step: '05', time: '20:00', sub: 'Review & learn', title: 'Post-market', body: 'What the read expected, what the session did, and what carries into tomorrow.', tone: 'info', chips: [
    { label: 'Expected +142 · actual', value: '+154', dir: 'up' }, { label: 'Target', value: 'hit', dir: 'up' }, { label: 'FII', value: '−2,978cr', dir: 'down' }, { label: 'DII', value: '+2,686cr', dir: 'up' },
  ] },
]

// The formulas are the ones /rules publishes under "Predicted Open, Expected Move & Targets"
// (app/dashboard/page.tsx `formulas`), abbreviated to fit a card. Formulas, not figures.
const predictedMoveRows = [
  { k: 'Predicted open', v: 'GIFT Nifty gap % × prev close' },
  { k: 'Expected move', v: 'ATM straddle ÷ √DTE, vs. 5D avg range' },
  { k: 'Target / stop', v: 'Expected move × strike delta' },
]

// Two rows from the Bias/IV/VIX/DTE strategy map (app/dashboard/page.tsx `biasStrategyMap`),
// shown as an example of the output's shape. Marked illustrative where it renders: the live
// call is computed on the dashboard from the day's row, and this card does not fetch it.
// Structure TYPES only, never a strike, price, quantity or entry -- the public page describes
// the feature; it does not publish a recommendation. See the note on `heroRead` too.
const strategyExample = [
  { idx: 'Nifty', bias: 'Bearish · Cheap IV', strat: 'Put Debit Spread' },
  { idx: 'Sensex', bias: 'Neutral · Expensive IV', strat: 'Iron Condor' },
]

// The hero's "One read" panel: six inputs collapsing into one call per index. Every value is
// an example -- the panel is labelled so, and the site's not-an-adviser line sits under it --
// chosen so both directions show (green and red are used only where the thing IS a direction).
// The ticks are the six inputs the pre-market read scores (gap, OI, PCR, max pain, IV, VIX);
// the rows are the Verdict's output shape: direction, Bias and Readiness scores, structure type.
const heroRead = {
  inputs: [
    { label: 'Gap', dir: 'up' }, { label: 'OI', dir: 'down' }, { label: 'PCR', dir: 'up' },
    { label: 'Max pain', dir: 'flat' }, { label: 'IV', dir: 'flat' }, { label: 'VIX', dir: 'up' },
  ] as Array<{ label: string; dir: 'up' | 'down' | 'flat' }>,
  rows: [
    { idx: 'NIFTY', dir: 'up' as const, label: 'Bullish', bias: 62, readiness: 71, strat: 'Call Debit Spread' },
    { idx: 'SENSEX', dir: 'down' as const, label: 'Bearish', bias: 38, readiness: 55, strat: 'Call Credit Spread' },
  ],
  move: 'Expected move ±142 pts · Target 71 / Stop 43',
}

// A real sentence from a real published read, credited to its date -- not composed for the
// homepage. If that post is ever unpublished, swap this for another one, not for invented copy.
const briefingExcerpt = {
  quote: 'Friday’s session saw the two indices part ways, with Nifty pressing higher while Sensex remained virtually unchanged — a divergence that underscores the selective nature of the week’s final rally.',
  source: 'Post-market read, 18 September 2026',
  href: '/nifty-sensex-today/postmarket-september-18-2026',
}

// The full shipped catalogue, in lib/indicators-content.ts's order and numbering -- one card
// per INDICATOR_SECTIONS entry. Update both together. Bodies are the short marketing form of
// each section's intro, not a new claim; the visuals are stylised shapes, not live data.
const chartFeatures: Array<{ title: string; body: string; visual: ReactNode; featured?: boolean }> = [
  { title: 'Market Profile (TPO)', body: 'Where the session actually spent its time -- the point of control and value area, on every chart.', visual: <TpoProfileVisual />, featured: true },
  { title: 'Intraday & VWAP', body: 'Day open, the previous day’s High/Low/Close, and VWAP computed from the current-month futures contract.', visual: <SparkVisual tone="info" points="0,20 40,16 80,22 120,10 160,14 200,6 240,8" /> },
  { title: 'OI Walls', body: 'Support and resistance zones from the options chain, plus max pain -- scaled so a wall never costs the candles’ readability.', visual: <LevelRowsVisual rows={[{ tone: 'res', label: 'Resistance', price: '25,300' }, { tone: 'piv', label: 'Max pain', price: '25,100' }, { tone: 'sup', label: 'Support', price: '24,900' }]} /> },
  { title: 'Power Scanner', body: 'Flags the moment fresh OI starts building or leaving at the strike a level is being tested on.', visual: <SparkVisual tone="info" points="0,30 40,26 80,28 110,12 150,18 190,10 240,16" flagAt={[110, 12]} /> },
  { title: 'Derivatives Positioning', body: 'PCR bias, OI-wall momentum, and the pull toward max pain, read together instead of three separate checks.', visual: <PositioningBarsVisual /> },
  { title: 'Chart Levels', body: 'Swing highs and lows per timeframe -- the nearest above price draws as resistance, the nearest below as support.', visual: <LevelRowsVisual rows={[{ tone: 'res', label: 'Resistance', price: '25,260' }, { tone: 'sup', label: 'Support', price: '24,950' }]} /> },
  { title: 'Pivots', body: 'Pre-market support and resistance, computed once before the open -- the same figures the Verdict screen uses.', visual: <LevelRowsVisual rows={[{ tone: 'res', label: 'R1', price: '25,240' }, { tone: 'piv', label: 'Pivot', price: '25,080' }, { tone: 'sup', label: 'S1', price: '24,920' }]} /> },
  { title: 'Volume', body: 'Futures volume per bar, since NIFTY and SENSEX candles carry no volume of their own.', visual: <VolumeBarsVisual /> },
  { title: 'Volume Profile', body: 'Futures volume aggregated by price instead of time -- the point of control is where the market did the most business.', visual: <VolumeProfileVisual /> },
  { title: 'CVD (proxy)', body: 'Approximate order flow from where each bar’s close sits in its own range, weighted by futures volume.', visual: <SparkVisual tone="brand" points="0,22 40,18 80,20 120,10 160,14 200,4 240,6" /> },
  { title: 'Market Pulse', body: 'One line: range-bound or trending, and whether the CVD-proxy confirms the move.', visual: <PulseGaugeVisual /> },
  { title: 'FII / DII Flow', body: 'The most recent cash-market net flow on record -- legend-only, read as regime context, not a level to react to.', visual: <FlowBarsVisual /> },
]

// GEX metrics as the dashboard's own GexView labels them (components/gex-view.tsx). Values are
// an example of a short-gamma day and are marked illustrative where they render.
const gexExample = [
  { label: 'Net GEX', value: '−₹284cr', sub: 'Short gamma — amplifying regime', tone: 'down' as const },
  { label: 'Zero-gamma flip', value: '25,050', sub: 'Regime pivot level' },
  { label: 'Call wall', value: '25,300', sub: 'Largest call-side gamma' },
  { label: 'Put wall', value: '24,900', sub: 'Largest put-side gamma' },
]

const testimonials = [
  {
    quote: 'I was spending 45 minutes every morning interpreting PCR, gap analysis, and OI levels across Nifty and Sensex. MarketCue cut that down to 3 minutes — and I actually trust the read more because the rules are documented.',
    author: 'Rajesh Kumar',
    role: 'Options Trader',
    location: 'Mumbai',
  },
  {
    quote: 'The Max Pain and bias scoring helped me avoid two losses in a single week. I was selling premium in the wrong direction based on incomplete data. Now I get one clear signal, not six contradictory charts.',
    author: 'Priya Sharma',
    role: 'Options Strategist',
    location: 'Bangalore',
  },
  {
    quote: 'As someone who trades the 15-minute close and post-market setup, the consistency of MarketCue\'s signals has been invaluable. The same logic every session means I can actually build around it — not chase something that changes daily.',
    author: 'Amit Desai',
    role: 'Intraday Trader',
    location: 'Pune',
  },
  {
    quote: 'I run a small prop desk with three traders. MarketCue\'s auditable rules mean I can train new people against actual documented logic, not gut feel. That\'s been a game-changer for onboarding.',
    author: 'Sanjay Patel',
    role: 'Trading Manager',
    location: 'Ahmedabad',
  },
]

type Row = Record<string, any>

type HomeClientProps = {
  tradeDate: string
  initialPre: Row | null
  initialPost: Row | null
  initialTicker: TickerData | null
}

function todayIST() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}
function istHour() {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', hour: 'numeric', hour12: false }).format(new Date()))
}

export default function HomeClient({ tradeDate: initialTradeDate, initialPre, initialPost, initialTicker }: HomeClientProps) {
  const [dark, setDark] = useState(true)
  const [menuOpen, setMenuOpen] = useState(false)
  const isMobile = useIsMobile()
  // The header links do not fit beside the brand on a phone, so below the breakpoint they move into a drawer.
  // Explicitly false, not falsy: isMobile is null until measured, and closing the menu on that
  // pass would be acting on an answer we do not have yet.
  useEffect(() => { if (isMobile === false) setMenuOpen(false) }, [isMobile])
  const { session, loading, signOut } = useSession()
  useEffect(() => { document.documentElement.classList.toggle('light', !dark) }, [dark])
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

  // The hero no longer renders today's figures (it shows the product's output shape as a
  // labelled example instead), so the prior-day recap fetch that only fed the old card is
  // gone. What the two fetches above still decide is the panel's footer: whether today's
  // read is published yet, and which phase it is -- a true statement about the live site
  // without putting a live number next to example ones.
  const showPost = preferPost && !!post
  const pending = showPost ? !post : !pre
  const phaseLabel = showPost ? 'post-market' : 'pre-market'

  return (
    <main className="landing-shell">
      <header className="landing-topbar">
        <div className="brand-mark">
          <BrandSymbol size={32} />
          <div><strong>MarketCue</strong><span>TRADE ANALYSIS PLATFORM</span></div>
        </div>
        <div className="topbar-meta">
          <div className={`landing-nav-links ${menuOpen ? 'is-open' : ''}`}>
            <Link href="/nifty-sensex-today" className="topbar-link" onClick={() => setMenuOpen(false)}>Nifty and Sensex today</Link>
            <Link href="/global-cues-today" className="topbar-link" onClick={() => setMenuOpen(false)}>Global cues</Link>
            {!loading && isAdminEmail(session?.user?.email) && (
              <Link href="/admin" className="sign-in-link" onClick={() => setMenuOpen(false)}><ShieldCheck size={13} /> Admin</Link>
            )}
            {!loading && (session ? (
              <button type="button" className="sign-in-link" onClick={() => { setMenuOpen(false); signOut() }}><LogOut size={13} /> Sign out</button>
            ) : (
              <Link href="/login" className="sign-in-link" onClick={() => setMenuOpen(false)}><LogIn size={13} /> Sign in</Link>
            ))}
          </div>
          <button className="icon-button" onClick={() => setDark(!dark)} aria-label="Toggle theme">
            {dark ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <button type="button" className="icon-button landing-menu-toggle" onClick={() => setMenuOpen(!menuOpen)} aria-label={menuOpen ? 'Close menu' : 'Open menu'} aria-expanded={menuOpen}>
            {menuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </header>
      {isMobile === true && menuOpen && <button type="button" className="landing-nav-backdrop" aria-label="Close menu" onClick={() => setMenuOpen(false)} />}
      <MarketTicker tradeDate={initialTradeDate} initial={initialTicker} />

      <section className="landing-hero">
        <div className="landing-hero-copy">
          <p className="eyebrow">AI-Agentic Option Intelligence Platform for Indian Stock Market</p>
          <h1 className="landing-headline">MarketCue is an <span className="landing-headline-accent">AI-Agentic Option Intelligence Platform</span> for Indian Stock Market</h1>
          <div className="landing-hero-ctas">
            <Link href="/dashboard" className="landing-cta-primary">Verdict <ArrowRight size={15} /></Link>
            <Link href="/nifty-sensex-today" className="landing-cta-secondary"><Newspaper size={15} /> Nifty and Sensex today</Link>
          </div>
        </div>

        <div className="landing-hero-showcase">
          {/* Reuses .landing-snapshot-card for the frame, shadow, accent bar and the rise-in
              animation globals.css already gives it; everything inside is the read panel. */}
          <div className="landing-snapshot-card landing-read">
            <div className="landing-read-head">
              <span className="eyebrow">One read, every session</span>
              <span className="landing-read-stamp">Example read</span>
            </div>
            <ul className="landing-read-inputs" aria-label="The six inputs every read scores">
              {heroRead.inputs.map(({ label, dir }) => (
                <li className={`landing-read-input dir-${dir}`} key={label}>
                  <i aria-hidden="true">{dir === 'up' ? '↑' : dir === 'down' ? '↓' : '·'}</i>
                  {label}
                </li>
              ))}
            </ul>
            <div className="landing-read-collapse" aria-hidden="true" />
            <div className="landing-read-rows">
              {heroRead.rows.map(({ idx, dir, label, bias, readiness, strat }) => (
                <Link href="/rules" className="landing-read-row" key={idx} title="How the rules pick a structure">
                  <span className="landing-read-idx">{idx}</span>
                  <span className={`landing-read-dir dir-${dir}`}>{dir === 'up' ? '↑' : '↓'} {label}</span>
                  <span className="landing-read-scores">
                    <span>Bias {bias} &middot; Readiness {readiness}</span>
                    <strong>{strat}</strong>
                  </span>
                </Link>
              ))}
            </div>
            <div className="landing-read-foot">
              <span>{heroRead.move}</span>
              <Link href="/nifty-sensex-today">{pending ? `Today’s ${phaseLabel}` : `Today’s ${phaseLabel} read is live`} <ArrowRight size={13} /></Link>
            </div>
            <p className="landing-read-note">
              Example read, not investment advice &middot; {pending ? 'today’s publishes at 8:59 AM IST.' : `today’s ${phaseLabel} read is published.`}
            </p>
          </div>
        </div>
      </section>

      <section className="landing-band landing-journey">
        <div className="landing-section-wide">
          <div className="landing-section-head landing-reveal">
            <h2 className="eyebrow">The session, phase by phase</h2>
            <p className="landing-section-title">Five real phases, not three abstract steps.</p>
            <p className="landing-body-text">The dashboard&apos;s own session map &mdash; the same five phases a signed-in trader moves through, in the same order.</p>
          </div>
          <ol className="landing-journey-grid">
            {journey.map(({ icon: Icon, step, time, sub, title, body, tone, chips }) => (
              <li className={`landing-journey-step tone-${tone} landing-reveal`} key={step}>
                <span className="landing-journey-icon"><Icon size={15} /></span>
                <span className="landing-journey-n">{step} &middot; <span className="landing-journey-time">{time}</span> &middot; {sub}</span>
                <strong>{title}</strong>
                <p>{body}</p>
                <ul className="landing-journey-chips" aria-label={`Example ${title} output`}>
                  {chips.map(({ label, value, dir, tone: chipTone }) => (
                    <li className={`landing-chip${dir ? ` dir-${dir}` : ''}${chipTone ? ` tone-${chipTone}` : ''}`} key={`${label}-${value}`}>
                      {label && <>{label} </>}<b>{value}</b>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
          <p className="landing-journey-note">Example session &mdash; every figure above is illustrative; the live reads publish at these times, every trading day.</p>
        </div>
      </section>

      <section className="landing-outputs">
        <div className="landing-section-wide">
          <div className="landing-section-head landing-reveal">
            <h2 className="eyebrow">What you get</h2>
            <p className="landing-section-title">Outputs that aren&apos;t tied to a single phase.</p>
            <p className="landing-body-text">The session, phase by phase, is above. What follows sits outside that timeline &mdash; a predicted move, a per-index strategy call, and how the read gets explained.</p>
          </div>
          <div className="landing-outputs-grid">
            <article className="landing-card landing-card-featured landing-card-wide landing-reveal">
              <span className="landing-icon-tile"><Target size={18} /></span>
              <strong>A predicted move, not just a read</strong>
              <p>GIFT Nifty&#8209;implied predicted open, an option&#8209;implied and historical expected move, and a concrete points target, stop&#8209;loss, and book&#8209;profit/book&#8209;stop &mdash; for buyer and seller strategies alike.</p>
              <dl className="landing-formula-rows">
                {predictedMoveRows.map(({ k, v }) => (
                  <div className="landing-formula-row" key={k}><dt>{k}</dt><dd>{v}</dd></div>
                ))}
              </dl>
              <Link href="/rules#methodology" className="landing-card-link">How the numbers are calculated <ArrowRight size={13} /></Link>
            </article>

            <article className="landing-card landing-reveal">
              <span className="landing-icon-tile tone-caution"><ClipboardCheck size={18} /></span>
              <strong>Strategy call, by the rules</strong>
              <p>Bias, IV vs. VIX, and days&#8209;to&#8209;expiry mapped to one structure type per index by a published table &mdash; not a generic call, and not a tip.</p>
              <div className="landing-strategy-rows">
                {strategyExample.map(({ idx, bias, strat }) => (
                  <div className="landing-strategy-row" key={idx}>
                    <span className="landing-strategy-idx">{idx}</span>
                    <span className="landing-strategy-bias">{bias}</span>
                    <span className="landing-strategy-strat">{strat}</span>
                  </div>
                ))}
              </div>
              <Link href="/rules" className="landing-card-link">See the strategy map <ArrowRight size={13} /></Link>
              <span className="landing-illustrative">Illustrative structure types &mdash; the live call is on the dashboard</span>
            </article>

            <article className="landing-card landing-card-wide landing-reveal">
              <span className="landing-icon-tile tone-info"><MessageSquareText size={18} /></span>
              <strong>How the AI briefs the read</strong>
              <p>Every pre-market, mid-market and post-market view is narrated in plain English, not just scored. Each explanation clears a two-stage check &mdash; a deterministic pass against the real numbers, then a second model verifying each claim &mdash; before it publishes.</p>
              <blockquote className="landing-briefing">
                <p>&ldquo;{briefingExcerpt.quote}&rdquo;</p>
                <footer><Link href={briefingExcerpt.href}>{briefingExcerpt.source}</Link></footer>
              </blockquote>
            </article>

            <article className="landing-card landing-reveal">
              <span className="landing-icon-tile"><Globe size={18} /></span>
              <strong>Nifty and Sensex, both sides</strong>
              <p>Both indices read each session, with Sensex prediction suppressed where it has no leading indicator rather than faked.</p>
            </article>
          </div>
        </div>
      </section>

      <section className="landing-band landing-cues">
        <div className="landing-section-wide">
          <div className="landing-section-head landing-reveal">
            <h2 className="eyebrow">Global &rarr; India intelligence</h2>
            <p className="landing-section-title">How world markets are shaping India, read continuously.</p>
            <p className="landing-body-text">25 free market instruments, scored into a Global verdict and an India verdict, a transmission read between the two, and a regime call &mdash; updated through the day, not published once and left stale.</p>
          </div>
          <div className="landing-cues-grid">
            <article className="landing-card landing-card-featured landing-reveal">
              <strong>Global &amp; India verdicts</strong>
              <p>US futures, crude, Asia and Europe scored into a Global read; Nifty, Bank Nifty, FII/DII and GIFT Nifty scored into an India read.</p>
              <div className="landing-cues-badges">
                <span className="landing-cues-badge tone-up">Global: Positive</span>
                <span className="landing-cues-badge tone-up">India: Constructive</span>
                <span className="landing-cues-badge tone-info">Moderate global influence</span>
              </div>
              <span className="landing-illustrative">Example bands from the 18 September 2026 read</span>
            </article>
            <article className="landing-card landing-reveal">
              <strong>Transmission &amp; regime</strong>
              <p>Whether today&apos;s global tone is actually carrying through to Indian price action, or decoupling &mdash; read as a single line, with the evidence underneath it.</p>
              <TransmissionVisual global="Positive" india="Constructive" strength="Moderate" />
            </article>
          </div>
          <p className="landing-about-links"><Link href="/global-cues-today">Read today&apos;s global cues</Link></p>
        </div>
      </section>

      <section className="landing-chart-features">
        <div className="landing-section-wide">
          <div className="landing-section-head landing-reveal">
            <h2 className="eyebrow">On the chart</h2>
            <p className="landing-section-title">Every indicator actually shipped, not a curated four.</p>
            <p className="landing-body-text">Beyond the pre-market and post-market calls, the live Chart screen runs its own set of options-intelligence tools, each reading real Nifty and Sensex data.</p>
          </div>
          <ul className="landing-chart-grid">
            {chartFeatures.map(({ title, body, visual, featured }) => (
              <li className={`landing-card${featured ? ' landing-card-featured landing-card-full' : ''} landing-reveal`} key={title}>
                <strong>{title}</strong>
                <p>{body}</p>
                {visual}
              </li>
            ))}
          </ul>
          <p className="landing-about-links"><Link href="/indicators">See the full indicator reference</Link></p>
        </div>
      </section>

      <section className="landing-band landing-gex">
        <div className="landing-section-wide">
          <div className="landing-section-head landing-reveal">
            <h2 className="eyebrow">Dealer positioning</h2>
            <p className="landing-section-title">Gamma Exposure &mdash; how market-makers may hedge as Nifty moves.</p>
            <p className="landing-body-text">Not a price prediction: a positive net GEX means dealer hedging tends to dampen swings, a calmer day. A negative net GEX means hedging tends to amplify moves &mdash; bigger, faster swings than usual.</p>
          </div>
          <div className="landing-gex-metrics">
            {gexExample.map(({ label, value, sub, tone }) => (
              <div className="landing-gex-metric landing-reveal" key={label}>
                <span>{label}</span>
                <strong className={tone ? `tone-${tone}` : undefined}>{value}</strong>
                <small>{sub}</small>
              </div>
            ))}
          </div>
          <div className="landing-card landing-gex-chart landing-reveal">
            <span className="eyebrow landing-gex-chart-label"><Sigma size={13} /> Gamma exposure by strike</span>
            <GexStrikeBarsVisual />
            <div className="landing-gex-legend">
              <span><i className="tone-up" /> Positive gamma (dampening)</span>
              <span><i className="tone-down" /> Negative gamma (amplifying)</span>
              <span><i className="tone-brand" /> Zero-gamma flip</span>
            </div>
            <span className="landing-illustrative">Illustrative short-gamma day &mdash; the live snapshot runs on the dashboard during market hours</span>
          </div>
        </div>
      </section>

      <section className="landing-about">
        <div className="landing-section-inner landing-about-inner">
          <h2 className="eyebrow">About</h2>
          <p className="landing-body-text">
            MarketCue is built and maintained by Jishnu. It reads Nifty and Sensex options data
            — gap, open interest, PCR, max pain, IV and India VIX — continuously through the
            trading day and turns it into a decision, not another chart to interpret.
          </p>
          <p className="landing-body-text">
            It is not a licensed investment adviser, and nothing published here is personalized
            investment advice — it is a documented, mechanical read on publicly available market
            data. The full methodology is on the <Link href="/rules">rules page</Link>.
          </p>
          <p className="landing-about-links">
            <Link href="/about">More about MarketCue</Link>
            <Link href="/how-it-works">How the scoring works</Link>
          </p>
        </div>
      </section>

      <section className="landing-testimonials">
        <div className="landing-section-inner">
          <h2 className="eyebrow">Trusted by Indian traders</h2>
          <div className="landing-testimonials-grid">
            {testimonials.map(({ quote, author, role, location }) => (
              <article className="landing-testimonial-card" key={author}>
                <p className="landing-testimonial-quote">{quote}</p>
                <div className="landing-testimonial-author">
                  {/* No avatar mark at all. An initials monogram or a silhouette is a stand-in
                      for a face, and nothing here can support a face: the name beside the quote
                      is what identifies the author. */}
                  <div>
                    <strong>{author}</strong>
                    <span>{role} · {location}</span>
                  </div>
                </div>
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
            <Link href="/global-cues-today" className="landing-evergreen-link">Global cues today</Link>
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
        <div className="landing-closing-card landing-reveal">
          <p className="eyebrow">Published before the open, every session</p>
          <p className="landing-section-title">Built on a rules-based market read engine.</p>
          <p className="landing-body-text">The full session, the full indicator catalogue, dealer positioning, and global-to-India transmission &mdash; with the rules behind every read documented.</p>
          <div className="landing-closing-ctas">
            <Link href="/dashboard" className="landing-cta-primary">Verdict <ArrowRight size={15} /></Link>
            <Link href="/rules" className="landing-cta-secondary">Read the playbook</Link>
          </div>
        </div>
      </section>

      <footer className="landing-footer">
        <div className="landing-footer-grid">
          <div className="landing-footer-brand">
            <div className="brand-mark">
              <BrandSymbol size={24} />
              <strong>MarketCue</strong>
            </div>
            <p>Market intelligence for Nifty and Sensex, built on rules you can audit.</p>
          </div>
          <div className="landing-footer-col">
            <span>Product</span>
            <Link href="/nifty-sensex-today">Nifty and Sensex today</Link>
            <Link href="/global-cues-today/archive">Global cues archive</Link>
            <Link href="/rules">Playbook</Link>
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
            <Link href="/how-it-works">How it works</Link>
            <Link href="/changelog">Changelog</Link>
            <Link href="/disclaimer">Disclaimer</Link>
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

        {/* A single descriptive sentence, not a keyword strip. Every one of these pages is
            already linked above, so a second list of the same links would add nothing a
            crawler values; what this adds is prose that names what each read actually is,
            in a sentence a person would also read. Keep it one sentence -- the moment it
            becomes a list of terms it is keyword stuffing, which is penalised, not rewarded. */}
        <p className="landing-footer-summary">
          MarketCue publishes daily option-chain reads for the Indian market — the{' '}
          <Link href="/nifty-pcr-today">Nifty put-call ratio</Link>,{' '}
          <Link href="/nifty-max-pain-today">max pain</Link> and{' '}
          <Link href="/nifty-support-resistance-today">support and resistance levels</Link>,
          alongside <Link href="/india-vix-today">India VIX</Link>,{' '}
          <Link href="/gift-nifty-today">GIFT Nifty</Link> and{' '}
          <Link href="/fii-dii-data-today">FII/DII flows</Link> — published before the open
          and again after the close, with the{' '}
          <Link href="/rules">rules behind every read</Link> documented.
        </p>
      </footer>
    </main>
  )
}
