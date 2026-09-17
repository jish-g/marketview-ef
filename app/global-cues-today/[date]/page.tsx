import type { Metadata } from 'next'
import { cache } from 'react'
import { createClient } from '@supabase/supabase-js'
import { GlobalCuesPublicPage, type GlobalCuesNarrative } from '@/components/global-cues-public'

export const revalidate = 3600

const SUPABASE_URL = process.env.NEXT_PUBLIC_PREMARKET_SUPABASE_URL || 'https://vkcklvoizfpbnjdgaxai.supabase.co'
const SUPABASE_KEY = process.env.NEXT_PUBLIC_PREMARKET_SUPABASE_KEY || 'sb_publishable_-am88LW21cvkYYA_H9vqWA_K42a7bXG'
const SITE_URL = 'https://marketcue.in'

type DailyRow = {
  trade_date: string
  slug: string
  narrative: GlobalCuesNarrative
  global_band: string
  india_band: string
  transmission_label: string
  calculated_at: string
}

const getDay = cache(async (slug: string): Promise<DailyRow | null> => {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
    const { data } = await supabase.from('global_cues_daily').select('*').eq('slug', slug).maybeSingle()
    return (data as DailyRow | null) ?? null
  } catch {
    return null
  }
})

const getPreviousDay = cache(async (day: DailyRow): Promise<DailyRow | null> => {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
    const { data } = await supabase
      .from('global_cues_daily')
      .select('trade_date, slug')
      .lt('trade_date', day.trade_date)
      .order('trade_date', { ascending: false })
      .limit(1)
      .maybeSingle()
    return (data as DailyRow | null) ?? null
  } catch {
    return null
  }
})

function dateLabel(tradeDate: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${tradeDate}T00:00:00`))
}

export async function generateMetadata({ params }: { params: Promise<{ date: string }> }): Promise<Metadata> {
  const { date } = await params
  const day = await getDay(date)
  if (!day) {
    return { title: 'Global cues archive not found | MarketCue', description: 'This day’s global cues read may not have been archived.' }
  }
  const label = dateLabel(day.trade_date)
  const description = `How global markets shaped India on ${label}: ${day.global_band.toLowerCase()} globally, ${day.india_band.toLowerCase()} in India, ${day.transmission_label.toLowerCase()}.`
  return {
    title: `Global cues on ${label} | MarketCue`,
    description,
    alternates: { canonical: `${SITE_URL}/global-cues-today/${day.slug}` },
    openGraph: { title: `Global cues on ${label}`, description, url: `${SITE_URL}/global-cues-today/${day.slug}`, siteName: 'MarketCue', type: 'article' },
  }
}

export default async function Page({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params
  const day = await getDay(date)

  if (!day) {
    return (
      <GlobalCuesPublicPage
        eyebrow="Global cues archive"
        h1="This day isn’t archived"
        asOfLabel=""
        isLive={false}
        globalBand="—"
        indiaBand="—"
        transmissionLabel="—"
        narrative={{ summary: 'This day’s read wasn’t archived, or the link is out of date.', global: '', india: '', link: '' }}
        path={`/global-cues-today/${date}`}
      />
    )
  }

  const prev = await getPreviousDay(day)
  const label = dateLabel(day.trade_date)

  return (
    <GlobalCuesPublicPage
      eyebrow="Global cues archive"
      h1={`Global cues on ${label}`}
      asOfLabel={`Closing read, ${label}`}
      isLive={false}
      globalBand={day.global_band}
      indiaBand={day.india_band}
      transmissionLabel={day.transmission_label}
      narrative={day.narrative}
      archiveNav={{ prevHref: prev ? `/global-cues-today/${prev.slug}` : null, prevLabel: prev ? dateLabel(prev.trade_date) : null }}
      dateMeta={{ isoDate: day.trade_date, dateLabel: label }}
      path={`/global-cues-today/${day.slug}`}
    />
  )
}
