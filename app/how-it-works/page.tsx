import type { Metadata } from 'next'
import { BrandSymbol } from '@/components/brand-mark'
import Link from 'next/link'
import { BarChart3 } from 'lucide-react'

export const metadata: Metadata = {
  title: 'How MarketCue works — the three-stage scoring framework',
  description: 'MarketCue scores Nifty and Sensex options data in three stages: market bias, option readiness, then a strategy recommendation. Every output traces to a rule.',
  alternates: { canonical: '/how-it-works' },
}

const STAGES = [
  { n: '01', title: 'Market bias', body: 'Gap %, open-interest structure, PCR and max pain are each scored and combined into one weighted number between −2 and +2. The weights shift with days to expiry: gap carries 45% when expiry is more than three days out, and open interest takes over at 45% inside three days. The result lands in one of five bands, from strong bearish to strong bullish.' },
  { n: '02', title: 'Option readiness', body: 'Separately from direction, the framework asks whether options are worth trading at all. India VIX level, ATM implied volatility measured against VIX, and days to expiry each contribute a score. The total sorts into good to buy, caution, or avoid — and avoid forces no trade regardless of how strong the directional bias looks.' },
  { n: '03', title: 'Strategy recommendation', body: 'The bias band and the IV condition are matched against each other, with VIX and expiry as safety filters. A bullish read on cheap premium suggests buying; the same read on expensive premium suggests selling instead. VIX above 22 blocks fresh premium-buying but leaves credit strategies available, and a single day to expiry downgrades naked positions to the matching spread.' },
]

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'MarketCue', item: 'https://marketcue.in' },
    { '@type': 'ListItem', position: 2, name: 'How it works', item: 'https://marketcue.in/how-it-works' },
  ],
}

export default function HowItWorksPage() {
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
            <p className="eyebrow">Method</p>
            <h1>How MarketCue works</h1>
            <p>MarketCue reads the same options data every session and scores it the same way every time. Three stages, in order, each one documented.</p>
          </div>

          <section className="doc-section">
            <h2>The short answer</h2>
            <p className="doc-intro">MarketCue captures Nifty and Sensex options data at fixed checkpoints through the trading day, scores it in three stages — market bias, then option readiness, then a strategy recommendation — and publishes one explained read before the open and after the close. Every recommendation traces to a rule you can check on the <Link href="/rules">rules engine</Link> page.</p>
          </section>

          <section className="doc-section">
            <h2>The three stages</h2>
            {STAGES.map((s) => (
              <div key={s.n} style={{ marginTop: 'var(--s-5)' }}>
                <h3 style={{ fontSize: 'var(--text-h3)', marginBottom: 'var(--s-2)' }}>{s.n} · {s.title}</h3>
                <p className="doc-intro">{s.body}</p>
              </div>
            ))}
          </section>

          <section className="doc-section">
            <h2>What it does not do</h2>
            <p className="doc-intro">The framework does not predict news, does not learn from its own past calls, and does not know anything about your position size or risk tolerance. It reads the data in front of it against a fixed set of rules. When those rules produce no edge, the output is no trade — which is a result, not a failure to produce one.</p>
            <p className="doc-intro">MarketCue is not investment advice. See the <Link href="/disclaimer">disclaimer</Link>.</p>
          </section>
        </div>
      </div>
    </main>
  )
}
