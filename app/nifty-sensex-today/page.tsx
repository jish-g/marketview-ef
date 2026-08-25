'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { BarChart3, Moon, Sun, ArrowRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

type Post = { id: string; trade_date: string; instrument: 'NIFTY' | 'SENSEX' | 'BOTH'; phase: 'premarket' | 'postmarket'; slug: string; title: string; badges: string[]; published_at: string }

function formatDateLabel(dateStr: string) {
  return new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${dateStr}T00:00:00`))
}

export default function NiftySensexTodayIndexPage() {
  const [dark, setDark] = useState(false)
  useEffect(() => { document.documentElement.classList.toggle('dark', dark) }, [dark])
  const supabase = createClient()

  const { data, error } = useSWR(['blog-posts', 'BOTH'], async () => {
    const { data, error } = await supabase.from('blog_posts').select('*').order('published_at', { ascending: false }).limit(60)
    if (error) throw error
    return (data ?? []) as Post[]
  })

  const posts = data ?? []

  return (
    <main className="blog-index-shell">
      <header className="blog-index-topbar">
        <Link href="/" className="brand-mark" style={{ textDecoration: 'none' }}>
          <div className="brand-symbol"><BarChart3 size={16} /></div>
          <div><strong>MarketCue</strong><span>TRADE ANALYSIS PLATFORM</span></div>
        </Link>
        <button className="icon-button" onClick={() => setDark(!dark)} aria-label="Toggle theme">
          {dark ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </header>

      <div className="blog-index-main">
        <div className="blog-index-head">
          <p className="eyebrow">Nifty & Sensex Today</p>
          <h1 style={{ fontSize: 'clamp(26px,3vw,34px)', letterSpacing: '-.02em', marginTop: 8 }}>Daily Nifty and Sensex pre-market and post-market reads</h1>
          <p>Daily gap, PCR, Max Pain, and option-readiness reads for both Nifty and Sensex in one place — published before the open and after the close, straight from the MarketCue rules engine.</p>
        </div>

        {error && <p className="history-empty">Unable to load posts right now.</p>}
        {!error && !data && <p className="history-empty">Loading...</p>}
        {data && posts.length === 0 && <p className="history-empty">No posts published yet — check back before the next session.</p>}

        <div className="blog-post-list">
          {posts.map((post) => (
            <Link key={post.id} href={`/nifty-sensex-today/${post.slug}`} className="blog-post-card">
              <div className="blog-post-card-head">
                <div className="blog-post-badges">
                  <span className={`blog-post-badge blog-post-badge-${post.phase}`}>{post.phase === 'premarket' ? 'Pre-market' : 'Post-market'}</span>
                </div>
                <ArrowRight size={14} />
              </div>
              <strong>{post.title}</strong>
              <time>{formatDateLabel(post.trade_date)}</time>
            </Link>
          ))}
        </div>
      </div>
    </main>
  )
}
