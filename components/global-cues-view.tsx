'use client'

import { useEffect, useMemo, useState } from 'react'
import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'
import { Disclaimer, EmptyState, Skeleton } from '@/components/ui/ds'

// GlobalCue/News: the Global View. Reads the newest global_context row (calculated by the
// deterministic engine in supabase/functions/global-context-sync/intelligence), the latest market_snapshots
// per asset, and the morning's headlines. Nothing is computed here: every band, driver and
// sentence on screen comes from the stored row so it is traceable to that run's inputs.

type Tone = 'up' | 'neutral' | 'caution' | 'down'
type Driver = { key: string; label: string; score: number; weight: number; reading: string; tone: Tone }
type ContextRow = {
  id: number; calculated_at: string; data_as_of: string | null
  global_score: number; global_band: string; india_score: number; india_band: string
  transmission_label: string; transmission_tone: Tone; regime: string
  confidence: 'High' | 'Medium' | 'Low'; confidence_detail: { coverage?: number; oldestInputMin?: number | null; note?: string }
  global_drivers: Driver[]; india_drivers: Driver[]; channels: string[]; counterforces: string[]
  what_is_driving: string[]; explanation: string
}
type SnapshotRow = { asset: string; label: string; cue_group: string; price: number; change_pct: number | null; source_ts: string; ingested_at: string }
type NewsRow = { url: string; source: string; title: string; published_at: string | null }

const EXPECTED_REFRESH_MIN = 15
const BAND_TONE: Record<string, Tone> = { 'Strongly Positive': 'up', Positive: 'up', Constructive: 'up', Neutral: 'neutral', Cautious: 'caution', Negative: 'down', 'Strongly Negative': 'down' }
const TONE_DOT: Record<Tone, string> = { up: '🟢', neutral: '⚪', caution: '🟡', down: '🔴' }
const GROUPS: { key: string; label: string }[] = [
  { key: 'us_equity', label: 'US equities' }, { key: 'us_futures', label: 'US futures' }, { key: 'volatility', label: 'Volatility' },
  { key: 'rates', label: 'Rates' }, { key: 'dollar', label: 'Dollar' }, { key: 'crude', label: 'Crude' }, { key: 'metals', label: 'Metals' },
  { key: 'asia', label: 'Asia' }, { key: 'china', label: 'China' }, { key: 'europe', label: 'Europe' }, { key: 'india', label: 'India' },
]

function todayIST() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}
const IST_CLOCK = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false })
const IST_DAY = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })

// "Updated 2 min ago" -- re-rendered every 30 s so a fixed page never looks fresher than it is.
function useNow() {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t) }, [])
  return now
}
function ago(iso: string | null | undefined, now: number): string {
  if (!iso) return 'no timestamp'
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000))
  if (s < 60) return `${s} s ago`
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} h ${m % 60} min ago`
  return IST_DAY.format(new Date(iso)) + ' IST'
}

const fmtPrice = (asset: string, v: number) => (asset === '^TNX' || asset === '2YY=F') ? `${v.toFixed(2)}%` : v >= 1000 ? v.toLocaleString('en-IN', { maximumFractionDigits: 0 }) : v.toFixed(2)
const fmtPct = (v: number | null) => v == null ? 'n/a' : `${v > 0 ? '+' : ''}${v.toFixed(2)}%`
const pctTone = (v: number | null): Tone => v == null ? 'neutral' : v > 0.05 ? 'up' : v < -0.05 ? 'down' : 'neutral'

function ScoreBar({ score, tone }: { score: number; tone: Tone }) {
  const w = Math.min(100, Math.abs(score) * 100)
  return <span className={`score-bar score-bar--${tone}`} aria-hidden="true"><i style={{ width: `${w}%`, [score < 0 ? 'right' : 'left']: '50%' } as React.CSSProperties} /></span>
}

function DriverGrid({ drivers }: { drivers: Driver[] }) {
  return <div className="field-grid drivers-grid">
    {drivers.map((d) => <div className={`field-card driver-card driver-card--${d.tone}`} key={d.key}>
      <span>{d.label}</span>
      <strong><em className={`ds-badge ds-badge--${d.tone}`}>{d.score > 0 ? '+' : ''}{d.score.toFixed(2)}</em><ScoreBar score={d.score} tone={d.tone} /></strong>
      <small>{d.reading || 'No reading'}</small>
    </div>)}
  </div>
}

export function GlobalCuesView() {
  const supabase = useMemo(() => createClient(), [])
  const now = useNow()
  const today = todayIST()

  const { data, error, isLoading } = useSWR(['global-context', today], async () => {
    const [ctx, snaps, news] = await Promise.all([
      supabase.from('global_context').select('*').order('calculated_at', { ascending: false }).limit(1).maybeSingle(),
      // Latest row per asset: pull the newest 200 and de-duplicate client-side, which keeps this a
      // single indexed query instead of a DISTINCT ON the anon role cannot run through PostgREST.
      supabase.from('market_snapshots').select('asset, label, cue_group, price, change_pct, source_ts, ingested_at').order('source_ts', { ascending: false }).limit(200),
      supabase.from('market_news').select('url, source, title, published_at').eq('trade_date', today).order('published_at', { ascending: false, nullsFirst: false }).limit(12),
    ])
    if (ctx.error) throw ctx.error
    const seen = new Set<string>()
    const latest: SnapshotRow[] = []
    for (const r of (snaps.data ?? []) as SnapshotRow[]) { if (!seen.has(r.asset)) { seen.add(r.asset); latest.push(r) } }
    return { ctx: (ctx.data as ContextRow | null) ?? null, snaps: latest, news: (news.data ?? []) as NewsRow[] }
  }, { revalidateOnFocus: true, refreshInterval: 60_000 })

  const ctx = data?.ctx ?? null
  const calcAgeMin = ctx ? (now - Date.parse(ctx.calculated_at)) / 60000 : null
  const stale = calcAgeMin != null && calcAgeMin > EXPECTED_REFRESH_MIN * 2
  const gTone = ctx ? BAND_TONE[ctx.global_band] ?? 'neutral' : 'neutral'
  const iTone = ctx ? BAND_TONE[ctx.india_band] ?? 'neutral' : 'neutral'

  return <section className="phase-view cues-view">
    <div className="review-section-head">
      <div>
        <p className="eyebrow">Global → India · {ctx ? `CALCULATED ${ago(ctx.calculated_at, now).toUpperCase()}` : 'NO CALCULATION YET'}</p>
        <h2>Global view</h2>
      </div>
      {ctx && <div className="phase-head-aside">
        <span className={`ds-badge ${stale ? 'ds-badge--caution' : 'ds-badge--outline'}`}>{stale ? `Stale · last run ${ago(ctx.calculated_at, now)}` : `Data as of ${ago(ctx.data_as_of, now)}`}</span>
        <span className={`ds-badge ${ctx.confidence === 'High' ? 'ds-badge--up' : ctx.confidence === 'Medium' ? 'ds-badge--info' : 'ds-badge--caution'}`} title={ctx.confidence_detail?.note ?? ''}>Confidence {ctx.confidence}</span>
      </div>}
    </div>

    {isLoading ? <div className="cues-hero"><Skeleton height={96} /><Skeleton height={96} /><Skeleton height={96} /></div>
      : error ? <EmptyState label="Global view" headline="Context could not be loaded" reason="The request to Supabase failed. Reopening this screen retries." />
      : !ctx ? <EmptyState label="Global view" headline="No calculation on record" reason="The global-context-sync function has not written a row yet. The first run populates this screen." />
      : <>
        <div className="cues-hero">
          <div className={`cues-hero-card cues-hero-card--${gTone}`}><span>Global sentiment</span><strong>{TONE_DOT[gTone]} {ctx.global_band}</strong><small>score {ctx.global_score > 0 ? '+' : ''}{Number(ctx.global_score).toFixed(2)}</small></div>
          <div className={`cues-hero-card cues-hero-card--${iTone}`}><span>India sentiment</span><strong>{TONE_DOT[iTone]} {ctx.india_band}</strong><small>score {ctx.india_score > 0 ? '+' : ''}{Number(ctx.india_score).toFixed(2)}</small></div>
          <div className={`cues-hero-card cues-hero-card--${ctx.transmission_tone}`}><span>Global → India</span><strong>{TONE_DOT[ctx.transmission_tone]} {ctx.transmission_label}</strong><small>regime: {ctx.regime}</small></div>
        </div>

        <div className="verdict-banner prior-sessions-banner cues-explanation">
          <p className="eyebrow">Global → India transmission</p>
          <p className="prior-session-line prior-session-story">{ctx.explanation}</p>
          {(ctx.channels.length > 0 || ctx.counterforces.length > 0) && <div className="cues-evidence">
            {ctx.channels.length > 0 && <div><span className="history-beat-label">Transmission channels</span><ul>{ctx.channels.map((c) => <li key={c}>{c}</li>)}</ul></div>}
            {ctx.counterforces.length > 0 && <div><span className="history-beat-label">Domestic counterforces</span><ul>{ctx.counterforces.map((c) => <li key={c}>{c}</li>)}</ul></div>}
          </div>}
        </div>

        <section className="metric-group">
          <div className="group-heading"><h3>What is driving markets?</h3></div>
          {ctx.what_is_driving.length ? <ol className="driving-list">{ctx.what_is_driving.map((l, i) => <li key={i}>{l}</li>)}</ol> : <p className="chart-note">Driver unclear. No input moved enough to stand out.</p>}
        </section>

        <section className="metric-group">
          <div className="group-heading"><h3>Global drivers</h3></div>
          <DriverGrid drivers={ctx.global_drivers} />
        </section>

        <section className="metric-group">
          <div className="group-heading"><h3>India drivers</h3></div>
          {ctx.india_drivers.length ? <DriverGrid drivers={ctx.india_drivers} /> : <p className="chart-note">No India-side inputs were available for this run.</p>}
        </section>
      </>}

    {data && data.snaps.length > 0 && <section className="metric-group">
      <div className="group-heading"><h3>Market basket</h3></div>
      <div className="basket">
        {GROUPS.map((g) => {
          const rows = data.snaps.filter((s) => s.cue_group === g.key)
          if (!rows.length) return null
          return <div className="basket-group" key={g.key}>
            <span className="history-beat-label">{g.label}</span>
            {rows.map((s) => <div className="basket-row" key={s.asset}>
              <span className="basket-label">{s.label}</span>
              <b className="ds-num">{fmtPrice(s.asset, Number(s.price))}</b>
              <em className={`ds-badge ds-badge--${pctTone(s.change_pct == null ? null : Number(s.change_pct))}`}>{fmtPct(s.change_pct == null ? null : Number(s.change_pct))}</em>
              <small title={`Quote time ${IST_DAY.format(new Date(s.source_ts))} IST · fetched ${ago(s.ingested_at, now)}`}>{ago(s.source_ts, now)}</small>
            </div>)}
          </div>
        })}
      </div>
    </section>}

    <section className="metric-group">
      <div className="group-heading"><h3>Headlines</h3></div>
      {isLoading ? <Skeleton height={100} />
        : !data?.news.length
          ? <p className="chart-note">No headlines on record for today. Pulled from Economic Times, Livemint and NDTV Profit at 08:30 and 09:05 IST.</p>
          : <ul className="news-list">{data.news.map((n) => <li key={n.url}><a href={n.url} target="_blank" rel="noopener noreferrer">{n.title}</a><small>{n.source}{n.published_at ? ` · ${IST_CLOCK.format(new Date(n.published_at))} IST` : ''}</small></li>)}</ul>}
      <p className="chart-note">Raw feed for now. Event clustering and the explanation of which headlines map to which move arrive in the next phase.</p>
    </section>

    <p className="chart-note">
      Sentiment, transmission and regime are computed by MarketCue&apos;s own engine from the inputs above with configurable
      weights and thresholds; no third-party sentiment score and no language model is involved in the numbers. Quotes from Yahoo Finance;
      India flows and breadth from the pre-market and post-market pipeline.
    </p>
    <Disclaimer source="Yahoo Finance and the MarketCue pipeline" capturedAt={ctx ? IST_DAY.format(new Date(ctx.calculated_at)) + ' IST' : null} />
  </section>
}
