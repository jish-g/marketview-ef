'use client'

import { useMemo } from 'react'
import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'
import { PhaseAside, Disclaimer, DeltaValue, EmptyState, Skeleton } from '@/components/ui/ds'
import { fmt } from '@/lib/format'

// GlobalCue/News: the overnight basket and the morning headlines, read from the two tables the
// global-cues-fetch Edge Function writes. Display-only -- nothing here feeds the verdict.

type CueRow = { symbol: string; label: string; cue_group: string; sort_order: number; last: number | null; change_pct: number | null; quote_time: string | null; fetched_at: string; trade_date: string }
type NewsRow = { url: string; source: string; title: string; published_at: string | null; trade_date: string }

const GROUPS: { key: string; label: string }[] = [
  { key: 'us', label: 'United States' },
  { key: 'asia', label: 'Asia' },
  { key: 'commodity', label: 'Commodities' },
  { key: 'fx', label: 'Currency' },
  { key: 'rates', label: 'Rates' },
]

function todayIST() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

const IST_CLOCK = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false })

function level(symbol: string, v: number) {
  if (symbol === '^TNX') return `${v.toFixed(2)}%`
  if (symbol === 'USDINR=X' || symbol === 'DX-Y.NYB' || symbol === 'BZ=F') return v.toFixed(2)
  return fmt.level(v)
}

// One-line read of the basket so the number grid has a sentence above it. Counts risk assets
// only (US, Asia); crude, dollar and yields are context, not direction.
function basketRead(rows: CueRow[]): string | null {
  const risk = rows.filter((r) => (r.cue_group === 'us' || r.cue_group === 'asia') && r.change_pct != null)
  if (risk.length === 0) return null
  const up = risk.filter((r) => r.change_pct! > 0.1).length
  const down = risk.filter((r) => r.change_pct! < -0.1).length
  const strongest = risk.slice().sort((a, b) => Math.abs(b.change_pct!) - Math.abs(a.change_pct!))[0]
  const tone = up === risk.length ? 'Global cues are supportive' : down === risk.length ? 'Global cues are weak' : up > down ? 'Global cues lean positive' : down > up ? 'Global cues lean negative' : 'Global cues are mixed'
  const sign = strongest.change_pct! > 0 ? '+' : ''
  return `${tone}. ${strongest.label} is the largest mover at ${sign}${strongest.change_pct!.toFixed(2)}%.`
}

export function GlobalCuesView() {
  const supabase = useMemo(() => createClient(), [])
  const today = todayIST()

  // Today's rows when present, else the most recent morning on record so the screen is never
  // blank before 08:30 -- the eyebrow names the date it is actually showing.
  const { data, error, isLoading } = useSWR(['global-cues', today], async () => {
    const { data: todayCues, error: e1 } = await supabase.from('global_cues').select('*').eq('trade_date', today).order('sort_order')
    if (e1) throw e1
    let cues = (todayCues ?? []) as CueRow[]
    if (cues.length === 0) {
      const { data: latest } = await supabase.from('global_cues').select('trade_date').order('trade_date', { ascending: false }).limit(1).maybeSingle()
      if (latest?.trade_date) {
        const { data: prior } = await supabase.from('global_cues').select('*').eq('trade_date', latest.trade_date).order('sort_order')
        cues = (prior ?? []) as CueRow[]
      }
    }
    const shownDate = cues[0]?.trade_date ?? today
    const { data: news, error: e2 } = await supabase.from('market_news').select('url, source, title, published_at, trade_date').eq('trade_date', shownDate).order('published_at', { ascending: false, nullsFirst: false }).limit(18)
    if (e2) throw e2
    return { cues, news: (news ?? []) as NewsRow[], shownDate }
  }, { revalidateOnFocus: false })

  const cues = data?.cues ?? []
  const news = data?.news ?? []
  const shownDate = data?.shownDate ?? today
  const isToday = shownDate === today
  const capturedAt = cues[0]?.fetched_at ?? null
  const read = useMemo(() => basketRead(cues), [cues])

  return <section className="phase-view cues-view">
    <div className="review-section-head">
      <div>
        <p className="eyebrow">Overnight setup · {isToday ? 'THIS MORNING' : `LAST FETCHED ${shownDate}`}</p>
        <h2>Global cues &amp; news</h2>
      </div>
      <PhaseAside capturedAt={capturedAt} />
    </div>

    {isLoading ? <div className="cues-grid">{Array.from({ length: 9 }).map((_, i) => <Skeleton key={i} height={78} />)}</div>
      : error ? <EmptyState label="Global cues" headline="Cues could not be loaded" reason="The request to Supabase failed. Reopening this screen retries." />
      : cues.length === 0 ? <EmptyState label="Global cues" headline="No overnight basket on record" reason="The 08:30 IST fetch has not written a row yet. The basket appears once it runs." />
      : <>
        {read && <div className="verdict-banner prior-sessions-banner"><p className="eyebrow">Overnight read</p><p className="prior-session-line">{read}</p></div>}
        {GROUPS.map((g) => {
          const rows = cues.filter((c) => c.cue_group === g.key)
          if (rows.length === 0) return null
          return <section className="metric-group" key={g.key}>
            <div className="group-heading"><h3>{g.label}</h3></div>
            <div className="field-grid cues-grid">
              {rows.map((c) => c.last == null
                ? <div className="field-card is-empty" key={c.symbol}><span>{c.label}</span><strong className="field-empty-headline">Not available</strong><small className="field-empty-reason">The quote source returned nothing for this instrument.</small></div>
                : <div className="field-card" key={c.symbol}>
                  <span>{c.label}</span>
                  <strong>{level(c.symbol, c.last)} <em className="cue-delta"><DeltaValue value={c.change_pct} showArrow /></em></strong>
                  {c.quote_time && <small className="cue-time">as of {IST_CLOCK.format(new Date(c.quote_time))} IST</small>}
                </div>)}
            </div>
          </section>
        })}
      </>}

    <section className="metric-group">
      <div className="group-heading"><h3>Headlines</h3></div>
      {isLoading ? <Skeleton height={120} />
        : news.length === 0
          ? <EmptyState label="News" headline="No headlines on record" reason="Headlines are pulled from Economic Times, Livemint and NDTV Profit at 08:30 IST." />
          : <ul className="news-list">
            {news.map((n) => <li key={n.url}>
              <a href={n.url} target="_blank" rel="noopener noreferrer">{n.title}</a>
              <small>{n.source}{n.published_at ? ` · ${IST_CLOCK.format(new Date(n.published_at))} IST` : ''}</small>
            </li>)}
          </ul>}
    </section>

    <p className="chart-note">
      Quotes from Yahoo Finance, change versus each instrument&apos;s prior close. Headlines from the public
      feeds of Economic Times, Livemint and NDTV Profit, refreshed at 08:30 and 09:05 IST. Display only; nothing here enters the verdict.
    </p>

    <Disclaimer source="Yahoo Finance and public RSS" capturedAt={fmt.timeIST(capturedAt)} />
  </section>
}
