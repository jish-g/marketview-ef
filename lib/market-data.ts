import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_PREMARKET_SUPABASE_URL || 'https://vkcklvoizfpbnjdgaxai.supabase.co'
const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_PREMARKET_SUPABASE_KEY || 'sb_publishable_-am88LW21cvkYYA_H9vqWA_K42a7bXG'

export function getSupabase() {
  return createClient(SUPABASE_URL, SUPABASE_KEY)
}

export function todayIST() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

export type Row = Record<string, any>

// Evergreen pages always need to show a live number, but premarket_dashboard
// for today doesn't exist until ~8:55 AM IST and postmarket_summary doesn't
// exist until the evening -- rather than showing nothing outside those
// windows, this falls back to the most recent available row so the page
// always has a real number, and the caller can label it with the row's own
// trade_date instead of assuming "today".
//
// updated_at is always appended to the requested columns (rather than left
// to each caller to remember) since every evergreen page needs it for its
// visible "Updated ..." <time> line and Dataset.dateModified -- using the
// row's own last-write timestamp rather than the page's render time, so the
// freshness claim reflects when the underlying data actually changed, not
// just when this particular request happened to run.
export async function getLatestRow(table: 'premarket_dashboard' | 'postmarket_summary', columns: string): Promise<Row | null> {
  const supabase = getSupabase()
  const fullColumns = columns.includes('updated_at') ? columns : `${columns}, updated_at`
  const today = todayIST()
  const { data: todayRow } = await supabase.from(table).select(fullColumns).eq('trade_date', today).maybeSingle()
  if (todayRow) return todayRow as Row
  const { data: latest } = await supabase.from(table).select(fullColumns).order('trade_date', { ascending: false }).limit(1).maybeSingle()
  return (latest as Row | null) ?? null
}

// Mirrors the same UTC -> fixed +05:30 reformat used for post pages (see
// toISTISOString in app/nifty-sensex-today/[slug]/page.tsx) -- duplicated
// here rather than imported since that one lives in a route file, not a
// shared module; kept identical so both produce the same offset format.
export function toISTISOString(isoUtc: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(new Date(isoUtc))
  const get = (type: string) => parts.find((p) => p.type === type)?.value
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}+05:30`
}

// Visible "Updated 2:30 PM IST · 4 September 2026" label for the evergreen
// pages, from the same raw UTC updated_at value used for the ISO datetime.
export function updatedLabel(isoUtc: string): string {
  const time = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(isoUtc)).replace(/am|pm/i, (m) => m.toUpperCase())
  const date = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(isoUtc))
  return `Updated ${time} IST · ${date}`
}

// Single source of truth for an evergreen page's freshness signal: the
// row's own updated_at when available, falling back to render time only in
// the (untested-in-practice) case a table has no rows at all yet -- a
// missing timestamp would otherwise mean an invalid <time datetime>.
export function getUpdatedMeta(row: Row | null): { iso: string; label: string; tradeDate: string | null } {
  const raw = row?.updated_at ?? new Date().toISOString()
  return { iso: toISTISOString(raw), label: updatedLabel(raw), tradeDate: row?.trade_date ?? null }
}

export type RecentPost = { slug: string; title: string; phase: 'premarket' | 'postmarket'; trade_date: string }

export async function getRecentPosts(limit = 5): Promise<RecentPost[]> {
  const supabase = getSupabase()
  const { data } = await supabase
    .from('blog_posts')
    .select('slug, title, phase, trade_date')
    .order('published_at', { ascending: false })
    .limit(limit)
  return (data as RecentPost[] | null) ?? []
}

export function bareHeadline(title: string): string {
  return title.replace(/\s*\|\s*MarketCue\s*$/i, '').trim()
}

export function fmtPct(v: any): string {
  if (v === null || v === undefined || v === '') return '—'
  const n = Number(v)
  return `${n > 0 ? '+' : ''}${v}%`
}

export function fmtNum(v: any, suffix = ''): string {
  if (v === null || v === undefined || v === '') return '—'
  return `${v}${suffix}`
}

export function formatDateLabel(dateStr: string) {
  return new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(`${dateStr}T00:00:00`))
}

// "Read" helpers for the evergreen pages -- mirror the exact band definitions
// published on /rules so every page's interpretation of a raw number stays
// consistent with the one documented, auditable methodology.
export function pcrRead(v: any): string {
  if (v == null || v === '') return '—'
  const n = Number(v)
  if (n > 1.3) return 'Oversold / Bullish bias'
  if (n >= 0.8) return 'Neutral'
  return 'Overbought / Bearish bias'
}
export function maxPainRead(spot: any, maxPain: any): string {
  if (spot == null || maxPain == null) return '—'
  const diffPct = ((Number(spot) - Number(maxPain)) / Number(maxPain)) * 100
  if (diffPct > 0.3) return 'Downward pull likely toward expiry'
  if (diffPct < -0.3) return 'Upward pull likely toward expiry'
  return 'Pinning likely'
}
export function vixRead(v: any): string {
  if (v == null || v === '') return '—'
  const n = Number(v)
  if (n < 11) return 'Thin, theta-heavy premium'
  if (n <= 14) return 'Ideal, low-risk premium'
  if (n <= 18) return 'Elevated premium'
  if (n <= 22) return 'High — IV crush risk'
  return 'Blocks fresh option buying'
}
export function gapRead(pct: any): string {
  if (pct == null || pct === '') return '—'
  const n = Number(pct)
  if (n > 0.75) return 'Strong Gap Up'
  if (n >= 0.25) return 'Normal Gap Up'
  if (n >= -0.25) return 'Flat'
  if (n >= -0.75) return 'Normal Gap Down'
  return 'Strong Gap Down'
}
export function dteRead(d: any): string {
  if (d == null || d === '') return '—'
  const n = Number(d)
  if (n <= 1) return 'High gamma risk'
  if (n <= 4) return 'Ideal window'
  return 'Lower gamma risk'
}
export function oiRead(change: any, isSupport: boolean): string {
  if (change == null || change === '') return '—'
  const addition = String(change).toLowerCase() === 'addition'
  if (isSupport) return addition ? 'Support strengthening' : 'Support weakening — breakdown risk'
  return addition ? 'Resistance strengthening' : 'Resistance weakening — breakout risk'
}
