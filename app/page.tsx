import type { Metadata } from 'next'
import HomeClient from './home-client'

export const metadata: Metadata = {
  title: 'MarketCue — Nifty & Sensex market reads, built on rules you can audit',
  description:
    'A daily read on Nifty and Sensex from a documented, rules-based scoring framework — pre-market call before the open, post-market recap after the close. Not a black box.',
  alternates: { canonical: 'https://marketcue.in/' },
  openGraph: {
    title: 'MarketCue — Nifty & Sensex market reads, built on rules you can audit',
    description:
      'A daily read on Nifty and Sensex from a documented, rules-based scoring framework — pre-market call before the open, post-market recap after the close.',
    url: 'https://marketcue.in/',
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

export default function Page() {
  return <HomeClient />
}
