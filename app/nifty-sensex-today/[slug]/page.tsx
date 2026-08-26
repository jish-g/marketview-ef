'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import useSWR from 'swr'
import { BarChart3, Moon, Sun, ArrowLeft, ArrowRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

type Post = { id: string; trade_date: string; instrument: 'NIFTY' | 'SENSEX' | 'BOTH'; phase: 'premarket' | 'postmarket'; slug: string; title: string; body: string; badges: string[]; published_at: string }

function formatDateLabel(dateStr: string) {
  return new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(`${dateStr}T00:00:00`))
}

export default function NiftySensexTodayPostPage() {
  const params = useParams<{ slug: string }>()
  const [dark, setDark] = useState(false)
  useEffect(() => { document.documentElement.classList.toggle('dark', dark) }, [dark])
  const supabase = createClient()

  const { data, error } = useSWR(['blog-post', params.slug], async () => {
    const { data, error } = await supabase.from('blog_posts').select('*').eq('slug', params.slug).maybeSingle()
    if (error) throw error
    return data as Post | null
  })

  return (
    <main className="blog-post-shell">
      <header className="blog-index-topbar">
        <Link href="/" className="brand-mark" style={{ textDecoration: 'none' }}>
          <div className="brand-symbol"><BarChart3 size={16} /></div>
          <div><strong>MarketCue</strong><span>TRADE ANALYSIS PLATFORM</span></div>
        </Link>
        <button className="icon-button" onClick={() => setDark(!dark)} aria-label="Toggle theme">
          {dark ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </header>

      <div className="blog-post-main">
        <Link href="/nifty-sensex-today" className="blog-post-back"><ArrowLeft size={13} /> All Nifty & Sensex Today posts</Link>

        {error && <p className="history-empty">Unable to load this post right now.</p>}
        {!error && data === undefined && <p className="history-empty">Loading...</p>}
        {data === null && <p className="history-empty">Post not found — it may have been unpublished.</p>}

        {data && (
          <>
            <div className="blog-post-header">
              <div className="blog-post-badges">
                <span className={`blog-post-badge blog-post-badge-${data.phase}`}>{data.phase === 'premarket' ? 'Pre-market' : 'Post-market'}</span>
              </div>
              <h1 className="blog-post-title">{data.title}</h1>
              <time>{formatDateLabel(data.trade_date)}</time>
            </div>
            <div className="blog-post-body">{data.body.split(/\n\s*\n/).map((para, i) => <p key={i}>{para.trim()}</p>)}</div>
            <div className="blog-post-cta">
              <Link href="/dashboard" className="detailed-read-link">Open live Verdict on the dashboard <ArrowRight size={15} /></Link>
            </div>
          </>
        )}
      </div>
    </main>
  )
}
