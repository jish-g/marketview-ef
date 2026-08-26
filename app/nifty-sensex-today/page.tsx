import type { Metadata } from 'next'
import NiftySensexTodayIndexClient from './index-client'

const SITE_URL = 'https://marketcue.in'

export const metadata: Metadata = {
  title: 'Nifty & Sensex Today — Daily pre-market and post-market reads | MarketCue',
  description:
    'Daily gap, PCR, Max Pain, and option-readiness reads for Nifty and Sensex — published before the open and after the close, from the MarketCue rules engine.',
  alternates: { canonical: `${SITE_URL}/nifty-sensex-today` },
  openGraph: {
    title: 'Nifty & Sensex Today — Daily pre-market and post-market reads',
    description:
      'Daily gap, PCR, Max Pain, and option-readiness reads for Nifty and Sensex — published before the open and after the close.',
    url: `${SITE_URL}/nifty-sensex-today`,
    siteName: 'MarketCue',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Nifty & Sensex Today — Daily pre-market and post-market reads',
    description:
      'Daily gap, PCR, Max Pain, and option-readiness reads for Nifty and Sensex — published before the open and after the close.',
  },
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'CollectionPage',
  name: 'Nifty & Sensex Today',
  url: `${SITE_URL}/nifty-sensex-today`,
  description:
    'Daily gap, PCR, Max Pain, and option-readiness reads for Nifty and Sensex — published before the open and after the close.',
  isPartOf: { '@type': 'WebSite', name: 'MarketCue', url: `${SITE_URL}/` },
}

export default function Page() {
  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <NiftySensexTodayIndexClient />
    </>
  )
}
