'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import useSWR from 'swr'
import { BarChart3, Moon, Sun, ArrowLeft, ArrowRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

type Post = { id: string; trade_date: string; instrument: 'NIFTY' | 'SENSEX' | 'BOTH'; phase: 'premarket' | 'postmarket'; slug: string; title: string; body: string; badges: string[]; published_at: string }
type Row = Record<string, any>

function formatDateLabel(dateStr: string) {
  return new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(`${dateStr}T00:00:00`))
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

export default function NiftySensexTodayPostPage() {
  const params = useParams<{ slug: string }>()
  const [dark, setDark] = useState(false)
  useEffect(() => { document.documentElement.classList.toggle('dark', dark) }, [dark])
  const supabase = createClient()

  const { data, error } = useSWR(['blog-post', params.slug], async () => {
    const { data, error } = await supabase.from('blog_posts').select('*').eq('slug', params.slug).maybeSingle()
    if (error) throw error
    return data as Post | null
  })

  const { data: marketRow } = useSWR(data ? ['blog-post-market', data.trade_date, data.phase] : null, async () => {
    const table = data!.phase === 'premarket' ? 'premarket_dashboard' : 'postmarket_summary'
    const { data: row, error } = await supabase.from(table).select('*').eq('trade_date', data!.trade_date).maybeSingle()
    if (error) throw error
    return row as Row | null
  })

  const isPre = data?.phase === 'premarket'

  return (
    <main className="blog-post-shell">
      <header className="blog-index-topbar">
        <Link href="/" className="brand-mark" style={{ textDecoration: 'none' }}>
          <div className="brand-symbol"><BarChart3 size={16} /></div>
          <div><strong>MarketCue</strong><span>TRADE ANALYSIS PLATFORM</span></div>
        </Link>
        <button className="icon-button" onClick={() => setDark(!dark)} aria-label="Toggle theme">
          {dark ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </header>

      <div className="blog-post-main">
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
              <h1 className="blog-post-title">{data.title}</h1>
              <time>{formatDateLabel(data.trade_date)}</time>
            </div>

            {marketRow && (
              <section className="scorecard-section">
                <div className="field-grid scorecard-tiles">
                  {isPre ? (
                    <>
                      <div className="field-card">
                        <span>India VIX</span>
                        <strong>{fmtNum(marketRow.india_vix)}</strong>
                      </div>
                      <div className="field-card">
                        <span>GIFT Nifty Gap</span>
                        <strong className={tone(marketRow.gift_nifty_gap_pct)}>
                          {fmtPct(marketRow.gift_nifty_gap_pct)}
                          {ptsSuffix(marketRow.gift_nifty_gap_pts) && <em className="prior-day-pts"> ({ptsSuffix(marketRow.gift_nifty_gap_pts)})</em>}
                        </strong>
                      </div>
                      <div className="field-card">
                        <span>Nifty Expiry</span>
                        <strong>{fmtNum(marketRow.days_to_expiry_nifty, marketRow.days_to_expiry_nifty === 1 ? ' day' : ' days')}</strong>
                      </div>
                      <div className="field-card">
                        <span>Sensex Expiry</span>
                        <strong>{fmtNum(marketRow.days_to_expiry_sensex, marketRow.days_to_expiry_sensex === 1 ? ' day' : ' days')}</strong>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="field-card">
                        <span>Nifty Closed</span>
                        <strong className={tone(marketRow.day_change_pct_nifty)}>{fmtPct(marketRow.day_change_pct_nifty)}</strong>
                      </div>
                      <div className="field-card">
                        <span>Sensex Closed</span>
                        <strong className={tone(marketRow.day_change_pct_sensex)}>{fmtPct(marketRow.day_change_pct_sensex)}</strong>
                      </div>
                      <div className="field-card">
                        <span>Nifty Range</span>
                        <strong>{fmtNum(marketRow.day_low_nifty)} – {fmtNum(marketRow.day_high_nifty)}</strong>
                      </div>
                      <div className="field-card">
                        <span>Sensex Range</span>
                        <strong>{fmtNum(marketRow.day_low_sensex)} – {fmtNum(marketRow.day_high_sensex)}</strong>
                      </div>
                    </>
                  )}
                </div>

                <div className="comparison-grid scorecard-comparison">
                  <div className="comparison-card">
                    <span>NIFTY</span>
                    {isPre ? (
                      <>
                        <strong>{fmtNum(marketRow.avg_move_5d_nifty)} pts <em>5D avg move</em></strong>
                        <small>Support {fmtNum(marketRow.oi_support_nifty)} · Resistance {fmtNum(marketRow.oi_resistance_nifty)}</small>
                      </>
                    ) : (
                      <>
                        <strong className={tone(marketRow.day_change_pct_nifty)}>{fmtNum(marketRow.close_nifty)}</strong>
                        <small>{marketRow.target_hit_nifty ? 'Target hit' : marketRow.sl_hit_nifty ? 'Stop hit' : 'Neither target nor stop hit'}</small>
                      </>
                    )}
                  </div>
                  <div className="comparison-card">
                    <span>SENSEX</span>
                    {isPre ? (
                      <>
                        <strong>{fmtNum(marketRow.avg_move_5d_sensex)} pts <em>5D avg move</em></strong>
                        <small>Support {fmtNum(marketRow.oi_support_sensex)} · Resistance {fmtNum(marketRow.oi_resistance_sensex)}</small>
                      </>
                    ) : (
                      <>
                        <strong className={tone(marketRow.day_change_pct_sensex)}>{fmtNum(marketRow.close_sensex)}</strong>
                        <small>{marketRow.target_hit_sensex ? 'Target hit' : marketRow.sl_hit_sensex ? 'Stop hit' : 'Neither target nor stop hit'}</small>
                      </>
                    )}
                  </div>
                </div>
              </section>
            )}

            <div className="blog-post-body">{data.body.split(/\n\s*\n/).map((para, i) => <p key={i}>{para.trim()}</p>)}</div>
            <div className="blog-post-cta">
              <Link href="/dashboard" className="detailed-read-link">Open live Verdict on the dashboard <ArrowRight size={15} /></Link>
            </div>
          </>
        )}
      </div>
    </main>
  )
}
