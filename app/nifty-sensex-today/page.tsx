import type { Metadata } from 'next'
import { createClient } from '@supabase/supabase-js'
import NiftySensexTodayIndexClient from './index-client'
import { FaqBlock } from '@/components/faq-block'
import { SEED_FAQ, faqJsonLd } from '@/lib/faq'

export const revalidate = 60

const SITE_URL = 'https://marketcue.in'

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_PREMARKET_SUPABASE_URL || 'https://vkcklvoizfpbnjdgaxai.supabase.co'
const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_PREMARKET_SUPABASE_KEY || 'sb_publishable_-am88LW21cvkYYA_H9vqWA_K42a7bXG'

export const metadata: Metadata = {
  title: 'Nifty & Sensex Today — Pre/post-market reads | MarketCue',
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

async function getIndexData() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

  const { data: posts } = await supabase
    .from('blog_posts')
    .select('*')
    .order('published_at', { ascending: false })
    .limit(60)

  const initialPosts = (posts ?? []) as Post[]
  const dates = Array.from(new Set(initialPosts.map((p) => p.trade_date)))

  let initialMarketRows: Record<string, Row> = {}
  if (dates.length > 0) {
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
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd(SEED_FAQ)) }}
      />
      <NiftySensexTodayIndexClient
        initialPosts={initialPosts}
        initialMarketRows={initialMarketRows}
        faqSlot={<FaqBlock items={SEED_FAQ} />}
      />
    </>
  )
}
