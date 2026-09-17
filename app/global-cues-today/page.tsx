import type { Metadata } from 'next'
import { createClient } from '@supabase/supabase-js'
import { GlobalCuesPublicPage, type GlobalCuesNarrative } from '@/components/global-cues-public'

export const revalidate = 300

const SUPABASE_URL = process.env.NEXT_PUBLIC_PREMARKET_SUPABASE_URL || 'https://vkcklvoizfpbnjdgaxai.supabase.co'
const SUPABASE_KEY = process.env.NEXT_PUBLIC_PREMARKET_SUPABASE_KEY || 'sb_publishable_-am88LW21cvkYYA_H9vqWA_K42a7bXG'
const SITE_URL = 'https://marketcue.in'

type ContextRow = {
  calculated_at: string
  global_band: string
  india_band: string
  transmission_label: string
  narrative: (GlobalCuesNarrative & { written_at?: string }) | null
}

async function getLatestContext(): Promise<ContextRow | null> {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
    const { data } = await supabase
      .from('global_context')
      .select('calculated_at, global_band, india_band, transmission_label, narrative')
      .order('calculated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    return (data as ContextRow | null) ?? null
  } catch {
    return null
  }
}

function asOfLabel(calculatedAt: string): string {
  const d = new Date(calculatedAt)
  const date = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'long', year: 'numeric' }).format(d)
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }).format(d)
  return `As of ${time} IST, ${date}`
}

const FALLBACK_NARRATIVE: GlobalCuesNarrative = {
  summary: 'The global read is refreshing. Check back in a few minutes for the latest view of how world markets are shaping India today.',
  global: 'Global market data is being recalculated.',
  india: 'India market data is being recalculated.',
  link: 'The Global to India transmission read is being recalculated.',
}

export const metadata: Metadata = {
  title: 'Global cues today: how world markets are shaping India | MarketCue',
  description: 'A live, plain-English read of how US, Asian and European markets are moving Indian equities today — updated roughly every 15 minutes, fact-checked before publishing.',
  alternates: { canonical: `${SITE_URL}/global-cues-today` },
  openGraph: {
    title: 'Global cues today: how world markets are shaping India',
    description: 'A live read of how global markets are moving Nifty and Sensex today, with the methodology behind every line.',
    url: `${SITE_URL}/global-cues-today`,
    siteName: 'MarketCue',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Global cues today: how world markets are shaping India',
    description: 'A live read of how global markets are moving Nifty and Sensex today.',
  },
}

export default async function Page() {
  const row = await getLatestContext()
  const narrative: GlobalCuesNarrative = row?.narrative
    ? { summary: row.narrative.summary, global: row.narrative.global, india: row.narrative.india, link: row.narrative.link }
    : FALLBACK_NARRATIVE

  return (
    <GlobalCuesPublicPage
      eyebrow="Global cues, updated live"
      h1="How global markets are shaping India today"
      asOfLabel={row ? asOfLabel(row.calculated_at) : 'Refreshing…'}
      isLive
      globalBand={row?.global_band ?? 'Neutral'}
      indiaBand={row?.india_band ?? 'Neutral'}
      transmissionLabel={row?.transmission_label ?? 'Limited global influence'}
      narrative={narrative}
      archiveNav={{ prevHref: null, prevLabel: null }}
      path="/global-cues-today"
    />
  )
}
