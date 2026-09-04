import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft, BookOpen, ChevronRight } from 'lucide-react'
import { FaqBlock } from '@/components/faq-block'
import { SEED_FAQ, faqJsonLd } from '@/lib/faq'
import { RULES_SECTIONS as sections, RULES_FORMULAS as formulas } from '@/lib/rules-content'

const SITE_URL = 'https://marketcue.in'

export const metadata: Metadata = {
  title: 'How MarketCue scores Nifty and Sensex — the full rules',
  description:
    'The exact weighted scoring rules behind every MarketCue read: gap, OI, PCR, max pain, IV and India VIX inputs, and how they resolve to bias and option readiness.',
  alternates: { canonical: `${SITE_URL}/rules` },
}

export default function DetailedRulesPage() {
  return <><script
    type="application/ld+json"
    // eslint-disable-next-line react/no-danger
    dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd(SEED_FAQ)) }}
  /><main className="rules-doc-shell"><header className="rules-doc-topbar"><Link href="/dashboard" className="back-link"><ArrowLeft size={16} /> Back to dashboard</Link><div className="brand-mark"><div className="brand-symbol"><BookOpen size={16} /></div><div><strong>RULES ENGINE</strong><span>DETAILED REFERENCE</span></div></div></header><div className="rules-doc-layout"><aside className="rules-doc-nav"><p className="eyebrow">On this page</p>{sections.map((section) => <a key={section.id} href={`#${section.id}`}>{section.title.replace(/^\d+\. /, '')}<ChevronRight size={13} /></a>)}<a href="#methodology">Predicted open &amp; targets<ChevronRight size={13} /></a></aside><article className="rules-doc-content"><div className="doc-hero"><p className="eyebrow">Rules Engine — Detailed Reference</p><h1>The MarketCue rules engine</h1><p>Full methodology behind the NIFTY/SENSEX premarket signals: the weighted Market Bias score, the combined Option Readiness score, the Bias/IV/VIX/DTE strategy lookup, and how predicted open, expected move, targets, and stop-losses are calculated.</p><p className="doc-hero-links">See it applied on the <Link href="/">MarketCue homepage</Link> or in the daily <Link href="/nifty-sensex-today">Nifty &amp; Sensex Today</Link> reads.</p></div>{sections.map((section) => <section className="doc-section" id={section.id} key={section.id}><h2>{section.title}</h2><p className="doc-intro">{section.intro}</p><div className="doc-table"><div className="doc-table-head">{section.columns.map((column) => <span key={column}>{column}</span>)}</div>{section.rows.map((row) => <div className="doc-table-row" key={row.join('-')}>{row.map((cell) => <span key={cell}>{cell}</span>)}</div>)}</div></section>)}<section className="doc-section" id="methodology"><h2>12. Predicted Open, Expected Move &amp; Targets</h2><p className="doc-intro">Convert volatility inputs into a concrete points target, stop-loss, and book profit/stop for buyer and seller strategies alike. Lot size and net premium remain trader-entered values.</p><div className="formula-grid">{formulas.map(([title, formula, note]) => <article className="formula-card" key={title}><p className="eyebrow">{title}</p><strong>{formula}</strong><span>{note}</span></article>)}</div></section><div className="doc-note"><strong>Methodology note</strong><span>Market Bias, Option Readiness, and Strategy Recommendation are fully rule-based — there is no discretionary Trend-vs-Range judgment call. VIX above 22 only blocks fresh option buying; selling strategies remain available at any VIX level, and a DTE of 1 or fewer only downgrades naked options to the matching debit spread rather than forcing a spread or Iron Condor across the board.</span></div><FaqBlock items={SEED_FAQ} /></article></div></main></>
}
