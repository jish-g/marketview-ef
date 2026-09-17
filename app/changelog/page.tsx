import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { createClient } from '@supabase/supabase-js'
import { BrandSymbol } from '@/components/brand-mark'

export const revalidate = 3600

const SUPABASE_URL = process.env.NEXT_PUBLIC_PREMARKET_SUPABASE_URL || 'https://vkcklvoizfpbnjdgaxai.supabase.co'
const SUPABASE_KEY = process.env.NEXT_PUBLIC_PREMARKET_SUPABASE_KEY || 'sb_publishable_-am88LW21cvkYYA_H9vqWA_K42a7bXG'
const SITE_URL = 'https://marketcue.in'

export const metadata: Metadata = {
  title: 'Changelog | MarketCue',
  description: 'What changed on MarketCue, including a daily record that the site and its data are current.',
  alternates: { canonical: `${SITE_URL}/changelog` },
}

type Entry = { id: number; entry_date: string; kind: 'feature' | 'daily'; title: string; body: string }

async function getEntries(): Promise<Entry[]> {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
    const { data } = await supabase
      .from('changelog_entries')
      .select('id, entry_date, kind, title, body')
      .order('entry_date', { ascending: false })
      .order('id', { ascending: false })
      .limit(200)
    return (data as Entry[] | null) ?? []
  } catch {
    return []
  }
}

function label(entryDate: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${entryDate}T00:00:00`))
}

export default async function Page() {
  const entries = await getEntries()

  return (
    <main className="rules-doc-shell">
      <header className="rules-doc-topbar">
        <Link href="/" className="back-link"><ArrowLeft size={16} /> Back to MarketCue</Link>
        <div className="topbar-meta">
          <div className="brand-mark"><BrandSymbol size={32} /><div><strong>MarketCue</strong></div></div>
        </div>
      </header>
      <div className="rules-doc-layout rules-doc-layout--single">
        <article className="rules-doc-content">
          <div className="doc-hero">
            <p className="eyebrow">Changelog</p>
            <h1>What changed on MarketCue</h1>
            <p>Product updates, alongside a daily entry confirming the site's data and read are current.</p>
          </div>
          <section className="doc-section">
            {entries.map((e) => (
              <div key={e.id} className="doc-note" style={{ marginTop: 0, marginBottom: 16, flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
                <span style={{ color: 'var(--muted)', fontSize: 'var(--text-label)' }}>{label(e.entry_date)} · {e.kind === 'daily' ? 'Daily update' : 'Product update'}</span>
                <strong style={{ fontSize: 'var(--text-meta)' }}>{e.title}</strong>
                <span>{e.body}</span>
              </div>
            ))}
            {entries.length === 0 && <p className="doc-intro">No entries yet.</p>}
          </section>
        </article>
      </div>
    </main>
  )
}
