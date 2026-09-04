'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import useSWR from 'swr'
import { BarChart3, Moon, Send, Sun, ArrowLeft, ArrowRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

type Post = { id: string; trade_date: string; instrument: 'NIFTY' | 'SENSEX' | 'BOTH'; phase: 'premarket' | 'postmarket'; slug: string; title: string; body: string; badges: string[]; published_at: string }
type Row = Record<string, any>

type PrevPost = { slug: string; title: string; phase: 'premarket' | 'postmarket'; trade_date: string }
type EvergreenLink = { href: string; label: string }

type DetailClientProps = {
  initialPost: Post | null
  initialMarketRow: Row | null
  publishedAtIST: string | null
  previousPost: PrevPost | null
  evergreenLink: EvergreenLink | null
}

function formatDateLabel(dateStr: string) {
  return new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(`${dateStr}T00:00:00`))
}

// The generated headline already carries its own "| MarketCue" suffix --
// stripped here so the visible H1 doesn't double up, mirroring the same fix
// applied to <title> and the Article schema headline in page.tsx.
function bareHeadline(title: string): string {
  return title.replace(/\s*\|\s*MarketCue\s*$/i, '').trim()
}

const BODY_SECTION_HEADINGS = ['What the option chain shows', 'Bias and readiness', 'Levels to watch']

// The generated body (data.body) is one flowing block of prose from the
// external rules engine, with no per-paragraph topic tags -- so rather than
// rewriting the generated copy to fit predetermined sections, this splits
// the existing paragraphs into three roughly even groups under the three
// required H2s, preserving the generated text verbatim.
function bodySections(body: string): { heading: string; paragraphs: string[] }[] {
  const paragraphs = body.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
  const perSection = Math.max(1, Math.ceil(paragraphs.length / BODY_SECTION_HEADINGS.length))
  return BODY_SECTION_HEADINGS.map((heading, i) => ({
    heading,
    paragraphs: paragraphs.slice(i * perSection, (i + 1) * perSection),
  }))
}

function fmtPct(v: any) {
  if (v === null || v === undefined || v === '') return '—'
  const n = Number(v)
  return `${n > 0 ? '+' : ''}${v}%`
}
function fmtNum(v: any, suffix = '') {
  if (v === null || v === undefined || v === '') return '—'
  return `${v}${suffix}`
}
function tone(v: any) {
  const n = Number(v)
  return Number.isNaN(n) || n === 0 ? '' : n > 0 ? 'positive' : 'negative'
}
function ptsSuffix(v: any) {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return `${n > 0 ? '+' : ''}${v} pts`
}

// "Read" column text below reuses the exact band definitions published on
// /rules (VIX Score, Gap %, DTE Score) so the table's interpretation can
// never drift from the documented methodology it's describing.
function vixRead(v: any): string {
  if (v == null || v === '') return '—'
  const n = Number(v)
  if (n < 11) return 'Thin, theta-heavy premium'
  if (n <= 14) return 'Ideal, low-risk premium'
  if (n <= 18) return 'Elevated premium'
  if (n <= 22) return 'High — IV crush risk'
  return 'Blocks fresh option buying'
}
function gapRead(pct: any): string {
  if (pct == null || pct === '') return '—'
  const n = Number(pct)
  if (n > 0.75) return 'Strong Gap Up'
  if (n >= 0.25) return 'Normal Gap Up'
  if (n >= -0.25) return 'Flat'
  if (n >= -0.75) return 'Normal Gap Down'
  return 'Strong Gap Down'
}
function dteRead(d: any): string {
  if (d == null || d === '') return '—'
  const n = Number(d)
  if (n <= 1) return 'High gamma risk'
  if (n <= 4) return 'Ideal window'
  return 'Lower gamma risk'
}
function closeRead(pct: any): string {
  if (pct == null || pct === '') return '—'
  const n = Number(pct)
  if (n > 0) return 'Bullish close'
  if (n < 0) return 'Bearish close'
  return 'Flat close'
}

type MetricRow = { metric: string; value: ReactNode; read: string }

function buildMetricRows(isPre: boolean, marketRow: Row): MetricRow[] {
  if (isPre) {
    return [
      { metric: 'India VIX', value: fmtNum(marketRow.india_vix), read: vixRead(marketRow.india_vix) },
      {
        metric: 'GIFT Nifty Gap (Nifty expected to open)',
        value: <span className={tone(marketRow.gift_nifty_gap_pct)}>{fmtPct(marketRow.gift_nifty_gap_pct)}{ptsSuffix(marketRow.gift_nifty_gap_pts) ? ` (${ptsSuffix(marketRow.gift_nifty_gap_pts)})` : ''}</span>,
        read: gapRead(marketRow.gift_nifty_gap_pct),
      },
      { metric: 'Nifty Expiry', value: fmtNum(marketRow.days_to_expiry_nifty, marketRow.days_to_expiry_nifty === 1 ? ' day' : ' days'), read: dteRead(marketRow.days_to_expiry_nifty) },
      { metric: 'Sensex Expiry', value: fmtNum(marketRow.days_to_expiry_sensex, marketRow.days_to_expiry_sensex === 1 ? ' day' : ' days'), read: dteRead(marketRow.days_to_expiry_sensex) },
      { metric: 'Nifty 5D Avg Move', value: `${fmtNum(marketRow.avg_move_5d_nifty)} pts`, read: `Support ${fmtNum(marketRow.oi_support_nifty)} · Resistance ${fmtNum(marketRow.oi_resistance_nifty)}` },
      { metric: 'Sensex 5D Avg Move', value: `${fmtNum(marketRow.avg_move_5d_sensex)} pts`, read: `Support ${fmtNum(marketRow.oi_support_sensex)} · Resistance ${fmtNum(marketRow.oi_resistance_sensex)}` },
    ]
  }
  return [
    { metric: 'Nifty Closed', value: <span className={tone(marketRow.day_change_pct_nifty)}>{fmtPct(marketRow.day_change_pct_nifty)}</span>, read: closeRead(marketRow.day_change_pct_nifty) },
    { metric: 'Sensex Closed', value: <span className={tone(marketRow.day_change_pct_sensex)}>{fmtPct(marketRow.day_change_pct_sensex)}</span>, read: closeRead(marketRow.day_change_pct_sensex) },
    { metric: 'Nifty Range', value: `${fmtNum(marketRow.day_low_nifty)} – ${fmtNum(marketRow.day_high_nifty)}`, read: 'Full session range' },
    { metric: 'Sensex Range', value: `${fmtNum(marketRow.day_low_sensex)} – ${fmtNum(marketRow.day_high_sensex)}`, read: 'Full session range' },
    { metric: 'Nifty Close Price', value: fmtNum(marketRow.close_nifty), read: marketRow.target_hit_nifty ? 'Target hit' : marketRow.sl_hit_nifty ? 'Stop hit' : 'Neither target nor stop hit' },
    { metric: 'Sensex Close Price', value: fmtNum(marketRow.close_sensex), read: marketRow.target_hit_sensex ? 'Target hit' : marketRow.sl_hit_sensex ? 'Stop hit' : 'Neither target nor stop hit' },
  ]
}

export default function NiftySensexTodayPostClient({ initialPost, initialMarketRow, publishedAtIST, previousPost, evergreenLink }: DetailClientProps) {
  const params = useParams<{ slug: string }>()
  const [dark, setDark] = useState(false)
  useEffect(() => { document.documentElement.classList.toggle('dark', dark) }, [dark])
  const supabase = createClient()

  const { data, error } = useSWR(
    ['blog-post', params.slug],
    async () => {
      const { data, error } = await supabase.from('blog_posts').select('*').eq('slug', params.slug).maybeSingle()
      if (error) throw error
      return data as Post | null
    },
    { fallbackData: initialPost }
  )

  const { data: marketRow } = useSWR(
    data ? ['blog-post-market', data.trade_date, data.phase] : null,
    async () => {
      const table = data!.phase === 'premarket' ? 'premarket_dashboard' : 'postmarket_summary'
      const { data: row, error } = await supabase.from(table).select('*').eq('trade_date', data!.trade_date).maybeSingle()
      if (error) throw error
      return row as Row | null
    },
    { fallbackData: data?.slug === initialPost?.slug ? initialMarketRow : undefined }
  )

  const isPre = data?.phase === 'premarket'

  return (
    <main className="blog-post-shell">
      <header className="blog-index-topbar">
        <Link href="/" className="brand-mark blog-brand-mark">
          <div className="brand-symbol"><BarChart3 size={16} /></div>
          <div><strong>MarketCue</strong><span>TRADE ANALYSIS PLATFORM</span></div>
        </Link>
        <div className="topbar-meta">
          <a href="https://t.me/marketcue_in" target="_blank" rel="noopener noreferrer" className="sign-in-link"><Send size={13} /> Join Telegram</a>
          <button className="icon-button" onClick={() => setDark(!dark)} aria-label="Toggle theme">
            {dark ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>
      </header>

      <div className="blog-post-main">
        <nav className="blog-post-breadcrumb" aria-label="Breadcrumb">
          <Link href="/">Home</Link><span aria-hidden="true"> / </span>
          <Link href="/nifty-sensex-today">Nifty &amp; Sensex Today</Link>
          {data && <><span aria-hidden="true"> / </span><span>{bareHeadline(data.title)}</span></>}
        </nav>
        <Link href="/nifty-sensex-today" className="blog-post-back"><ArrowLeft size={13} /> All Nifty & Sensex Today posts</Link>

        {error && <p className="history-empty">Unable to load this post right now.</p>}
        {!error && data === undefined && <p className="history-empty">Loading...</p>}
        {data === null && <p className="history-empty">Post not found — it may have been unpublished.</p>}

        {data && (
          <>
            <div className="blog-post-header">
              <div className="blog-post-badges">
                <span className={`blog-post-badge blog-post-badge-${data.phase}`}>{data.phase === 'premarket' ? 'Pre-market' : 'Post-market'}</span>
              </div>
              <h1 className="blog-post-title">{bareHeadline(data.title)}</h1>
              <time className="blog-post-time" dateTime={publishedAtIST ?? undefined}>{formatDateLabel(data.trade_date)}</time>
            </div>

            {marketRow && (
              <section className="blog-scorecard">
                <p className="blog-scorecard-eyebrow">{isPre ? 'Pre-market readout' : 'Post-market readout'}</p>
                <table className="blog-metrics-table">
                  <thead>
                    <tr><th scope="col">Metric</th><th scope="col">Value</th><th scope="col">Read</th></tr>
                  </thead>
                  <tbody>
                    {buildMetricRows(isPre, marketRow).map((row) => (
                      <tr key={row.metric}>
                        <th scope="row">{row.metric}</th>
                        <td>{row.value}</td>
                        <td>{row.read}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}

            <div className="blog-post-body">
              {bodySections(data.body).map(({ heading, paragraphs }) => (
                paragraphs.length > 0 && (
                  <section key={heading}>
                    <h2>{heading}</h2>
                    {paragraphs.map((para, i) => <p key={i}>{para}</p>)}
                  </section>
                )
              ))}
            </div>

            <nav className="blog-post-related" aria-label="Related reading">
              <p className="eyebrow">Related reading</p>
              <ul>
                {previousPost && (
                  <li>
                    <Link href={`/nifty-sensex-today/${previousPost.slug}`}>
                      Previous session: {formatDateLabel(previousPost.trade_date)} {previousPost.phase === 'premarket' ? 'pre-market' : 'post-market'} read
                    </Link>
                  </li>
                )}
                <li><Link href="/nifty-sensex-today">All Nifty &amp; Sensex Today reads</Link></li>
                <li><Link href="/rules">The MarketCue rules engine methodology</Link></li>
                {evergreenLink && <li><Link href={evergreenLink.href}>{evergreenLink.label}</Link></li>}
              </ul>
            </nav>

            <div className="blog-post-cta">
              <div className="blog-post-cta-text">
                <strong>Want the live, session-by-session read?</strong>
                <span>The dashboard updates through the day — this post is a fixed snapshot.</span>
              </div>
              <Link href="/dashboard" className="blog-post-cta-link">Open live Verdict on the dashboard <ArrowRight size={15} /></Link>
            </div>
          </>
        )}
      </div>
    </main>
  )
}
