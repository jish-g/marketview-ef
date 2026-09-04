import type { Metadata } from 'next'
import { EvergreenPage } from '@/components/evergreen-page'
import { faqJsonLd, type FaqItem } from '@/lib/faq'
import { getLatestRow, getRecentPosts, fmtNum, fmtPct, formatDateLabel, gapRead } from '@/lib/market-data'

export const revalidate = 300

const SITE_URL = 'https://marketcue.in'

export const metadata: Metadata = {
  title: 'GIFT Nifty Today — Live Gap & Predicted Open | MarketCue',
  description: "Today's GIFT Nifty gap and the predicted Nifty opening level it implies, from MarketCue's documented rules engine.",
  alternates: { canonical: `${SITE_URL}/gift-nifty-today` },
}

const FAQ: FaqItem[] = [
  {
    question: 'What is GIFT Nifty?',
    answer:
      'GIFT Nifty (formerly SGX Nifty) is a Nifty 50 derivative contract traded on the NSE International Exchange at GIFT City, Gujarat, during hours that overlap with Nifty\'s pre-market. Because it trades before the Indian cash market opens, its price move relative to the previous close is used as the leading indicator for where Nifty is likely to open.',
  },
  {
    question: 'How accurate is GIFT Nifty at predicting Nifty\'s open?',
    answer:
      'GIFT Nifty\'s predicted open (gap % applied to Nifty\'s previous close) is directionally reliable but not exact — the actual opening gap can differ from the GIFT Nifty-implied gap due to news, global market moves, or order-flow overnight. MarketCue\'s post-market reads track the difference between predicted and actual open. Sensex has no equivalent leading indicator.',
  },
  {
    question: 'What does a positive GIFT Nifty gap mean?',
    answer:
      'A positive GIFT Nifty gap means GIFT Nifty is trading above its reference close, implying Nifty is likely to open higher. MarketCue reads a gap above 0.75% as a Strong Gap Up, 0.25%–0.75% as a Normal Gap Up, and anything tighter than ±0.25% as Flat.',
  },
]

export default async function GiftNiftyTodayPage() {
  const row = await getLatestRow('premarket_dashboard', 'trade_date, gift_nifty_gap_pct, gift_nifty_gap_pts, prev_close_nifty')
  const recentPosts = await getRecentPosts(5)

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: 'GIFT Nifty Today',
    description: metadata.description,
    url: `${SITE_URL}/gift-nifty-today`,
  }

  const gapPct = row?.gift_nifty_gap_pct
  const gapPts = row?.gift_nifty_gap_pts
  const prevClose = row?.prev_close_nifty
  const predictedOpen = gapPct != null && prevClose != null ? (Number(prevClose) + (Number(gapPct) / 100) * Number(prevClose)).toFixed(1) : null
  const asOfLabel = row?.trade_date ? formatDateLabel(row.trade_date) : 'unavailable'

  const tableRows = [
    { metric: 'GIFT Nifty Gap %', value: fmtPct(gapPct), read: gapRead(gapPct) },
    { metric: 'GIFT Nifty Gap (points)', value: gapPts != null ? `${Number(gapPts) > 0 ? '+' : ''}${gapPts} pts` : '—', read: gapRead(gapPct) },
    { metric: 'Nifty Previous Close', value: fmtNum(prevClose), read: 'Reference level' },
    { metric: 'Predicted Nifty Open', value: predictedOpen ?? '—', read: 'Nifty previous close + gap' },
  ]

  const paragraphs = [
    `GIFT Nifty is showing a gap of ${fmtPct(gapPct)}${gapPts != null ? ` (${Number(gapPts) > 0 ? '+' : ''}${gapPts} points)` : ''} as of ${asOfLabel} — MarketCue's rules engine reads this as a "${gapRead(gapPct)}". GIFT Nifty (formerly SGX Nifty) trades at GIFT City, Gujarat during hours that overlap with the Indian pre-market session, so its move relative to the previous close is used as the leading indicator for where Nifty is likely to open before the NSE cash market itself opens at 9:15 AM IST.`,
    `The predicted opening level is calculated directly from this gap: Predicted Open (points) = GIFT Nifty gap % ÷ 100 × Nifty's previous close.${prevClose != null ? ` With Nifty's previous close at ${fmtNum(prevClose)}, that puts the predicted open near ${predictedOpen}.` : ''} This is a mechanical calculation, not a forecast model — the actual opening print can and does deviate from it based on overnight global cues, news, and order flow that GIFT Nifty itself may not fully capture by the time the cash market opens.`,
    `Gap % is also one of four weighted inputs to MarketCue's Stage 1 Market Bias score, contributing up to 45% of the total when more than 3 trading days remain to expiry (dropping to 25% inside the last 3 days, when Open Interest structure takes over as the dominant signal). Note that Sensex has no equivalent leading indicator to GIFT Nifty — its opening gap is only knowable once the BSE cash market itself opens.`,
  ]

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd(FAQ)) }} />
      <EvergreenPage
        eyebrow="GIFT Nifty"
        h1="GIFT Nifty Today"
        metricLabel="GIFT Nifty Gap"
        metricValue={fmtPct(gapPct)}
        metricSub={`As of ${asOfLabel}${predictedOpen ? ` — predicted open ${predictedOpen}` : ''}`}
        tableRows={tableRows}
        paragraphs={paragraphs}
        faq={FAQ}
        recentPosts={recentPosts}
      />
    </>
  )
}
