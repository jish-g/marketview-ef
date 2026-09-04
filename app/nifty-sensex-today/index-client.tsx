'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { BarChart3, Moon, Send, Sun, ArrowRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

type Post = { id: string; trade_date: string; instrument: 'NIFTY' | 'SENSEX' | 'BOTH'; phase: 'premarket' | 'postmarket'; slug: string; title: string; badges: string[]; published_at: string }
type Row = Record<string, any>
type DayGroup = { tradeDate: string; pre: Post | null; post: Post | null }

type IndexClientProps = {
  initialPosts: Post[]
  initialMarketRows: Record<string, Row>
  faqSlot?: React.ReactNode
}

function todayIST() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}
function formatDateLabel(dateStr: string) {
  return new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${dateStr}T00:00:00`))
}
function fmtPct(v: any) {
  if (v === null || v === undefined || v === '') return '—'
  const n = Number(v)
  return `${n > 0 ? '+' : ''}${v}%`
}
function tone(v: any) {
  const n = Number(v)
  return Number.isNaN(n) || n === 0 ? '' : n > 0 ? 'positive' : 'negative'
}
function biasFrom(pctNifty: any, pctSensex: any, openBiasNifty: any) {
  if (pctNifty != null || pctSensex != null) {
    const n = Number(pctNifty ?? pctSensex)
    if (Number.isNaN(n) || n === 0) return 'Neutral'
    return n > 0 ? 'Bullish' : 'Bearish'
  }
  if (openBiasNifty) return String(openBiasNifty)
  return '—'
}

export default function NiftySensexTodayIndexClient({ initialPosts, initialMarketRows, faqSlot }: IndexClientProps) {
  const [dark, setDark] = useState(false)
  useEffect(() => { document.documentElement.classList.toggle('dark', dark) }, [dark])
  const supabase = createClient()

  const { data, error } = useSWR(
    ['blog-posts', 'BOTH'],
    async () => {
      const { data, error } = await supabase.from('blog_posts').select('*').order('published_at', { ascending: false }).limit(60)
      if (error) throw error
      return (data ?? []) as Post[]
    },
    { fallbackData: initialPosts }
  )

  const posts = data ?? []
  const dayGroups: DayGroup[] = []
  for (const post of posts) {
    let group = dayGroups.find((g) => g.tradeDate === post.trade_date)
    if (!group) { group = { tradeDate: post.trade_date, pre: null, post: null }; dayGroups.push(group) }
    if (post.phase === 'premarket') group.pre = post
    else group.post = post
  }
  dayGroups.sort((a, b) => (a.tradeDate < b.tradeDate ? 1 : -1))

  const currentTradeDate = todayIST()
  const todayGroup = dayGroups.find((g) => g.tradeDate === currentTradeDate) ?? { tradeDate: currentTradeDate, pre: null, post: null }
  const olderGroups = dayGroups.filter((g) => g.tradeDate !== currentTradeDate)
  const dates = dayGroups.map((g) => g.tradeDate)

  const { data: marketRows } = useSWR(
    dates.length ? ['blog-index-market', dates.join(',')] : null,
    async () => {
      const [pre, post] = await Promise.all([
        supabase.from('premarket_dashboard').select('trade_date, gap_points_nifty, gap_points_sensex, prev_close_nifty, prev_close_sensex, market_bias_nifty, market_bias_sensex').in('trade_date', dates),
        supabase.from('postmarket_summary').select('trade_date, day_change_pct_nifty, day_change_pct_sensex').in('trade_date', dates),
      ])
      if (pre.error) throw pre.error
      if (post.error) throw post.error
      const map: Record<string, Row> = {}
      for (const r of pre.data ?? []) map[r.trade_date] = { ...map[r.trade_date], ...r }
      for (const r of post.data ?? []) map[r.trade_date] = { ...map[r.trade_date], ...r }
      return map
    },
    { fallbackData: Object.keys(initialMarketRows).length ? initialMarketRows : undefined }
  )

  function rowFor(tradeDate: string) {
    return marketRows?.[tradeDate] ?? null
  }

  return (
    <main className="blog-index-shell">
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

      <div className="blog-index-main">
        <div className="blog-index-head">
          <p className="eyebrow">Nifty &amp; Sensex Today</p>
          <h1 className="blog-index-title">Daily Nifty and Sensex pre-market and post-market reads</h1>
          <p>Daily gap, PCR, Max Pain, and option-readiness reads for both Nifty and Sensex in one place — published before the open and after the close, straight from the MarketCue rules engine.</p>
          <p>Every read on this page comes from the same documented, rules-based scoring framework: Gap %, Open Interest structure, PCR, and Max Pain roll up into a Market Bias score, while India VIX, IV-vs-VIX, and days-to-expiry roll up into an Option Readiness score. Those two combine into a strategy recommendation — never a discretionary call. The full weighting and every band is public on the <Link href="/rules">rules page</Link>.</p>
          <p>Two reads publish each trading day: the <strong>pre-market call</strong>, generated around 8:55 AM IST from GIFT Nifty's gap and the prior session's option chain, before Nifty and Sensex open at 9:15 AM; and the <strong>post-market recap</strong>, generated after the close, covering how the session actually played out against that morning's call. In between, the dashboard also tracks mid-market checkpoints at 10:30, 11:30, 12:30, 1:30, and 2:30 IST for anyone following the live session rather than the two published reads.</p>
          <p>Each day's two reads are permanent, dated URLs — the archive below links every one of them, oldest to newest, so a specific day's call can always be checked against what actually happened rather than overwritten by the next session. For live, single-metric reads that update continuously rather than being tied to one calendar date, see <Link href="/india-vix-today">India VIX</Link>, <Link href="/gift-nifty-today">GIFT Nifty</Link>, <Link href="/nifty-pcr-today">Nifty PCR</Link>, <Link href="/nifty-max-pain-today">Nifty Max Pain</Link>, <Link href="/nifty-support-resistance-today">Nifty Support &amp; Resistance</Link>, <Link href="/sensex-option-chain">Sensex Option Chain</Link>, <Link href="/nse-option-chain-analysis">NSE Option Chain Analysis</Link>, and <Link href="/fii-dii-data-today">FII/DII Data</Link>.</p>
        </div>

        {error && <p className="history-empty">Unable to load posts right now.</p>}
        {!error && !data && <p className="history-empty">Loading...</p>}
        {data && dayGroups.length === 0 && <p className="history-empty">No posts published yet — check back before the next session.</p>}

        {todayGroup && (
          <div className="archive-hero">
            <div className="archive-hero-top">
              <span className="archive-hero-live-dot" aria-hidden="true" />
              <span className="archive-hero-date">Today · {formatDateLabel(todayGroup.tradeDate)}</span>
            </div>
            <div className="archive-hero-tiles">
              {todayGroup.pre ? (
                <Link href={`/nifty-sensex-today/${todayGroup.pre.slug}`} className="archive-hero-tile">
                  <span className="archive-hero-tag archive-hero-tag-pre">Pre-market</span>
                  <p>{todayGroup.pre.title}</p>
                  <span className="archive-hero-tile-link">Read the call <ArrowRight size={12} /></span>
                </Link>
              ) : (
                <div className="archive-hero-tile archive-hero-tile-empty">
                  <span className="archive-hero-tag archive-hero-tag-pre">Pre-market</span>
                  <p>Publishes daily at 9:00 AM IST</p>
                </div>
              )}
              {todayGroup.post ? (
                <Link href={`/nifty-sensex-today/${todayGroup.post.slug}`} className="archive-hero-tile">
                  <span className="archive-hero-tag archive-hero-tag-post">Post-market</span>
                  <p>{todayGroup.post.title}</p>
                  <span className="archive-hero-tile-link">Read the call <ArrowRight size={12} /></span>
                </Link>
              ) : (
                <div className="archive-hero-tile archive-hero-tile-empty">
                  <span className="archive-hero-tag archive-hero-tag-post">Post-market</span>
                  <p>Publishes daily at 8:00 PM IST</p>
                </div>
              )}
            </div>
          </div>
        )}

        {olderGroups.length > 0 && (
          <div className="archive-table-block">
            <h2 className="archive-table-eyebrow">Archive</h2>
            <div className="archive-table">
              <div className="archive-table-head">
                <span>Date</span><span>Nifty</span><span>Sensex</span><span>Bias</span><span>Read</span>
              </div>
              {olderGroups.map((g) => {
                const row = rowFor(g.tradeDate)
                const bias = biasFrom(row?.day_change_pct_nifty, row?.day_change_pct_sensex, row?.market_bias_nifty)
                return (
                  <div className="archive-table-row" key={g.tradeDate}>
                    <span className="archive-table-cell-date">{formatDateLabel(g.tradeDate)}</span>
                    <span className={`archive-table-cell-num ${tone(row?.day_change_pct_nifty)}`}>{fmtPct(row?.day_change_pct_nifty)}</span>
                    <span className={`archive-table-cell-num ${tone(row?.day_change_pct_sensex)}`}>{fmtPct(row?.day_change_pct_sensex)}</span>
                    <span className="archive-table-cell-bias">{bias}</span>
                    <span className="archive-table-links">
                      {g.pre && <Link href={`/nifty-sensex-today/${g.pre.slug}`}>Pre</Link>}
                      {g.pre && g.post && <em> · </em>}
                      {g.post && <Link href={`/nifty-sensex-today/${g.post.slug}`}>Post</Link>}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
        {faqSlot}
      </div>
    </main>
  )
}
