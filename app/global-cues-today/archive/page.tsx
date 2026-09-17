import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft, Send } from 'lucide-react'
import { createClient } from '@supabase/supabase-js'
import { BrandSymbol } from '@/components/brand-mark'

export const revalidate = 3600

const SUPABASE_URL = process.env.NEXT_PUBLIC_PREMARKET_SUPABASE_URL || 'https://vkcklvoizfpbnjdgaxai.supabase.co'
const SUPABASE_KEY = process.env.NEXT_PUBLIC_PREMARKET_SUPABASE_KEY || 'sb_publishable_-am88LW21cvkYYA_H9vqWA_K42a7bXG'
const SITE_URL = 'https://marketcue.in'

export const metadata: Metadata = {
  title: 'Global cues archive | MarketCue',
  description: 'Every past day’s read of how global markets shaped Indian equities, archived and searchable.',
  alternates: { canonical: `${SITE_URL}/global-cues-today/archive` },
}

type Row = { trade_date: string; slug: string; global_band: string; india_band: string; transmission_label: string }

async function getDays(): Promise<Row[]> {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
    const { data } = await supabase
      .from('global_cues_daily')
      .select('trade_date, slug, global_band, india_band, transmission_label')
      .order('trade_date', { ascending: false })
      .limit(365)
    return (data as Row[] | null) ?? []
  } catch {
    return []
  }
}

function label(tradeDate: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${tradeDate}T00:00:00`))
}

export default async function Page() {
  const days = await getDays()
  return (
    <main className="rules-doc-shell">
      <header className="rules-doc-topbar">
        <Link href="/global-cues-today" className="back-link"><ArrowLeft size={16} /> Back to today’s read</Link>
        <div className="topbar-meta">
          <a href="https://t.me/marketcue_in" target="_blank" rel="noopener noreferrer" className="sign-in-link"><Send size={13} /> Join Telegram</a>
          <div className="brand-mark"><BrandSymbol size={32} /><div><strong>MarketCue</strong></div></div>
        </div>
      </header>
      <div className="rules-doc-layout rules-doc-layout--single">
        <article className="rules-doc-content">
          <div className="doc-hero">
            <p className="eyebrow">Global cues archive</p>
            <h1>Past days</h1>
            <p>Every archived day’s read of how global markets shaped Indian equities.</p>
          </div>
          <section className="doc-section">
            <ul>
              {days.map((d) => (
                <li key={d.slug}>
                  <Link href={`/global-cues-today/${d.slug}`}>{label(d.trade_date)}</Link>
                  {' — '}Global {d.global_band}, India {d.india_band}, {d.transmission_label.toLowerCase()}
                </li>
              ))}
              {days.length === 0 && <li>No archived days yet.</li>}
            </ul>
          </section>
        </article>
      </div>
    </main>
  )
}
