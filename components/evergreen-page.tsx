import type { ReactNode } from 'react'
import Link from 'next/link'
import { ArrowLeft, BarChart3, BookOpen, Send } from 'lucide-react'
import { FaqBlock } from '@/components/faq-block'
import type { FaqItem } from '@/lib/faq'
import { formatDateLabel, type RecentPost } from '@/lib/market-data'

export type MetricRow = { metric: string; value: ReactNode; read: string }

type EvergreenPageProps = {
  eyebrow: string
  h1: string
  metricLabel: string
  metricValue: ReactNode
  metricSub: string
  tableRows: MetricRow[]
  paragraphs: string[]
  faq: FaqItem[]
  recentPosts: RecentPost[]
}

export function EvergreenPage({ eyebrow, h1, metricLabel, metricValue, metricSub, tableRows, paragraphs, faq, recentPosts }: EvergreenPageProps) {
  return (
    <main className="rules-doc-shell">
      <header className="rules-doc-topbar">
        <Link href="/" className="back-link"><ArrowLeft size={16} /> Back to MarketCue</Link>
        <div className="topbar-meta">
          <a href="https://t.me/marketcue_in" target="_blank" rel="noopener noreferrer" className="sign-in-link"><Send size={13} /> Join Telegram</a>
          <div className="brand-mark"><div className="brand-symbol"><BarChart3 size={16} /></div><div><strong>MarketCue</strong></div></div>
        </div>
      </header>
      <div className="rules-doc-layout about-doc-layout">
        <article className="rules-doc-content">
          <div className="doc-hero">
            <p className="eyebrow">{eyebrow}</p>
            <h1>{h1}</h1>
            <div className="evergreen-metric-callout">
              <span>{metricLabel}</span>
              <strong>{metricValue}</strong>
              <small>{metricSub}</small>
            </div>
          </div>

          <section className="doc-section">
            <table className="blog-metrics-table">
              <thead><tr><th scope="col">Metric</th><th scope="col">Value</th><th scope="col">Read</th></tr></thead>
              <tbody>
                {tableRows.map((row) => (
                  <tr key={row.metric}><th scope="row">{row.metric}</th><td>{row.value}</td><td>{row.read}</td></tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="doc-section">
            {paragraphs.map((p, i) => <p className="doc-intro evergreen-paragraph" key={i}>{p}</p>)}
            <p className="doc-hero-links"><Link href="/rules"><BookOpen size={13} style={{ display: 'inline', verticalAlign: '-2px', marginRight: '4px' }} />Read the full MarketCue rules engine methodology</Link></p>
          </section>

          <FaqBlock items={faq} />

          {recentPosts.length > 0 && (
            <section className="doc-section evergreen-recent">
              <h2>Recent Nifty &amp; Sensex reads</h2>
              <ul>
                {recentPosts.map((post) => (
                  <li key={post.slug}>
                    <Link href={`/nifty-sensex-today/${post.slug}`}>{formatDateLabel(post.trade_date)} · {post.phase === 'premarket' ? 'Pre-market' : 'Post-market'}</Link>
                  </li>
                ))}
              </ul>
              <p className="doc-hero-links"><Link href="/nifty-sensex-today">See the full archive →</Link></p>
            </section>
          )}
        </article>
      </div>
    </main>
  )
}
