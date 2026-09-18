import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ArrowUpRight, LineChart } from 'lucide-react'
import { INDICATOR_SECTIONS as sections } from '@/lib/indicators-content'

const SITE_URL = 'https://marketcue.in'

export function generateStaticParams() {
  return sections.map((s) => ({ slug: s.id }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const section = sections.find((s) => s.id === slug)
  if (!section) return { title: 'Indicator not found — MarketCue' }
  const name = section.title.replace(/^\d+\. /, '')
  return {
    title: `${name} — MarketCue chart indicator`,
    description: section.intro.length > 155 ? `${section.intro.slice(0, 152)}...` : section.intro,
    alternates: { canonical: `${SITE_URL}/indicators/${slug}` },
  }
}

export default async function IndicatorDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const section = sections.find((s) => s.id === slug)
  if (!section) notFound()
  const name = section.title.replace(/^\d+\. /, '')
  const index = sections.findIndex((s) => s.id === slug)
  const prev = sections[index - 1], next = sections[index + 1]

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'TechArticle',
        headline: name,
        description: section.intro,
        url: `${SITE_URL}/indicators/${slug}`,
        isPartOf: { '@type': 'CollectionPage', name: 'MarketCue chart indicators', url: `${SITE_URL}/indicators` },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'MarketCue', item: SITE_URL },
          { '@type': 'ListItem', position: 2, name: 'Chart indicators', item: `${SITE_URL}/indicators` },
          { '@type': 'ListItem', position: 3, name, item: `${SITE_URL}/indicators/${slug}` },
        ],
      },
    ],
  }

  return <><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} /><main className="rules-doc-shell"><header className="rules-doc-topbar"><Link href="/indicators" className="back-link"><ArrowLeft size={16} /> All indicators</Link><div className="brand-mark"><div className="brand-symbol"><LineChart size={16} /></div><div><strong>CHART</strong><span>INDICATOR REFERENCE</span></div></div></header><div className="rules-doc-layout"><aside className="rules-doc-nav"><p className="eyebrow">On this page</p>{sections.map((s) => <Link key={s.id} href={`/indicators/${s.id}`} aria-current={s.id === slug ? 'page' : undefined}>{s.title.replace(/^\d+\. /, '')}<ArrowUpRight size={13} /></Link>)}</aside><article className="rules-doc-content"><div className="doc-hero"><p className="eyebrow">Chart Indicators — {name}</p><h1>{name}</h1></div><section className="doc-section"><p className="doc-intro">{section.intro}</p><table className="doc-table"><caption className="visually-hidden">{`${name} — parameters`}</caption><thead><tr>{section.columns.map((column) => <th key={column} scope="col">{column}</th>)}</tr></thead><tbody>{section.rows.map((row) => <tr key={row.join('-')}>{row.map((cell, i) => i === 0 ? <th key={cell} scope="row">{cell}</th> : <td key={cell} data-col={section.columns[i]}>{cell}</td>)}</tr>)}</tbody></table></section><nav className="doc-hero-links" style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>{prev ? <Link href={`/indicators/${prev.id}`}>&larr; {prev.title.replace(/^\d+\. /, '')}</Link> : <span />}{next ? <Link href={`/indicators/${next.id}`}>{next.title.replace(/^\d+\. /, '')} &rarr;</Link> : <span />}</nav></article></div></main></>
}
