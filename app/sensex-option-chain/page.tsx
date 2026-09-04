import type { Metadata } from 'next'
import { EvergreenPage } from '@/components/evergreen-page'
import { faqJsonLd, type FaqItem } from '@/lib/faq'
import {
  getLatestRow, getRecentPosts, fmtNum, formatDateLabel,
  pcrRead, maxPainRead, oiRead, vixRead,
} from '@/lib/market-data'

export const revalidate = 300

const SITE_URL = 'https://marketcue.in'

export const metadata: Metadata = {
  title: 'Sensex Option Chain Analysis Today | MarketCue',
  description: "Today's live Sensex option chain read: PCR, Max Pain, and OI support/resistance, from MarketCue's documented rules engine.",
  alternates: { canonical: `${SITE_URL}/sensex-option-chain` },
}

const FAQ: FaqItem[] = [
  {
    question: 'What does the Sensex option chain tell you?',
    answer:
      'The Sensex option chain shows how much open interest (outstanding contracts) sits at each strike price for calls and puts. Reading it together — Put-Call Ratio, Max Pain, and where OI is being added or unwound at key strikes — gives a picture of where large positions expect Sensex to gravitate or struggle near expiry.',
  },
  {
    question: 'What is a good PCR for Sensex?',
    answer:
      'The same bands MarketCue uses for Nifty apply to Sensex: a Put-Call Ratio above 1.30 reads as oversold / bullish, 0.80–1.30 is neutral, and below 0.80 reads as overbought / bearish.',
  },
  {
    question: 'How is Sensex Max Pain calculated?',
    answer:
      'Max Pain is the strike price at which Sensex option writers as a group would lose the least money at expiry. Price often drifts toward this level as expiry approaches — MarketCue reads more than 0.3% above Max Pain as a downward pull, more than 0.3% below as an upward pull, and within ±0.3% as pinning.',
  },
]

export default async function SensexOptionChainPage() {
  const row = await getLatestRow(
    'premarket_dashboard',
    'trade_date, pcr_sensex, max_pain_sensex, oi_support_sensex, oi_resistance_sensex, oi_change_support_sensex, oi_change_resistance_sensex, atm_iv_sensex, india_vix, prev_close_sensex'
  )
  const recentPosts = await getRecentPosts(5)

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: 'Sensex Option Chain Analysis',
    description: metadata.description,
    url: `${SITE_URL}/sensex-option-chain`,
  }

  const pcr = row?.pcr_sensex
  const maxPain = row?.max_pain_sensex
  const asOfLabel = row?.trade_date ? formatDateLabel(row.trade_date) : 'unavailable'

  const tableRows = [
    { metric: 'PCR (Put-Call Ratio)', value: fmtNum(pcr), read: pcrRead(pcr) },
    { metric: 'Max Pain', value: fmtNum(maxPain), read: maxPainRead(row?.prev_close_sensex, maxPain) },
    { metric: 'OI Support', value: fmtNum(row?.oi_support_sensex), read: oiRead(row?.oi_change_support_sensex, true) },
    { metric: 'OI Resistance', value: fmtNum(row?.oi_resistance_sensex), read: oiRead(row?.oi_change_resistance_sensex, false) },
    { metric: 'ATM IV', value: fmtNum(row?.atm_iv_sensex), read: '—' },
    { metric: 'India VIX', value: fmtNum(row?.india_vix), read: vixRead(row?.india_vix) },
  ]

  const paragraphs = [
    `As of ${asOfLabel}, Sensex's option chain reads a Put-Call Ratio of ${fmtNum(pcr)} — ${pcrRead(pcr).toLowerCase()}. PCR compares outstanding put contracts to call contracts across all strikes; a high ratio means more puts are written relative to calls, which MarketCue's rules engine reads as a contrarian bullish signal since heavy put-writing usually reflects sellers betting the market won't fall to that strike, rather than traders expecting a decline.`,
    `Max Pain for Sensex currently sits at ${fmtNum(maxPain)}${row?.prev_close_sensex != null ? `, against a previous close of ${fmtNum(row.prev_close_sensex)}` : ''}. Max Pain is the strike at which option writers as a group would lose the least money at expiry — price tends to gravitate toward this level as expiry approaches because writers (who collectively hold more capital at risk than buyers) have an incentive to defend it. The distance between spot and Max Pain is read as a directional pull: ${maxPainRead(row?.prev_close_sensex, maxPain).toLowerCase()}.`,
    `Open interest structure at the key support (${fmtNum(row?.oi_support_sensex)}) and resistance (${fmtNum(row?.oi_resistance_sensex)}) strikes rounds out the picture. Whether OI is being added or unwound at these levels — tracked day-over-day — signals whether large positions are defending that level or abandoning it. Support with fresh Addition suggests the floor is being reinforced; Unwinding at resistance suggests sellers are losing conviction, a breakout signal. Every one of these bands is documented in full on MarketCue's rules engine, so this read is reproducible, not a discretionary call.`,
  ]

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd(FAQ)) }} />
      <EvergreenPage
        eyebrow="Sensex Option Chain"
        h1="Sensex Option Chain Analysis Today"
        metricLabel="PCR"
        metricValue={fmtNum(pcr)}
        metricSub={`As of ${asOfLabel} — Max Pain ${fmtNum(maxPain)}`}
        tableRows={tableRows}
        paragraphs={paragraphs}
        faq={FAQ}
        recentPosts={recentPosts}
      />
    </>
  )
}
