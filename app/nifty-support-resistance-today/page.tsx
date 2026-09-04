import type { Metadata } from 'next'
import { EvergreenPage } from '@/components/evergreen-page'
import { faqJsonLd, type FaqItem } from '@/lib/faq'
import { getLatestRow, getRecentPosts, fmtNum, formatDateLabel, oiRead } from '@/lib/market-data'

export const revalidate = 300

const SITE_URL = 'https://marketcue.in'

export const metadata: Metadata = {
  title: 'Nifty Support & Resistance Today — OI Levels | MarketCue',
  description: "Today's live Nifty support and resistance strikes from open interest, and whether they're strengthening or weakening.",
  alternates: { canonical: `${SITE_URL}/nifty-support-resistance-today` },
}

const FAQ: FaqItem[] = [
  {
    question: 'How is Nifty support and resistance calculated from options data?',
    answer:
      'MarketCue identifies support as the strike with the heaviest put open interest below spot, and resistance as the strike with the heaviest call open interest above spot -- the levels where option writers have concentrated the most contracts, and therefore have the strongest incentive to defend.',
  },
  {
    question: 'What does OI "Addition" or "Unwinding" mean at a support or resistance level?',
    answer:
      '"Addition" means fresh open interest is being built at that strike compared to the prior session, strengthening the level. "Unwinding" means existing open interest is being closed out, weakening the level -- at support, that reads as breakdown risk; at resistance, as breakout risk.',
  },
  {
    question: 'Do options-based support and resistance levels change during the day?',
    answer:
      'Yes -- open interest shifts as new contracts are written or existing ones closed throughout the session, so support and resistance strikes derived from OI can shift session to session, unlike a purely chart-based support/resistance level.',
  },
]

export default async function NiftySupportResistanceTodayPage() {
  const row = await getLatestRow(
    'premarket_dashboard',
    'trade_date, oi_support_nifty, oi_resistance_nifty, oi_change_support_nifty, oi_change_resistance_nifty, prev_close_nifty'
  )
  const recentPosts = await getRecentPosts(5)

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: 'Nifty Support & Resistance Today',
    description: metadata.description,
    url: `${SITE_URL}/nifty-support-resistance-today`,
  }

  const support = row?.oi_support_nifty
  const resistance = row?.oi_resistance_nifty
  const asOfLabel = row?.trade_date ? formatDateLabel(row.trade_date) : 'unavailable'

  const tableRows = [
    { metric: 'Nifty Support', value: fmtNum(support), read: oiRead(row?.oi_change_support_nifty, true) },
    { metric: 'Nifty Resistance', value: fmtNum(resistance), read: oiRead(row?.oi_change_resistance_nifty, false) },
    { metric: 'Nifty Previous Close', value: fmtNum(row?.prev_close_nifty), read: 'Reference spot' },
  ]

  const paragraphs = [
    `Nifty's options-derived support sits at ${fmtNum(support)} and resistance at ${fmtNum(resistance)} as of ${asOfLabel}${row?.prev_close_nifty != null ? `, with spot at ${fmtNum(row.prev_close_nifty)}` : ''}. These levels come from open interest concentration: support is the strike with the heaviest put open interest below spot, and resistance the strike with the heaviest call open interest above spot — the levels where option writers have the largest positions, and therefore the strongest financial incentive to defend.`,
    `MarketCue's rules engine tracks whether OI at each level is being added to or unwound, comparing the two most recently completed trading days. At support, the current read is "${oiRead(row?.oi_change_support_nifty, true)}" — Addition means the floor is being reinforced with fresh contracts, while Unwinding means existing positions are being closed out, read as breakdown risk. At resistance, the read is "${oiRead(row?.oi_change_resistance_nifty, false)}" — Addition strengthens the ceiling, while Unwinding suggests sellers are losing conviction there, a breakout signal.`,
    `This OI-based support/resistance read is one of four weighted inputs to MarketCue's Stage 1 Market Bias score, contributing 25% of the total when more than 3 days remain to expiry and rising to 45% — the single largest weight of any input — inside the last 3 days, when open interest positioning typically dominates price action into expiry.`,
  ]

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd(FAQ)) }} />
      <EvergreenPage
        eyebrow="Nifty Support & Resistance"
        h1="Nifty Support & Resistance Today"
        metricLabel="Support / Resistance"
        metricValue={`${fmtNum(support)} / ${fmtNum(resistance)}`}
        metricSub={`As of ${asOfLabel}`}
        tableRows={tableRows}
        paragraphs={paragraphs}
        faq={FAQ}
        recentPosts={recentPosts}
      />
    </>
  )
}
