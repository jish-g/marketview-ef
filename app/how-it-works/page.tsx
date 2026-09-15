import type { Metadata } from 'next'
import { BrandSymbol } from '@/components/brand-mark'
import Link from 'next/link'
import { BarChart3 } from 'lucide-react'

export const metadata: Metadata = {
  title: 'How MarketCue works — how the intelligence layer reads a day',
  description: 'MarketCue reads Nifty and Sensex options data through the trading day and publishes one view: a read before the open, a view of record at 9:35, hourly checkpoints against it, and a grade after the close. Trained on a published playbook; departures are stated.',
  alternates: { canonical: '/how-it-works' },
}

const STEPS = [
  { n: '08:48', title: 'The read', body: 'Before the open, the intelligence layer reads the overnight setup — GIFT Nifty, India VIX, days to expiry, where open interest is being added or unwound — and writes what kind of day it is, the levels that decide it, and the risks worth a flag. No strategy yet; there is nothing to act on before the auction.' },
  { n: '09:35', title: 'The view of record', body: 'Five minutes after the opening data lands, it forms one view per index: bias, whether options are worth trading, which structure, and — always — the condition that would prove the view wrong, as a level. This is the call for the day. It starts from the playbook and says, in its own words, if it weighed a signal differently and why.' },
  { n: 'Hourly', title: 'Checkpoints', body: 'At 10:30, 11:30, 12:30, 1:30 and 2:30 it manages its own view rather than re-making it. The invalidation level is checked in code against the live index and handed to it as a fact. Its answer is one of hold, adjust, exit, enter, or stay out — and once a view is exited it stays exited unless a genuinely new setup appears with its own invalidation.' },
  { n: '15:50', title: 'The grade', body: 'After the close it grades its own morning view — right, partial, wrong, or stayed out — names the signal that misled, and writes a one-line lesson. The playbook alone is graded the same way, on the same day, so the two can be compared. The lesson is read back the next morning.' },
]

const CANNOT_SEE = [
  'A scheduled event — expiry day above all, an RBI decision, a US data release — that sets the mechanics of the session before the first tick.',
  'A gap that opens straight into a strike where calls are being added: the level, not the direction, is the story.',
  'A put-call ratio that is high because puts were written into a rally rather than bought as hedges.',
  'Institutional flow running against the gap.',
  'What happened the last time this setup appeared — the last ten sessions and its own graded lessons are in front of it every morning.',
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
            <p>MarketCue reads the same options data every session and publishes one view per index — formed by an intelligence layer trained on a published playbook, managed through the day against its own invalidation, and graded after the close.</p>
          </div>

          <section className="doc-section">
            <h2>The short answer</h2>
            <p className="doc-intro">MarketCue captures Nifty and Sensex options data at fixed checkpoints through the trading day. An intelligence layer — a model given the full <Link href="/rules">playbook</Link> of weights and thresholds as knowledge, not as a lookup — reads that data and forms a view: what kind of day it is, the bias, whether options are worth trading, which structure, and the level at which the view is wrong. It then holds or exits that view at hourly checkpoints and grades itself after the close. Every number it reads is computed by the data pipeline; every judgement is its own, and it says so when it departs from the playbook.</p>
          </section>

          <section className="doc-section">
            <h2>A day, in four steps</h2>
            {STEPS.map((s) => (
              <div key={s.n} style={{ marginTop: 'var(--s-5)' }}>
                <h3 style={{ fontSize: 'var(--text-h3)', marginBottom: 'var(--s-2)' }}>{s.n} · {s.title}</h3>
                <p className="doc-intro">{s.body}</p>
              </div>
            ))}
          </section>

          <section className="doc-section">
            <h2>What the playbook cannot see</h2>
            <p className="doc-intro">The <Link href="/rules">playbook</Link> scores gap, open interest, put-call ratio and max pain with fixed weights, and reads VIX, implied volatility and days to expiry for whether premium is worth touching. It is the foundation. What it cannot do is notice context, and that is the intelligence layer&apos;s job:</p>
            <ul className="doc-intro" style={{ paddingLeft: 'var(--s-5)', display: 'grid', gap: 'var(--s-2)' }}>
              {CANNOT_SEE.map((line) => <li key={line}>{line}</li>)}
            </ul>
            <p className="doc-intro">When any of these change the read, the view departs from the table and names the signal it weighed differently. Departures are visible on every screen, beside the playbook&apos;s own bias, readiness and IV condition.</p>
          </section>

          <section className="doc-section">
            <h2>Two limits it cannot override</h2>
            <p className="doc-intro">Everything above is the intelligence layer&apos;s call. Two things are not, because they are account-risk limits rather than market reads: when India VIX is above 22 no fresh premium-buying structure is allowed, and with one day or less to expiry no naked option is allowed. Both are enforced in code after the view is formed, and any override is recorded on the view itself.</p>
          </section>

          <section className="doc-section">
            <h2>What it does not do</h2>
            <p className="doc-intro">It does not compute a single market number — PCR, max pain, implied volatility, the expected move, strikes, targets and stops all come from the data pipeline and are shown as they are. It does not place, size or route orders; the trade log is a paper record of its own calls. It does not know your position size or risk tolerance. And when it finds no edge, the view is no trade — which is a result, not a failure to produce one.</p>
            <p className="doc-intro">MarketCue is not investment advice. See the <Link href="/disclaimer">disclaimer</Link>.</p>
          </section>
        </div>
      </div>
    </main>
  )
}
