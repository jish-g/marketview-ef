import type { Metadata } from 'next'
import { BrandSymbol } from '@/components/brand-mark'
import Link from 'next/link'
import { BarChart3 } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Disclaimer — MarketCue',
  description: 'MarketCue publishes rules-based readings of Nifty and Sensex options data. It is not investment advice and carries no recommendation to buy or sell.',
  alternates: { canonical: '/disclaimer' },
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'MarketCue', item: 'https://marketcue.in' },
    { '@type': 'ListItem', position: 2, name: 'Disclaimer', item: 'https://marketcue.in/disclaimer' },
  ],
}

export default function DisclaimerPage() {
  return (
    <main className="rules-doc-shell">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <header className="rules-doc-topbar">
        <Link href="/" className="brand-mark">
          <BrandSymbol size={32} />
          <div><strong>MarketCue</strong><span>TRADE ANALYSIS PLATFORM</span></div>
        </Link>
        <Link href="/" className="back-link">Back to MarketCue</Link>
      </header>
      <div className="rules-doc-layout">
        <div className="rules-doc-content">
          <div className="doc-hero">
            <p className="eyebrow">Legal</p>
            <h1>Disclaimer</h1>
            <p>MarketCue publishes rules-based readings of publicly available Nifty and Sensex options data. Nothing on this site is investment advice.</p>
          </div>

          <section className="doc-section">
            <h2>Not investment advice</h2>
            <p className="doc-intro">MarketCue is not a registered investment adviser, research analyst, or broker under SEBI regulations, and nothing published here should be read as a recommendation to buy or sell any security. The readings are the output of a documented scoring framework applied to market data — they describe what the data says, not what you should do.</p>
          </section>

          <section className="doc-section">
            <h2>Where the data comes from</h2>
            <p className="doc-intro">Figures are derived from the NSE option chain and related public market data, captured at fixed checkpoints through the trading day. Each reading carries the time it was captured. Data can be delayed, revised, or missing, and a checkpoint can fail — where that happens the reading is marked rather than hidden.</p>
          </section>

          <section className="doc-section">
            <h2>No guarantee of accuracy</h2>
            <p className="doc-intro">Every figure and reading is provided as-is, without warranty of any kind. Errors in source data, in capture, or in the scoring framework itself are possible. Past readings are not indicative of future results, and no reading anticipates news, liquidity events, or the behaviour of any individual position.</p>
          </section>

          <section className="doc-section">
            <h2>Your decisions are your own</h2>
            <p className="doc-intro">Options trading carries substantial risk of loss and is not suitable for every investor. You are solely responsible for your own trading decisions and their outcomes. Consider your circumstances and, where appropriate, take advice from a SEBI-registered adviser before acting.</p>
          </section>

          <section className="doc-section">
            <h2>How the readings are produced</h2>
            <p className="doc-intro">Every recommendation traces to a published rule. The full scoring framework — the weights, the bands, and the thresholds — is documented on the <Link href="/rules">rules engine</Link> page, and the method is summarised on <Link href="/how-it-works">how it works</Link>.</p>
          </section>
        </div>
      </div>
    </main>
  )
}
