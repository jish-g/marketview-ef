import type { Metadata } from 'next'
import { createClient } from '@supabase/supabase-js'
import HomeClient from './home-client'

export const revalidate = 60

const SITE_URL = 'https://marketcue.in'

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_PREMARKET_SUPABASE_URL || 'https://vkcklvoizfpbnjdgaxai.supabase.co'
const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_PREMARKET_SUPABASE_KEY || 'sb_publishable_-am88LW21cvkYYA_H9vqWA_K42a7bXG'

export const metadata: Metadata = {
  title: 'MarketCue — Nifty & Sensex market reads, built on rules you can audit',
  description:
    'A daily Nifty and Sensex read from a documented, rules-based scoring framework — pre-market call before the open, post-market recap after the close.',
  alternates: { canonical: `${SITE_URL}/` },
  openGraph: {
    title: 'MarketCue — Nifty & Sensex market reads, built on rules you can audit',
    description:
      'A daily read on Nifty and Sensex from a documented, rules-based scoring framework — pre-market call before the open, post-market recap after the close.',
    url: `${SITE_URL}/`,
    siteName: 'MarketCue',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'MarketCue — Nifty & Sensex market reads, built on rules you can audit',
    description:
      'A daily read on Nifty and Sensex from a documented, rules-based scoring framework — pre-market call before the open, post-market recap after the close.',
  },
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'MarketCue',
  url: `${SITE_URL}/`,
  description: 'A daily read on Nifty and Sensex, built from a rules engine you can audit.',
  publisher: { '@type': 'Organization', name: 'MarketCue', url: `${SITE_URL}/` },
}

// Same IST-date helper used client-side, duplicated here (rather than shared)
// since this runs at request/revalidation time on the server, not per-render
// in the browser -- the trade date must be computed fresh at fetch time either way.
function todayIST() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

async function getSnapshotData() {
  const tradeDate = todayIST()
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

  const [preRes, postRes] = await Promise.all([
    supabase
      .from('premarket_dashboard')
      .select('prev_day_change_pct_nifty, prev_day_change_pct_sensex, prev_day_change_pts_nifty, prev_day_change_pts_sensex, india_vix, days_to_expiry_nifty, days_to_expiry_sensex, market_bias_nifty, market_bias_sensex')
      .eq('trade_date', tradeDate)
      .maybeSingle(),
    supabase
      .from('postmarket_summary')
      .select('day_change_pct_nifty, day_change_pct_sensex, day_high_nifty, day_low_nifty, day_high_sensex, day_low_sensex, recap_story_nifty, recap_story_sensex')
      .eq('trade_date', tradeDate)
      .maybeSingle(),
  ])

  return {
    tradeDate,
    initialPre: preRes.data ?? null,
    initialPost: postRes.data ?? null,
  }
}

export default async function Page() {
  const { tradeDate, initialPre, initialPost } = await getSnapshotData()

  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <HomeClient tradeDate={tradeDate} initialPre={initialPre} initialPost={initialPost} />
    </>
  )
}
