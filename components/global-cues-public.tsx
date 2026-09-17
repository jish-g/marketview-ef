import Link from 'next/link'
import { ArrowLeft, Send, BookOpen } from 'lucide-react'
import { BrandSymbol } from '@/components/brand-mark'
import { FaqBlock } from '@/components/faq-block'
import { GLOBAL_CUES_FAQ } from '@/lib/faq'

// Shared body for the live /global-cues-today page and each frozen /global-cues-today/[date]
// archive page. Deliberately not built on EvergreenPage (that component's sibling-link rotation
// is specific to the 8 single-metric pages) -- this reuses the same rules-doc-shell/doc-hero CSS
// classes directly instead, so a change here can never regress those 8 pages.

export type GlobalCuesNarrative = { summary: string; global: string; india: string; link: string }

type Props = {
  eyebrow: string
  h1: string
  asOfLabel: string
  isLive: boolean
  globalBand: string
  indiaBand: string
  transmissionLabel: string
  narrative: GlobalCuesNarrative
  /** For the archive page: link to the live page and the prior archived day. Omitted on the live page itself. */
  archiveNav?: { prevHref: string | null; prevLabel: string | null }
  /** Live page only: recent archived days, rendered as a scrollable feed below today's read --
   *  same "today first, scroll for history" pattern as /nifty-sensex-today. */
  recentDays?: { slug: string; label: string; globalBand: string; indiaBand: string; transmissionLabel: string }[]
  path: string
}

const RELATED_EVERGREEN = [
  { href: '/gift-nifty-today', label: 'GIFT Nifty today' },
  { href: '/india-vix-today', label: 'India VIX today' },
  { href: '/fii-dii-data-today', label: 'FII and DII data today' },
  { href: '/nifty-support-resistance-today', label: 'Nifty support and resistance today' },
]

export function GlobalCuesPublicPage({ eyebrow, h1, asOfLabel, isLive, globalBand, indiaBand, transmissionLabel, narrative, archiveNav, recentDays, path }: Props) {
  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'MarketCue', item: 'https://marketcue.in' },
      { '@type': 'ListItem', position: 2, name: 'Global cues today', item: 'https://marketcue.in/global-cues-today' },
      ...(path === '/global-cues-today' ? [] : [{ '@type': 'ListItem', position: 3, name: h1, item: `https://marketcue.in${path}` }]),
    ],
  }
  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: GLOBAL_CUES_FAQ.map((item) => ({ '@type': 'Question', name: item.question, acceptedAnswer: { '@type': 'Answer', text: item.answer } })),
  }

  return (
    <main className="rules-doc-shell">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
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
            <p className="global-cues-asof">{isLive && <span className="live-dot" aria-hidden="true" />}{asOfLabel}</p>
            <div className="global-cues-badges">
              <span className="ds-badge ds-badge--up">Global: {globalBand}</span>
              <span className="ds-badge ds-badge--up">India: {indiaBand}</span>
              <span className="ds-badge ds-badge--info">{transmissionLabel}</span>
            </div>
          </div>

          <section className="doc-section">
            <p className="doc-intro global-cues-hero-para">{narrative.summary}</p>
          </section>

          <section className="doc-section">
            <h2>Global environment</h2>
            <p className="doc-intro">{narrative.global}</p>
          </section>

          <section className="doc-section">
            <h2>India today</h2>
            <p className="doc-intro">{narrative.india}</p>
          </section>

          <section className="doc-section">
            <h2>Global to India link</h2>
            <p className="doc-intro">{narrative.link}</p>
          </section>

          <div className="doc-note">
            <span>
              <strong>How this is calculated.</strong> Every score, band and event above comes from a deterministic engine
              reading around 25 free market instruments plus India’s own breadth, flows and options data. A language model
              only writes the plain-English explanation, and every sentence is checked against the underlying figures before
              it publishes — a claim it can’t verify falls back to a plain computed sentence instead. Nothing here is
              investment advice.
            </span>
          </div>

          <p className="doc-hero-links"><Link href="/rules"><BookOpen size={13} style={{ display: 'inline', verticalAlign: '-2px', marginRight: '4px' }} />Read the full MarketCue scoring methodology</Link></p>

          {!isLive && archiveNav && (
            <section className="doc-section evergreen-related">
              <p className="doc-hero-links"><Link href="/global-cues-today">See today’s live read →</Link></p>
              {archiveNav.prevHref && <p className="doc-hero-links"><Link href={archiveNav.prevHref}>{archiveNav.prevLabel} →</Link></p>}
            </section>
          )}

          {isLive && recentDays && recentDays.length > 0 && (
            <section className="doc-section global-cues-recent">
              <h2>Recent days</h2>
              <ul>
                {recentDays.map((d) => (
                  <li key={d.slug}>
                    <Link href={`/global-cues-today/${d.slug}`}>{d.label}</Link>
                    {' — '}Global {d.globalBand}, India {d.indiaBand}, {d.transmissionLabel.toLowerCase()}
                  </li>
                ))}
              </ul>
              <p className="doc-hero-links"><Link href="/global-cues-today/archive">See the full archive →</Link></p>
            </section>
          )}

          <section className="doc-section evergreen-related">
            <h2>Related readings</h2>
            <ul>
              {RELATED_EVERGREEN.map((r) => (
                <li key={r.href}><Link href={r.href}>{r.label}</Link></li>
              ))}
            </ul>
          </section>

          <FaqBlock items={GLOBAL_CUES_FAQ} />
        </article>
      </div>
    </main>
  )
}
