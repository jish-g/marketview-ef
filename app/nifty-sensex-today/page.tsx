import type { Metadata } from 'next'
import NiftySensexTodayIndexClient from './index-client'

export const metadata: Metadata = {
  title: 'Nifty & Sensex Today — Daily pre-market and post-market reads | MarketCue',
  description:
    'Daily gap, PCR, Max Pain, and option-readiness reads for Nifty and Sensex — published before the open and after the close, from the MarketCue rules engine.',
  alternates: { canonical: 'https://marketcue.in/nifty-sensex-today' },
  openGraph: {
    title: 'Nifty & Sensex Today — Daily pre-market and post-market reads',
    description:
      'Daily gap, PCR, Max Pain, and option-readiness reads for Nifty and Sensex — published before the open and after the close.',
    url: 'https://marketcue.in/nifty-sensex-today',
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

export default function Page() {
  return <NiftySensexTodayIndexClient />
}
