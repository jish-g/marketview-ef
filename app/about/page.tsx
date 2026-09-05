import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft, BarChart3 } from 'lucide-react'

const SITE_URL = 'https://marketcue.in'

export const metadata: Metadata = {
  title: 'About MarketCue',
  description: 'Who writes and maintains the MarketCue rules engine, and how to reach us.',
  alternates: { canonical: `${SITE_URL}/about` },
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Person',
  name: 'Jishnu',
  jobTitle: 'Founder, MarketCue',
  url: `${SITE_URL}/about`,
  worksFor: { '@type': 'Organization', name: 'MarketCue', url: SITE_URL },
}

export default function AboutPage() {
  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <main className="rules-doc-shell">
        <header className="rules-doc-topbar">
          <Link href="/" className="back-link"><ArrowLeft size={16} /> Back to MarketCue</Link>
          <div className="brand-mark">
            <div className="brand-symbol"><BarChart3 size={16} /></div>
            <div><strong>MarketCue</strong><span>ABOUT</span></div>
          </div>
        </header>
        <div className="rules-doc-layout about-doc-layout">
          <article className="rules-doc-content">
            <div className="doc-hero">
              <p className="eyebrow">About</p>
              <h1>Jishnu, Founder — MarketCue</h1>
              <p>
                MarketCue is built and maintained by Jishnu. The site runs a documented,
                rules-based scoring engine over Nifty and Sensex options data — Gap, Open
                Interest, PCR, Max Pain, IV and India VIX — to publish a pre-market call before
                the open and a post-market recap after the close, every trading session. The
                full scoring methodology is public on the <Link href="/rules">rules page</Link>,
                and the daily reads are archived at <Link href="/nifty-sensex-today">Nifty &amp;
                Sensex Today</Link>.
              </p>
              <p>
                MarketCue is not a licensed investment adviser, and nothing published on this
                site is personalized investment advice — it is a documented, mechanical read on
                publicly available market data.
              </p>
              <p className="doc-hero-links">
                Follow updates on <a href="https://t.me/marketcue_in" target="_blank" rel="noopener noreferrer">Telegram</a>,{' '}
                <a href="https://x.com/marketcue_in" target="_blank" rel="noopener noreferrer">X</a>, or{' '}
                <a href="https://www.linkedin.com/company/marketcue-in" target="_blank" rel="noopener noreferrer">LinkedIn</a>.
              </p>
            </div>
          </article>
        </div>
      </main>
    </>
  )
}
