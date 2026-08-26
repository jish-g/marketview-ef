import type { Metadata } from 'next'
import HomeClient from './home-client'

const SITE_URL = 'https://marketcue.in'

export const metadata: Metadata = {
  title: 'MarketCue — Nifty & Sensex market reads, built on rules you can audit',
  description:
    'A daily read on Nifty and Sensex from a documented, rules-based scoring framework — pre-market call before the open, post-market recap after the close. Not a black box.',
  alternates: { canonical: `${SITE_URL}/` },
  openGraph: {
    title: 'MarketCue — Nifty & Sensex market reads, built on rules you can audit',
    description:
      'A daily read on Nifty and Sensex from a documented, rules-based scoring framework — pre-market call before the open, post-market recap after the close.',
    url: `${SITE_URL}/`,
    siteName: 'MarketCue',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'MarketCue — Nifty & Sensex market reads, built on rules you can audit',
    description:
      'A daily read on Nifty and Sensex from a documented, rules-based scoring framework — pre-market call before the open, post-market recap after the close.',
  },
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'MarketCue',
  url: `${SITE_URL}/`,
  description: 'A daily read on Nifty and Sensex, built from a rules engine you can audit.',
  publisher: { '@type': 'Organization', name: 'MarketCue', url: `${SITE_URL}/` },
}

export default function Page() {
  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <HomeClient />
    </>
  )
}
