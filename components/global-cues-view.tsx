'use client'

import { useEffect, useMemo, useState } from 'react'
import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'
import { DeltaValue, Disclaimer, EmptyState, Label, Skeleton } from '@/components/ui/ds'

// GlobalCue/News: the Global View. Reads the newest global_context row (calculated by the
// deterministic engine in supabase/functions/global-context-sync/intelligence), the latest
// market_snapshots per asset, quantitative events, and the morning's headlines.
//
// Presentation only. Every band, driver, sentence and event on screen comes from the stored row;
// this file decides how to arrange it. Five tabs: Summary (verdicts in words), Global, India,
// Global → India, and Data & reference (every number, for anyone who wants to check the
// arithmetic).

type Tone = 'up' | 'neutral' | 'caution' | 'down'
type Driver = { key: string; label: string; score: number; weight: number; reading: string; tone: Tone }
type AssetStat = { asset: string; label: string; group: string; sessions: number; ret5: number | null; ret20: number | null; vol20: number | null; z: number | null }
type Measured = { correlation20: number | null; beta20: number | null; pairs: number; relPerf20: number | null; niftyRet20: number | null; spxRet20: number | null; label: string; reading: string }
type ContextRow = {
  id: number; calculated_at: string; data_as_of: string | null
  global_score: number; global_band: string; india_score: number; india_band: string
  transmission_label: string; transmission_tone: Tone; regime: string
  confidence: 'High' | 'Medium' | 'Low'; confidence_detail: { coverage?: number; oldestInputMin?: number | null; note?: string }
  global_drivers: Driver[]; india_drivers: Driver[]; channels: string[]; counterforces: string[]
  what_is_driving: string[]; explanation: string
  measured?: Measured | null; asset_stats?: AssetStat[]
  narrative?: { summary: string; global: string; india: string; link: string; written_at: string } | null
  inputs?: { postmarket_trade_date?: string | null }
}
type EventRow = { id: number; event_time: string; updated_at: string; category: string; title: string; summary: string; why_it_matters?: string; affected_assets: string[]; market_direction: string; global_relevance: number; india_relevance: number; confidence: number; india_impact: string; sources: { type: string; source: string; url?: string; detail?: string }[]; evidence: { z?: number; asset?: string; outlets?: number; official?: boolean }; region?: string; cluster_key?: string | null; linked_move?: string | null }
type SnapshotRow = { asset: string; label: string; cue_group: string; price: number; change_pct: number | null; source_ts: string; ingested_at: string }
type NewsRow = { url: string; source: string; region?: string; title: string; published_at: string | null; relevance?: number }

type Tab = 'summary' | 'global' | 'india' | 'link' | 'data'
const TABS: { id: Tab; label: string }[] = [
  { id: 'summary', label: 'Summary' }, { id: 'global', label: 'Global' }, { id: 'india', label: 'India' }, { id: 'link', label: 'Global → India' }, { id: 'data', label: 'Data & reference' },
]

const EXPECTED_REFRESH_MIN = 15
const QUIET = 0.12
const BAND_TONE: Record<string, Tone> = { 'Strongly Positive': 'up', Positive: 'up', Constructive: 'up', Neutral: 'neutral', Cautious: 'caution', Negative: 'down', 'Strongly Negative': 'down' }
const GROUPS: { key: string; label: string }[] = [
  { key: 'us_equity', label: 'US equities' }, { key: 'us_futures', label: 'US futures' }, { key: 'volatility', label: 'Volatility' },
  { key: 'rates', label: 'Rates' }, { key: 'dollar', label: 'Dollar' }, { key: 'crude', label: 'Crude' }, { key: 'metals', label: 'Metals' },
  { key: 'asia', label: 'Asia' }, { key: 'china', label: 'China' }, { key: 'europe', label: 'Europe' }, { key: 'india', label: 'India' },
]

// Word-only phrasing for each driver, by direction of its score. The numeric reading stays in
// the Data & reference tab; the verdict tabs speak in words.
const DRIVER_WORDS: Record<string, { up: string; down: string; flat: string }> = {
  us_equities: { up: 'US equities firm', down: 'US equities weak', flat: 'US equities flat' },
  us_futures: { up: 'US futures firmer overnight', down: 'US futures softer overnight', flat: 'US futures flat' },
  volatility: { up: 'Volatility subdued', down: 'Volatility elevated or rising', flat: 'Volatility mid-range' },
  rates: { up: 'US yields easing', down: 'US yields rising', flat: 'US yields steady' },
  dollar: { up: 'Dollar softer', down: 'Dollar firmer', flat: 'Dollar steady' },
  crude: { up: 'Crude easing', down: 'Crude rising', flat: 'Crude steady' },
  metals: { up: 'Copper leading gold, growth tone', down: 'Gold leading copper, defensive tone', flat: 'Metals quiet' },
  asia: { up: 'Asia mostly higher', down: 'Asia mostly lower', flat: 'Asia mixed' },
  china: { up: 'China higher', down: 'China lower', flat: 'China flat' },
  europe: { up: 'Europe higher', down: 'Europe lower', flat: 'Europe flat' },
  nifty: { up: 'Nifty higher', down: 'Nifty lower', flat: 'Nifty flat' },
  sensex: { up: 'Sensex higher', down: 'Sensex lower', flat: 'Sensex flat' },
  bank_nifty: { up: 'Banks outperforming', down: 'Banks under pressure', flat: 'Banks flat' },
  breadth: { up: 'Broad participation, more advances than declines', down: 'Narrow market, sellers dominate', flat: 'Breadth balanced' },
  india_vix: { up: 'India VIX contained', down: 'India VIX elevated or rising', flat: 'India VIX steady' },
  fii: { up: 'Foreign investors net buyers', down: 'Foreign investors net sellers', flat: 'Foreign flows balanced' },
  dii: { up: 'Domestic funds net buyers', down: 'Domestic funds net sellers', flat: 'Domestic flows balanced' },
  inr: { up: 'Rupee firmer', down: 'Rupee weaker', flat: 'Rupee steady' },
  gift: { up: 'GIFT Nifty pointed to a firm open', down: 'GIFT Nifty pointed to a soft open', flat: 'GIFT Nifty pointed to a flat open' },
  options: { up: 'Put-heavy positioning, some cushion', down: 'Call-heavy positioning, upside capped', flat: 'Options positioning balanced' },
  news: { up: 'News flow leaning supportive', down: 'News flow leaning risk-off', flat: 'News flow balanced' },
}
const words = (d: Driver) => { const w = DRIVER_WORDS[d.key]; if (!w) return d.reading; return d.score >= QUIET ? w.up : d.score <= -QUIET ? w.down : w.flat }
const forRisk = (ds: Driver[]) => ds.filter((d) => d.score >= QUIET)
const againstRisk = (ds: Driver[]) => ds.filter((d) => d.score <= -QUIET)
const quiet = (ds: Driver[]) => ds.filter((d) => Math.abs(d.score) < QUIET)
const stripPct = (title: string) => title.replace(/\s[+-]?\d+(\.\d+)?%$/, '')
// Lowercase only the leading letter, so "US 10Y yield slides" keeps its acronyms.
const lcFirst = (t: string) => t.charAt(0).toLowerCase() + t.slice(1)

function todayIST() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}
const IST_CLOCK = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false })
const IST_DAY = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
const IST_HM = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false })

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
const timesUsual = (z?: number) => z == null ? '' : `about ${Math.abs(z).toFixed(1)} times its usual daily move`
const level = (v: number) => v >= 0.7 ? 'high' : v >= 0.4 ? 'medium' : 'low'

// Hero headline: a few words from the bands, the way the pre-market thesis hero reads.
function headline(ctx: ContextRow): string {
  const gt = BAND_TONE[ctx.global_band], it = BAND_TONE[ctx.india_band]
  const g = gt === 'up' ? 'Supportive world' : gt === 'down' ? 'Pressured world' : gt === 'caution' ? 'Cautious world' : 'Quiet world'
  const i = it === 'up' ? 'resilient India' : it === 'down' ? 'soft India' : it === 'caution' ? 'hesitant India' : 'undecided India'
  return `${g}, ${i}`
}

// One sentence for the day, from the three bands. Templates, hedged, no numbers.
function oneLine(ctx: ContextRow): string {
  const g = ctx.global_band.toLowerCase(), i = ctx.india_band.toLowerCase()
  const gt = BAND_TONE[ctx.global_band], it = BAND_TONE[ctx.india_band]
  const world = gt === 'up' ? 'The world is supportive' : gt === 'down' ? 'The world is under pressure' : gt === 'caution' ? 'The world is cautious' : 'The world is quiet'
  const india = it === 'up' ? 'India is holding up' : it === 'down' ? 'India is soft' : it === 'caution' ? 'India is hesitant' : 'India is undecided'
  switch (ctx.transmission_label) {
    case 'Strong global influence': return `${world} (${g}), and India is following it closely (${i}).`
    case 'Moderate global influence': return `${world} (${g}), and some of that is reaching India (${i}).`
    case 'India diverging from global markets': return `${world} (${g}), but ${india} on its own (${i}), moving against the global tone.`
    case 'India moving in line with global markets': return `${world} and ${india} together (${g} and ${i}).`
    default: return `${world} (${g}), ${india} (${i}), and little of the global picture is reaching us right now.`
  }
}

// "Watch next": the inputs still to come today, derived from what is missing or pending.
function watchNext(ctx: ContextRow, events: EventRow[], now: number, newsEventsForWatch: EventRow[] = []): string[] {
  const out: string[] = []
  const hm = IST_HM.format(new Date(now))
  const missing = ctx.confidence_detail?.note ?? ''
  if (hm < '09:15') out.push('The Indian open against what GIFT Nifty implied.')
  if (missing.includes('breadth')) out.push('Market breadth once the first intraday sync lands.')
  if (ctx.inputs?.postmarket_trade_date && ctx.inputs.postmarket_trade_date !== todayIST()) out.push('Today’s FII and DII print after the close.')
  if (hm < '19:00') out.push('US futures into the US open this evening.')
  else out.push('Tonight’s US session, which sets tomorrow’s pre-market tone.')
  for (const e of events.slice(0, 1)) out.push(`Whether ${lcFirst(stripPct(e.title))} extends.`)
  for (const e of newsEventsForWatch.slice(0, 1)) out.push(`Follow-through on: ${e.title}.`)
  return out.slice(0, 4)
}

function Verdict({ label, band, tone, sub, badge }: { label: string; band: string; tone: Tone; sub: string; badge?: { text: string; tone: Tone } }) {
  return <div className="field-card gv-verdict">
    <span>{label}{badge && <em className={`ds-badge ds-badge--${badge.tone} gv-label-badge`}>{badge.text}</em>}</span>
    <strong className={`gv-band gv-band--${tone}`}>{band}</strong>
    <small>{sub}</small>
  </div>
}
function WordList({ label, items, empty }: { label: string; items: string[]; empty: string }) {
  return <div className="field-card gv-list">
    <span>{label}</span>
    {items.length ? <ul>{items.map((t) => <li key={t}>{t}</li>)}</ul> : <small className="field-empty-reason">{empty}</small>}
  </div>
}
const CATEGORY_LABEL: Record<string, string> = { macro: 'Macro', rates: 'Rates', currency: 'Currency', commodities: 'Commodities', geopolitics: 'Geopolitics', equities: 'Equities', policy_india: 'India policy', flows: 'Flows', earnings: 'Earnings', sector: 'Sector', other: 'Event' }

function NewsEventCard({ e, now }: { e: EventRow; now: number }) {
  const tone: Tone = e.market_direction === 'risk_off' ? 'down' : e.market_direction === 'risk_on' ? 'up' : 'neutral'
  const outlets = (e.sources ?? []).filter((s) => s.url)
  return <article className="ds-card gv-event">
    <span className="gv-event-kicker">{CATEGORY_LABEL[e.category] ?? 'Event'} · {e.region === 'india' ? 'India' : 'Global'} · {ago(e.event_time, now)} <em className={`ds-badge ds-badge--${tone}`}>{e.market_direction === 'risk_off' ? 'Risk-off' : e.market_direction === 'risk_on' ? 'Risk-on' : 'Neutral'}</em></span>
    <strong className="gv-event-title">{e.title}</strong>
    <small className="gv-event-what">{e.summary}</small>
    {e.why_it_matters && <small className="gv-event-why">{e.why_it_matters}</small>}
    <small className="gv-event-why"><b>India.</b> {e.india_impact || 'No clear route into Indian markets from this event.'}</small>
    {e.linked_move && <small className="gv-event-why"><b>Confirmed by the tape.</b> A significant move in a linked instrument was detected in the same window.</small>}
    <small className="gv-event-meta">India relevance {level(Number(e.india_relevance))} · confidence {level(Number(e.confidence))}{e.evidence?.official ? ' · official source' : ''}{outlets.length ? <> · {outlets.slice(0, 4).map((s, i) => <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer">{i ? ', ' : ''}{s.source}</a>)}</> : null}</small>
  </article>
}

function EventCard({ e, now }: { e: EventRow; now: number }) {
  const scale = timesUsual(e.evidence?.z)
  const tone: Tone = e.market_direction === 'risk_off' ? 'down' : e.market_direction === 'risk_on' ? 'up' : 'neutral'
  return <article className="ds-card gv-event">
    <span className="gv-event-kicker">{e.market_direction === 'risk_off' ? 'Risk-off move' : e.market_direction === 'risk_on' ? 'Risk-on move' : 'Move'} · {ago(e.updated_at, now)} <em className={`ds-badge ds-badge--${tone}`}>{scale ? `${Math.abs(Number(e.evidence?.z)).toFixed(1)}× usual` : 'notable'}</em></span>
    <strong className="gv-event-title">{stripPct(e.title)}</strong>
    <small className="gv-event-why">{e.india_impact || 'Driver unclear.'}</small>
    <small className="gv-event-meta">India relevance {level(Number(e.india_relevance))} · confidence {level(Number(e.confidence))}</small>
  </article>
}

export function GlobalCuesView() {
  const supabase = useMemo(() => createClient(), [])
  const now = useNow()
  const today = todayIST()
  const [tab, setTab] = useState<Tab>('summary')

  const { data, error, isLoading } = useSWR(['global-context', today], async () => {
    const [ctx, snaps, news, events] = await Promise.all([
      supabase.from('global_context').select('*').order('calculated_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('market_snapshots').select('asset, label, cue_group, price, change_pct, source_ts, ingested_at').order('source_ts', { ascending: false }).limit(200),
      supabase.from('news_articles').select('url, source, region, title, published_at, relevance').gte('fetched_at', new Date(Date.now() - 24 * 3600_000).toISOString()).gt('relevance', 0).order('published_at', { ascending: false, nullsFirst: false }).limit(20),
      supabase.from('market_events').select('*').eq('status', 'active').gte('event_time', new Date(Date.now() - 36 * 3600_000).toISOString()).order('india_relevance', { ascending: false }).order('event_time', { ascending: false }).limit(14),
    ])
    if (ctx.error) throw ctx.error
    const seen = new Set<string>()
    const latest: SnapshotRow[] = []
    for (const r of (snaps.data ?? []) as SnapshotRow[]) { if (!seen.has(r.asset)) { seen.add(r.asset); latest.push(r) } }
    return { ctx: (ctx.data as ContextRow | null) ?? null, snaps: latest, news: (news.data ?? []) as NewsRow[], events: (events.data ?? []) as EventRow[] }
  }, { revalidateOnFocus: true, refreshInterval: 60_000 })

  const ctx = data?.ctx ?? null
  const allEvents = data?.events ?? []
  const newsEvents = allEvents.filter((e) => e.category !== 'price_move')
  const events = allEvents.filter((e) => e.category === 'price_move')
  const calcAgeMin = ctx ? (now - Date.parse(ctx.calculated_at)) / 60000 : null
  const stale = calcAgeMin != null && calcAgeMin > EXPECTED_REFRESH_MIN * 2
  const gTone = ctx ? BAND_TONE[ctx.global_band] ?? 'neutral' : 'neutral'
  const iTone = ctx ? BAND_TONE[ctx.india_band] ?? 'neutral' : 'neutral'
  const gd = ctx?.global_drivers ?? [], id = ctx?.india_drivers ?? []
  const joinWords = (parts: string[], fallback: string) => parts.length ? `${parts.join('. ')}.` : fallback
  const gSub = joinWords([...againstRisk(gd).slice(0, 2).map(words), ...forRisk(gd).slice(0, 1).map(words)], 'No single global factor stands out.')
  const iSub = joinWords([...forRisk(id).slice(0, 2).map(words), ...againstRisk(id).slice(0, 1).map(words)], 'No single domestic factor stands out.')
  const corr = ctx?.measured?.correlation20 ?? null

  const head = <div className="review-section-head">
    <div>
      <p className="eyebrow">Global → India · {ctx ? `UPDATED ${ago(ctx.calculated_at, now).toUpperCase()}` : 'NO CALCULATION YET'}</p>
      <h2>Global view</h2>
    </div>
    {ctx && <div className="phase-head-aside">
      {stale && <span className="ds-badge ds-badge--caution">Stale · last run {ago(ctx.calculated_at, now)}</span>}
      <span className={`ds-badge ${ctx.confidence === 'High' ? 'ds-badge--up' : ctx.confidence === 'Medium' ? 'ds-badge--info' : 'ds-badge--caution'}`} title={ctx.confidence_detail?.note ?? ''}>Confidence {ctx.confidence.toLowerCase()}</span>
    </div>}
  </div>

  const tabs = <div className="chart-switch gv-tabs" role="tablist" aria-label="Global view sections">
    {TABS.map((t) => <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'is-active' : ''} onClick={() => setTab(t.id)}>{t.label}</button>)}
  </div>

  if (isLoading) return <section className="phase-view cues-view">{head}{tabs}<div className="field-grid"><Skeleton height={110} /><Skeleton height={110} /><Skeleton height={110} /></div></section>
  if (error) return <section className="phase-view cues-view">{head}<EmptyState label="Global view" headline="Context could not be loaded" reason="The request to Supabase failed. Reopening this screen retries." /></section>
  if (!ctx) return <section className="phase-view cues-view">{head}<EmptyState label="Global view" headline="No calculation on record" reason="The global-context-sync function has not written a row yet. The first run populates this screen." /></section>

  return <section className="phase-view cues-view">
    {head}
    {tabs}

    {tab === 'summary' && <>
      <div className="thesis-hero">
        <div className="thesis-hero-main">
          <Label tone="info">The read right now</Label>
          <strong className="thesis-hero-value">{headline(ctx)}</strong>
          <p className="thesis-hero-note">{ctx.narrative?.summary ?? oneLine(ctx)}</p>
          {(newsEvents.length > 0 || events.length > 0) && <div className="agent-badges">{[...newsEvents.slice(0, 2), ...events.slice(0, 2)].map((e) => <button type="button" key={e.id} className={`ds-badge ${e.market_direction === 'risk_off' ? 'ds-badge--down' : e.market_direction === 'risk_on' ? 'ds-badge--up' : 'ds-badge--neutral'} gv-chip`} onClick={() => setTab('link')}>{stripPct(e.title)}</button>)}</div>}
        </div>
      </div>
      <section className="metric-group">
        <div className="group-heading"><h3>Verdicts</h3></div>
        <div className="field-grid">
          <Verdict label="Global" band={ctx.global_band} tone={gTone} sub={gSub} />
          <Verdict label="India" band={ctx.india_band} tone={iTone} sub={iSub} />
          <Verdict label="Global → India" band={ctx.transmission_label.replace(' global influence', '').replace('India ', '')} tone={ctx.transmission_tone}
            badge={ctx.measured?.correlation20 != null ? { text: `${ctx.measured.label.toLowerCase()} tracking, 20 days`, tone: ctx.measured.label === 'Strong' ? 'down' : ctx.measured.label === 'Moderate' ? 'caution' : 'neutral' } : undefined}
            sub={ctx.counterforces.length ? `Domestic factors appear to be offsetting: ${ctx.counterforces.slice(0, 2).map(lcFirst).join(' and ')}.` : ctx.channels.length ? `Evidence of transmission: ${lcFirst(ctx.channels[0])}.` : 'No single transmission channel stands out today.'} />
        </div>
      </section>
      <section className="metric-group">
        <div className="group-heading"><h3>Why, and what comes next</h3></div>
        <div className="field-grid gv-grid2">
          <WordList label="Why" items={ctx.what_is_driving.slice(0, 4)} empty="Driver unclear. No input moved enough to stand out." />
          <WordList label="Watch next" items={watchNext(ctx, events, now, newsEvents)} empty="Nothing pending." />
        </div>
      </section>
    </>}

    {tab === 'global' && <>
      <div className="thesis-hero"><div className="thesis-hero-main"><Label tone="info">Global verdict</Label><strong className="thesis-hero-value">{ctx.global_band}</strong><p className="thesis-hero-note">{ctx.narrative?.global ?? `Regime: ${ctx.regime.toLowerCase()}. ${gSub}`}</p></div></div>
      <section className="metric-group">
        <div className="group-heading"><h3>What is pulling the verdict</h3></div>
        <div className="field-grid gv-grid2">
          <WordList label="Working against risk" items={againstRisk(gd).map(words)} empty="Nothing is pushing against risk appetite right now." />
          <WordList label="Working for risk" items={forRisk(gd).map(words)} empty="Nothing is supporting risk appetite right now." />
        </div>
      </section>
      {quiet(gd).length > 0 && <p className="chart-note">Quiet today: {quiet(gd).map((d) => d.label.toLowerCase()).join(', ')}.</p>}
      <p className="chart-note">Verdict from {gd.length} global components across 21 instruments. Every number sits under Data &amp; reference.</p>
    </>}

    {tab === 'india' && <>
      <div className="thesis-hero"><div className="thesis-hero-main"><Label tone="info">India verdict</Label><strong className="thesis-hero-value">{ctx.india_band}</strong><p className="thesis-hero-note">{ctx.narrative?.india ?? iSub}</p></div></div>
      <section className="metric-group">
        <div className="group-heading"><h3>What is pulling the verdict</h3></div>
        <div className="field-grid gv-grid2">
          <WordList label="Supporting" items={forRisk(id).map(words)} empty="No domestic input is supportive right now." />
          <WordList label="Dragging" items={againstRisk(id).map(words)} empty="No domestic input is dragging right now." />
        </div>
      </section>
      {quiet(id).length > 0 && <p className="chart-note">Quiet today: {quiet(id).map((d) => d.label.toLowerCase()).join(', ')}.</p>}
      {ctx.confidence_detail?.note?.startsWith('Missing') && <p className="chart-note">{ctx.confidence_detail.note.replace('Missing: ', 'Not yet available today: ').replace(/_/g, ' ')}.</p>}
    </>}

    {tab === 'link' && <>
      <div className="thesis-hero"><div className="thesis-hero-main"><Label tone="info">Global → India</Label><strong className="thesis-hero-value">{ctx.transmission_label}</strong><p className="thesis-hero-note">{ctx.narrative?.link ?? ctx.explanation}</p></div></div>
      <section className="metric-group">
        <div className="group-heading"><h3>How it is transmitting</h3></div>
        <div className="field-grid">
          <div className="field-card gv-list">
            <span>How closely India has tracked the US lately</span>
            {corr != null ? <>
              <strong>{ctx.measured?.label} <em className={`ds-badge ds-badge--${ctx.measured?.label === 'Strong' ? 'down' : ctx.measured?.label === 'Moderate' ? 'caution' : 'neutral'}`}>20 sessions</em></strong>
              <span className="gv-meter" aria-hidden="true"><i style={{ width: `${Math.min(100, Math.abs(corr) * 100)}%` }} /></span>
              <small className="gv-meter-scale"><span>Weak</span><span>Moderate</span><span>Strong</span></small>
            </> : <small className="field-empty-reason">{ctx.measured?.reading ?? 'History is still being collected.'}</small>}
          </div>
          <WordList label="Channels active" items={ctx.channels} empty="No transmission channel is active today." />
          <WordList label="Domestic counterforces" items={ctx.counterforces} empty="No domestic factor is leaning against the global tone." />
        </div>
      </section>
      <section className="metric-group">
        <div className="group-heading"><h3>Key events</h3></div>
        {newsEvents.length ? <div className="field-grid gv-grid2">{newsEvents.map((e) => <NewsEventCard e={e} key={e.id} now={now} />)}</div>
          : <p className="chart-note">No analysed news event in the last 36 hours. Headlines are clustered every five minutes and analysed when several outlets or an official source carry the same story.</p>}
      </section>
      <section className="metric-group">
        <div className="group-heading"><h3>Significant moves</h3></div>
        {events.length ? <div className="field-grid gv-grid2">{events.map((e) => <EventCard e={e} key={e.id} now={now} />)}</div>
          : <p className="chart-note">No instrument has moved beyond its usual daily range in the last 36 hours.</p>}
      </section>
    </>}

    {tab === 'data' && <>
      <p className="chart-note">Every input behind the verdicts, with its own freshness. Scores run from −1 to +1; a positive score supports risk appetite.</p>
      <section className="metric-group">
        <div className="group-heading"><h3>Global components</h3></div>
        <div className="field-grid drivers-grid">{gd.map((d) => <div className="field-card" key={d.key}><span>{d.label}</span><strong><em className={`ds-badge ds-badge--${d.tone}`}>{d.score > 0 ? '+' : ''}{d.score.toFixed(2)}</em></strong><small>{d.reading}</small></div>)}</div>
      </section>
      <section className="metric-group">
        <div className="group-heading"><h3>India components</h3></div>
        <div className="field-grid drivers-grid">{id.map((d) => <div className="field-card" key={d.key}><span>{d.label}</span><strong><em className={`ds-badge ds-badge--${d.tone}`}>{d.score > 0 ? '+' : ''}{d.score.toFixed(2)}</em></strong><small>{d.reading}</small></div>)}</div>
      </section>
      {ctx.measured && ctx.measured.correlation20 != null && <section className="metric-group">
        <div className="group-heading"><h3>Measured relationship</h3></div>
        <div className="field-grid measured-grid">
          <div className="field-card"><span>20-day correlation with prior US session</span><strong>{ctx.measured.correlation20.toFixed(2)} <em className={`ds-badge ds-badge--${ctx.measured.label === 'Strong' ? 'down' : ctx.measured.label === 'Moderate' ? 'caution' : 'neutral'}`}>{ctx.measured.label}</em></strong><small>beta {ctx.measured.beta20?.toFixed(2) ?? 'n/a'} over {ctx.measured.pairs} sessions</small></div>
          <div className="field-card"><span>Nifty vs S&amp;P 500, 20 days</span><strong>{ctx.measured.relPerf20 != null ? <DeltaValue value={ctx.measured.relPerf20} showArrow /> : 'n/a'}</strong><small>Nifty {fmtPct(ctx.measured.niftyRet20)} · S&amp;P {fmtPct(ctx.measured.spxRet20)}</small></div>
          <div className="field-card"><span>Scores</span><strong>Global {Number(ctx.global_score) > 0 ? '+' : ''}{Number(ctx.global_score).toFixed(2)} · India {Number(ctx.india_score) > 0 ? '+' : ''}{Number(ctx.india_score).toFixed(2)}</strong><small>Coverage {Math.round((ctx.confidence_detail?.coverage ?? 0) * 100)}% · {ctx.confidence_detail?.note ?? ''}</small></div>
        </div>
      </section>}
      {data && data.snaps.length > 0 && <section className="metric-group">
        <div className="group-heading"><h3>Market basket</h3></div>
        <div className="basket">
          {GROUPS.map((g) => {
            const rows = data.snaps.filter((s) => s.cue_group === g.key)
            if (!rows.length) return null
            return <div className="basket-group" key={g.key}>
              <span className="history-beat-label">{g.label}</span>
              {rows.map((s) => { const st = ctx.asset_stats?.find((a) => a.asset === s.asset); return <div className="basket-row" key={s.asset}>
                <span className="basket-label">{s.label}</span>
                <b className="ds-num">{fmtPrice(s.asset, Number(s.price))}</b>
                <em className={`ds-badge ds-badge--${pctTone(s.change_pct == null ? null : Number(s.change_pct))}`}>{fmtPct(s.change_pct == null ? null : Number(s.change_pct))}</em>
                <small title={`Quote time ${IST_DAY.format(new Date(s.source_ts))} IST · fetched ${ago(s.ingested_at, now)}`}>{ago(s.source_ts, now)}{st?.ret20 != null ? ` · 20d ${fmtPct(st.ret20)}` : ''}{st?.z != null && Math.abs(st.z) >= 1.5 ? ` · ${Math.abs(st.z).toFixed(1)}σ` : ''}</small>
              </div> })}
            </div>
          })}
        </div>
      </section>}
      <section className="metric-group">
        <div className="group-heading"><h3>Headlines</h3></div>
        {!data?.news.length
          ? <p className="chart-note">No market-relevant headlines in the last 24 hours. Feeds are polled every five minutes.</p>
          : <ul className="news-list">{data.news.map((n) => <li key={n.url}><a href={n.url} target="_blank" rel="noopener noreferrer">{n.title}</a><small>{n.source}{n.region ? ` · ${n.region === 'india' ? 'India' : n.region === 'official' ? 'Official' : 'Global'}` : ''}{n.published_at ? ` · ${IST_CLOCK.format(new Date(n.published_at))} IST` : ''}</small></li>)}</ul>}
      </section>
      <p className="chart-note">Quotes from Yahoo Finance; India flows, breadth and options from the pre-market and post-market pipeline. Weights, scales and thresholds live in one config file.</p>
    </>}

    <div className="gv-foot">
      <span>Data as of {ago(ctx.data_as_of, now)} · calculated {ago(ctx.calculated_at, now)}</span>
      <span>{ctx.narrative ? 'Verdicts are computed from the inputs; the prose explains them and cites only those figures' : 'Verdicts are computed from the inputs, not written by a language model'}</span>
    </div>
    <Disclaimer source="Yahoo Finance and the MarketCue pipeline" capturedAt={IST_DAY.format(new Date(ctx.calculated_at)) + ' IST'} />
  </section>
}
