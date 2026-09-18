import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft, LineChart, ChevronRight } from 'lucide-react'
import { INDICATOR_SECTIONS as sections } from '@/lib/indicators-content'

const SITE_URL = 'https://marketcue.in'

export const metadata: Metadata = {
  title: 'MarketCue chart indicators — how each one is computed',
  description:
    'What each indicator on the MarketCue chart actually draws and how it is computed: Intraday, OI walls, Chart levels, Pivots, Volume, Volume Profile and the CVD-proxy.',
  alternates: { canonical: `${SITE_URL}/indicators` },
}

const breadcrumbJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'MarketCue', item: 'https://marketcue.in' },
    { '@type': 'ListItem', position: 2, name: 'Chart indicators', item: 'https://marketcue.in/indicators' },
  ],
}

export default function IndicatorsPage() {
  return <><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} /><main className="rules-doc-shell"><header className="rules-doc-topbar"><Link href="/dashboard" className="back-link"><ArrowLeft size={16} /> Back to dashboard</Link><div className="brand-mark"><div className="brand-symbol"><LineChart size={16} /></div><div><strong>CHART</strong><span>INDICATOR REFERENCE</span></div></div></header><div className="rules-doc-layout"><aside className="rules-doc-nav"><p className="eyebrow">On this page</p>{sections.map((section) => <a key={section.id} href={`#${section.id}`}>{section.title.replace(/^\d+\. /, '')}<ChevronRight size={13} /></a>)}</aside><article className="rules-doc-content"><div className="doc-hero"><p className="eyebrow">Chart — Indicator Reference</p><h1>MarketCue chart indicators</h1><p>What every indicator on the Chart screen actually draws and how it is computed -- no indicator here reads more into the market than the note below it says. Toggle any of these from the chart's own Indicators dialog.</p></div>{sections.map((section) => <section className="doc-section" id={section.id} key={section.id}><h2>{section.title}</h2><p className="doc-intro">{section.intro}</p><table className="doc-table"><caption className="visually-hidden">{`${section.title.replace(/^\d+\. /, '')} — parameters`}</caption><thead><tr>{section.columns.map((column) => <th key={column} scope="col">{column}</th>)}</tr></thead><tbody>{section.rows.map((row) => <tr key={row.join('-')}>{row.map((cell, i) => i === 0 ? <th key={cell} scope="row">{cell}</th> : <td key={cell} data-col={section.columns[i]}>{cell}</td>)}</tr>)}</tbody></table></section>)}</article></div></main></>
}
