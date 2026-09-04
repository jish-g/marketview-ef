import type { Metadata } from 'next'
import { createClient } from '@supabase/supabase-js'
import NiftySensexTodayIndexClient from './index-client'

export const revalidate = 60

const SITE_URL = 'https://marketcue.in'

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_PREMARKET_SUPABASE_URL || 'https://vkcklvoizfpbnjdgaxai.supabase.co'
const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_PREMARKET_SUPABASE_KEY || 'sb_publishable_-am88LW21cvkYYA_H9vqWA_K42a7bXG'

export const metadata: Metadata = {
  title: 'Nifty & Sensex Today — Daily pre-market and post-market reads | MarketCue',
  description:
    'Daily gap, PCR, Max Pain, and option-readiness reads for Nifty and Sensex — published before the open and after the close, from the MarketCue rules engine.',
  alternates: { canonical: `${SITE_URL}/nifty-sensex-today` },
  openGraph: {
    title: 'Nifty & Sensex Today — Daily pre-market and post-market reads',
    description:
      'Daily gap, PCR, Max Pain, and option-readiness reads for Nifty and Sensex — published before the open and after the close.',
    url: `${SITE_URL}/nifty-sensex-today`,
    siteName: 'MarketCue',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Nifty & Sensex Today — Daily pre-market and post-market reads',
    description:
      'Daily gap, PCR, Max Pain, and option-readiness reads for Nifty and Sensex — published before the open and after the close.',
  },
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'CollectionPage',
  name: 'Nifty & Sensex Today',
  url: `${SITE_URL}/nifty-sensex-today`,
  description:
    'Daily gap, PCR, Max Pain, and option-readiness reads for Nifty and Sensex — published before the open and after the close.',
  isPartOf: { '@type': 'WebSite', name: 'MarketCue', url: `${SITE_URL}/` },
}

type Post = { id: string; trade_date: string; instrument: 'NIFTY' | 'SENSEX' | 'BOTH'; phase: 'premarket' | 'postmarket'; slug: string; title: string; badges: string[]; published_at: string }
type Row = Record<string, any>

<<<<<<< HEAD
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
=======
async function getIndexData() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
>>>>>>> d893f9624417694d09bfcf97c34959944376ae00

  const { data: posts } = await supabase
    .from('blog_posts')
    .select('*')
    .order('published_at', { ascending: false })
    .limit(60)

  const initialPosts = (posts ?? []) as Post[]
  const dates = Array.from(new Set(initialPosts.map((p) => p.trade_date)))

<<<<<<< HEAD
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

  const { data: marketRows } = useSWR(dates.length ? ['blog-index-market', dates.join(',')] : null, async () => {
=======
  let initialMarketRows: Record<string, Row> = {}
  if (dates.length > 0) {
>>>>>>> d893f9624417694d09bfcf97c34959944376ae00
    const [pre, post] = await Promise.all([
      supabase.from('premarket_dashboard').select('trade_date, gap_points_nifty, gap_points_sensex, prev_close_nifty, prev_close_sensex, market_bias_nifty, market_bias_sensex').in('trade_date', dates),
      supabase.from('postmarket_summary').select('trade_date, day_change_pct_nifty, day_change_pct_sensex').in('trade_date', dates),
    ])
    for (const r of pre.data ?? []) initialMarketRows[r.trade_date] = { ...initialMarketRows[r.trade_date], ...r }
    for (const r of post.data ?? []) initialMarketRows[r.trade_date] = { ...initialMarketRows[r.trade_date], ...r }
  }

  return { initialPosts, initialMarketRows }
}

export default async function Page() {
  const { initialPosts, initialMarketRows } = await getIndexData()

  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <NiftySensexTodayIndexClient initialPosts={initialPosts} initialMarketRows={initialMarketRows} />
    </>
  )
}
