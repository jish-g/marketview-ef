import type { ReactNode } from 'react'
import { BrandSymbol } from '@/components/brand-mark'
import Link from 'next/link'
import { ArrowLeft, BarChart3, BookOpen, Send } from 'lucide-react'
import { FaqBlock } from '@/components/faq-block'
import type { FaqItem } from '@/lib/faq'
import { formatDateLabel, type RecentPost } from '@/lib/market-data'

export type MetricRow = { metric: string; value: ReactNode; read: string }

// The eight single-metric pages linked up to /rules and /nifty-sensex-today but never across
// to each other, so they read as eight leaves rather than one cluster. Each page links to
// three siblings, using the metric's real name as the anchor text (never "read more").
const METRIC_PAGES: { path: string; name: string; blurb: string }[] = [
  { path: '/india-vix-today', name: 'India VIX today', blurb: 'Volatility level and option readiness' },
  { path: '/gift-nifty-today', name: 'GIFT Nifty today', blurb: 'Overnight gap and predicted open' },
  { path: '/nifty-pcr-today', name: 'Nifty PCR today', blurb: 'Put-Call Ratio and market bias' },
  { path: '/nifty-max-pain-today', name: 'Nifty max pain today', blurb: 'Max pain strike and the pull it implies' },
  { path: '/nifty-support-resistance-today', name: 'Nifty support and resistance today', blurb: 'Chart and open-interest levels' },
  { path: '/nse-option-chain-analysis', name: 'Nifty option chain analysis', blurb: 'Open-interest structure' },
  { path: '/sensex-option-chain', name: 'Sensex option chain', blurb: 'Sensex open-interest structure' },
  { path: '/fii-dii-data-today', name: 'FII and DII data today', blurb: 'Institutional net flow' },
]

function siblingsFor(path: string) {
  const i = METRIC_PAGES.findIndex((m) => m.path === path)
  if (i === -1) return METRIC_PAGES.slice(0, 3)
  // Rotate from the current page so each page links to a different trio and the cluster
  // stays evenly connected rather than all pointing at the same three.
  return [1, 2, 3].map((n) => METRIC_PAGES[(i + n) % METRIC_PAGES.length])
}

type EvergreenPageProps = {
  eyebrow: string
  h1: string
  updatedISO: string
  updatedLabel: string
  metricLabel: string
  metricValue: ReactNode
  metricSub: string
  tableRows: MetricRow[]
  paragraphs: string[]
  faq: FaqItem[]
  recentPosts: RecentPost[]
  /** Route path of this page, e.g. "/india-vix-today". Drives sibling links and breadcrumbs. */
  path: string
  /** Where the figures come from. Attribution materially affects whether an answer engine quotes the page. */
  sourceLabel?: string
}

export function EvergreenPage({ eyebrow, h1, updatedISO, updatedLabel, metricLabel, metricValue, metricSub, tableRows, paragraphs, faq, recentPosts, path, sourceLabel = 'NSE option chain' }: EvergreenPageProps) {
  const siblings = siblingsFor(path)
  const self = METRIC_PAGES.find((m) => m.path === path)
  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'MarketCue', item: 'https://marketcue.in' },
      { '@type': 'ListItem', position: 2, name: "Today's numbers", item: 'https://marketcue.in/nifty-sensex-today' },
      { '@type': 'ListItem', position: 3, name: self?.name ?? h1, item: `https://marketcue.in${path}` },
    ],
  }
  return (
    <main className="rules-doc-shell">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
      <header className="rules-doc-topbar">
        <Link href="/" className="back-link"><ArrowLeft size={16} /> Back to MarketCue</Link>
        <div className="topbar-meta">
          <a href="https://t.me/marketcue_in" target="_blank" rel="noopener noreferrer" className="sign-in-link"><Send size={13} /> Join Telegram</a>
          <div className="brand-mark"><BrandSymbol size={32} /><div><strong>MarketCue</strong></div></div>
        </div>
      </header>
      <div className="rules-doc-layout about-doc-layout">
        <article className="rules-doc-content">
          <div className="doc-hero">
            <p className="eyebrow">{eyebrow}</p>
            <h1>{h1}</h1>
            <time className="evergreen-updated" dateTime={updatedISO}>{updatedLabel}</time>
            <div className="evergreen-metric-callout">
              <span>{metricLabel}</span>
              <strong>{metricValue}</strong>
              <small>{metricSub}</small>
            </div>
          </div>

          <section className="doc-section">
            <table className="blog-metrics-table">
              <caption className="visually-hidden">{`${metricLabel}: current value and reading. ${updatedLabel}`}</caption>
              <thead><tr><th scope="col">Metric</th><th scope="col">Value</th><th scope="col">Read</th></tr></thead>
              <tbody>
                {tableRows.map((row) => (
                  <tr key={row.metric}><th scope="row">{row.metric}</th><td data-col="Value">{row.value}</td><td data-col="Read">{row.read}</td></tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="doc-section">
            {paragraphs.map((p, i) => <p className="doc-intro evergreen-paragraph" key={i}>{p}</p>)}
            <p className="doc-hero-links"><Link href="/rules"><BookOpen size={13} style={{ display: 'inline', verticalAlign: '-2px', marginRight: '4px' }} />Read the full MarketCue scoring methodology</Link></p>
            <p className="evergreen-source">Source: {sourceLabel}. <time dateTime={updatedISO}>{updatedLabel}</time>.</p>
          </section>

          <section className="doc-section evergreen-related">
            <h2>Related readings</h2>
            <ul>
              {siblings.map((m) => (
                <li key={m.path}>
                  <Link href={m.path}>{m.name}</Link> — {m.blurb}.
                </li>
              ))}
            </ul>
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
