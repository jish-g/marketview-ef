import type { Metadata } from 'next'
import { EvergreenPage } from '@/components/evergreen-page'
import { faqJsonLd, type FaqItem } from '@/lib/faq'
import { getLatestRow, getRecentPosts, fmtNum, formatDateLabel, getUpdatedMeta, maxPainRead } from '@/lib/market-data'

export const revalidate = 300

const SITE_URL = 'https://marketcue.in'

export const metadata: Metadata = {
  title: 'Nifty Max Pain Today — Live Strike & Read | MarketCue',
  description: "Today's live Nifty Max Pain strike and what the distance from spot implies, from MarketCue's documented rules engine.",
  alternates: { canonical: `${SITE_URL}/nifty-max-pain-today` },
}

const FAQ: FaqItem[] = [
  {
    question: 'What does max pain mean in options?',
    answer:
      'Max Pain is the strike price at which option writers as a group would lose the least money at expiry. Price often gravitates toward this level as expiry approaches, so MarketCue reads the distance between spot and Max Pain as a directional pull: more than 0.3% below Max Pain suggests an upward pull, within ±0.3% suggests pinning, and more than 0.3% above suggests a downward pull.',
  },
  {
    question: 'Why does price gravitate toward Max Pain?',
    answer:
      'Option writers (sellers) collectively hold more capital at risk than option buyers, since buyers\' losses are capped at the premium paid while writers\' losses are not. That gives writers, as a group, more influence over price near expiry, and an incentive to see price settle where the smallest number of contracts finish in-the-money -- the Max Pain strike.',
  },
  {
    question: 'Is Max Pain a reliable predictor of Nifty\'s expiry close?',
    answer:
      'It\'s a directional tendency, not a guarantee -- Max Pain reflects one input among several (Gap %, OI structure, PCR) that MarketCue\'s rules engine weighs together, and it contributes a fixed 10% to the overall Market Bias score regardless of days to expiry.',
  },
]

export default async function NiftyMaxPainTodayPage() {
  const row = await getLatestRow('premarket_dashboard', 'trade_date, max_pain_nifty, prev_close_nifty')
  const recentPosts = await getRecentPosts(5)
  const updated = getUpdatedMeta(row)

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: 'Nifty Max Pain Today',
    description: metadata.description,
    url: `${SITE_URL}/nifty-max-pain-today`,
    dateModified: updated.iso,
    temporalCoverage: updated.tradeDate ?? undefined,
    creator: { '@type': 'Organization', name: 'MarketCue' },
  }

  const maxPain = row?.max_pain_nifty
  const prevClose = row?.prev_close_nifty
  const diffPts = maxPain != null && prevClose != null ? (Number(prevClose) - Number(maxPain)).toFixed(1) : null
  const asOfLabel = row?.trade_date ? formatDateLabel(row.trade_date) : 'unavailable'

  const tableRows = [
    { metric: 'Nifty Max Pain', value: fmtNum(maxPain), read: maxPainRead(prevClose, maxPain) },
    { metric: 'Nifty Previous Close', value: fmtNum(prevClose), read: 'Reference spot' },
    { metric: 'Distance (points)', value: diffPts ?? '—', read: diffPts != null ? (Number(diffPts) > 0 ? 'Spot above Max Pain' : Number(diffPts) < 0 ? 'Spot below Max Pain' : 'At Max Pain') : '—' },
  ]

  const paragraphs = [
    `Nifty's Max Pain strike currently sits at ${fmtNum(maxPain)} as of ${asOfLabel}${prevClose != null ? `, against a previous close of ${fmtNum(prevClose)}` : ''}. MarketCue's rules engine reads this distance as: "${maxPainRead(prevClose, maxPain)}". Max Pain is the strike price at which option writers as a group would lose the least money if Nifty expired exactly there — every point away from it in either direction increases the aggregate payout writers owe to option buyers.`,
    `The reasoning behind why price tends to drift toward Max Pain as expiry nears comes down to capital at risk: option writers collectively have far more capital exposed than buyers, whose maximum loss is capped at the premium paid. That asymmetry gives writers more influence over price action close to expiry, and a real incentive to see the underlying settle near the strike that minimizes their collective payout.`,
    `MarketCue reads the spot-to-Max-Pain distance in three bands: more than 0.3% above Max Pain implies a downward pull toward expiry, more than 0.3% below implies an upward pull, and within ±0.3% suggests pinning is likely. This contributes a fixed 10% weight to the overall Market Bias score — smaller than Gap % or OI structure, but part of the same documented, auditable framework rather than a standalone prediction.`,
  ]

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd(FAQ)) }} />
      <EvergreenPage
        eyebrow="Nifty Max Pain"
        h1="Nifty Max Pain Today"
        updatedISO={updated.iso}
        updatedLabel={updated.label}
        metricLabel="Max Pain"
        metricValue={fmtNum(maxPain)}
        metricSub={`As of ${asOfLabel}`}
        tableRows={tableRows}
        paragraphs={paragraphs}
        faq={FAQ}
        recentPosts={recentPosts}
      />
    </>
  )
}
