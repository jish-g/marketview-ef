import type { Metadata } from 'next'
import { EvergreenPage } from '@/components/evergreen-page'
import { faqJsonLd, type FaqItem } from '@/lib/faq'
import {
  getLatestRow, getRecentPosts, fmtNum, formatDateLabel, getUpdatedMeta,
  pcrRead, maxPainRead, oiRead, vixRead,
} from '@/lib/market-data'

export const revalidate = 300

const SITE_URL = 'https://marketcue.in'

export const metadata: Metadata = {
  title: 'NSE Option Chain Analysis Today — Nifty | MarketCue',
  description: "Today's live NSE option chain read for Nifty: PCR, Max Pain, and OI support/resistance, from MarketCue's documented rules engine.",
  alternates: { canonical: `${SITE_URL}/nse-option-chain-analysis` },
}

const FAQ: FaqItem[] = [
  {
    question: 'What is NSE option chain analysis?',
    answer:
      'NSE option chain analysis reads the open interest, Put-Call Ratio, and Max Pain across an index\'s option strikes on the National Stock Exchange -- primarily Nifty 50, the NSE\'s headline index. It\'s used to gauge where large positions expect price to gravitate or struggle as expiry approaches.',
  },
  {
    question: 'What is a good PCR for Nifty?',
    answer:
      'A Put-Call Ratio above 1.30 reads as oversold / bullish (more puts written than calls), 0.80–1.30 is neutral, and below 0.80 reads as overbought / bearish. MarketCue weights PCR as a fixed 20% of its Market Bias score regardless of days to expiry.',
  },
  {
    question: 'How do you read open interest (OI) on the NSE option chain?',
    answer:
      'OI change at the key support and resistance strikes shows whether that level is being defended or abandoned, tracked day over day. Addition at support means the floor is being reinforced (bullish for that level); Unwinding at resistance means sellers are losing conviction there (a breakout signal).',
  },
]

export default async function NseOptionChainAnalysisPage() {
  const row = await getLatestRow(
    'premarket_dashboard',
    'trade_date, pcr_nifty, max_pain_nifty, oi_support_nifty, oi_resistance_nifty, oi_change_support_nifty, oi_change_resistance_nifty, atm_iv_nifty, india_vix, prev_close_nifty'
  )
  const recentPosts = await getRecentPosts(5)
  const updated = getUpdatedMeta(row)

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: 'NSE Option Chain Analysis',
    description: metadata.description,
    url: `${SITE_URL}/nse-option-chain-analysis`,
    dateModified: updated.iso,
    temporalCoverage: updated.tradeDate ?? undefined,
    creator: { '@type': 'Organization', name: 'MarketCue' },
  }

  const pcr = row?.pcr_nifty
  const maxPain = row?.max_pain_nifty
  const asOfLabel = row?.trade_date ? formatDateLabel(row.trade_date) : 'unavailable'

  const tableRows = [
    { metric: 'PCR (Put-Call Ratio)', value: fmtNum(pcr), read: pcrRead(pcr) },
    { metric: 'Max Pain', value: fmtNum(maxPain), read: maxPainRead(row?.prev_close_nifty, maxPain) },
    { metric: 'OI Support', value: fmtNum(row?.oi_support_nifty), read: oiRead(row?.oi_change_support_nifty, true) },
    { metric: 'OI Resistance', value: fmtNum(row?.oi_resistance_nifty), read: oiRead(row?.oi_change_resistance_nifty, false) },
    { metric: 'ATM IV', value: fmtNum(row?.atm_iv_nifty), read: '—' },
    { metric: 'India VIX', value: fmtNum(row?.india_vix), read: vixRead(row?.india_vix) },
  ]

  const paragraphs = [
    `The NSE's headline index, Nifty 50, currently shows a Put-Call Ratio of ${fmtNum(pcr)} as of ${asOfLabel} — ${pcrRead(pcr).toLowerCase()}. PCR compares outstanding put open interest to call open interest across all strikes; a high ratio (more puts written than calls) is read as a contrarian bullish signal, since heavy put-writing typically reflects sellers confident the market won't fall that far, not traders expecting a decline.`,
    `Max Pain for Nifty sits at ${fmtNum(maxPain)}${row?.prev_close_nifty != null ? `, against a previous close of ${fmtNum(row.prev_close_nifty)}` : ''}. This is the strike at which option writers as a group would lose the least money at expiry — price tends to drift toward it as expiry nears, since writers collectively have more capital at risk than buyers and an incentive to defend the level. MarketCue's rules engine reads the current spot-to-Max-Pain distance as: ${maxPainRead(row?.prev_close_nifty, maxPain).toLowerCase()}.`,
    `Rounding out the option chain read, OI at the key support (${fmtNum(row?.oi_support_nifty)}) and resistance (${fmtNum(row?.oi_resistance_nifty)}) strikes shows whether those levels are being defended or abandoned day over day. Support with fresh Addition reinforces the floor; Unwinding at resistance signals sellers are losing conviction there — a breakout risk. All of these bands (PCR, Max Pain distance, and OI direction) feed directly into MarketCue's documented Market Bias score, published in full on the rules page.`,
  ]

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd(FAQ)) }} />
      <EvergreenPage
        eyebrow="NSE Option Chain"
        h1="NSE Option Chain Analysis Today"
        updatedISO={updated.iso}
        updatedLabel={updated.label}
        metricLabel="Nifty PCR"
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
