import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft, ArrowUpRight, LineChart } from 'lucide-react'
import { INDICATOR_SECTIONS as sections } from '@/lib/indicators-content'

const SITE_URL = 'https://marketcue.in'

export const metadata: Metadata = {
  title: 'MarketCue chart indicators — how each one is computed',
  description:
    'What each indicator on the MarketCue chart actually draws and how it is computed: Intraday, OI walls, Chart levels, Pivots, Volume, Volume Profile, the CVD-proxy and FII/DII.',
  alternates: { canonical: `${SITE_URL}/indicators` },
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'CollectionPage',
      name: 'MarketCue chart indicators',
      description: 'What each indicator on the MarketCue chart draws and how it is computed.',
      url: `${SITE_URL}/indicators`,
      hasPart: sections.map((s) => ({
        '@type': 'TechArticle',
        headline: s.title.replace(/^\d+\. /, ''),
        url: `${SITE_URL}/indicators/${s.id}`,
      })),
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'MarketCue', item: SITE_URL },
        { '@type': 'ListItem', position: 2, name: 'Chart indicators', item: `${SITE_URL}/indicators` },
      ],
    },
  ],
}

export default function IndicatorsPage() {
  return <><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} /><main className="rules-doc-shell"><header className="rules-doc-topbar"><Link href="/dashboard" className="back-link"><ArrowLeft size={16} /> Back to dashboard</Link><div className="brand-mark"><div className="brand-symbol"><LineChart size={16} /></div><div><strong>CHART</strong><span>INDICATOR REFERENCE</span></div></div></header><div className="rules-doc-layout"><aside className="rules-doc-nav"><p className="eyebrow">On this page</p>{sections.map((section) => <Link key={section.id} href={`/indicators/${section.id}`}>{section.title.replace(/^\d+\. /, '')}<ArrowUpRight size={13} /></Link>)}</aside><article className="rules-doc-content"><div className="doc-hero"><p className="eyebrow">Chart — Indicator Reference</p><h1>MarketCue chart indicators</h1><p>What every indicator on the Chart screen actually draws and how it is computed -- no indicator here reads more into the market than the note below it says. Toggle any of these from the chart&apos;s own Indicators dialog.</p></div>{sections.map((section) => <section className="doc-section" key={section.id}><h2>{section.title}</h2><p className="doc-intro">{section.intro}</p><p className="doc-hero-links"><Link href={`/indicators/${section.id}`}>Read more <ArrowUpRight size={13} /></Link></p></section>)}</article></div></main></>
}
