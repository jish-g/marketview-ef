import type { Metadata } from 'next'
import { EvergreenPage } from '@/components/evergreen-page'
import { faqJsonLd, type FaqItem } from '@/lib/faq'
import { getLatestRow, getRecentPosts, fmtNum, formatDateLabel, pcrRead } from '@/lib/market-data'

export const revalidate = 300

const SITE_URL = 'https://marketcue.in'

export const metadata: Metadata = {
  title: 'Nifty PCR Today — Live Put-Call Ratio | MarketCue',
  description: "Today's live Nifty Put-Call Ratio (PCR) and what it means for Market Bias, from MarketCue's documented rules engine.",
  alternates: { canonical: `${SITE_URL}/nifty-pcr-today` },
}

const FAQ: FaqItem[] = [
  {
    question: 'What is a good PCR for Nifty?',
    answer:
      'A Put-Call Ratio above 1.30 reads as oversold / bullish (more puts written than calls), 0.80–1.30 is neutral, and below 0.80 reads as overbought / bearish. MarketCue weights PCR as a fixed 20% of its Market Bias score regardless of days to expiry.',
  },
  {
    question: 'How is PCR calculated?',
    answer:
      'Put-Call Ratio is total put open interest (or volume) divided by total call open interest (or volume) across an index\'s option chain. MarketCue uses open-interest-based PCR, which reflects standing positions rather than the day\'s trading volume alone.',
  },
  {
    question: 'Is a high PCR bullish or bearish?',
    answer:
      'A high PCR (more puts written relative to calls) is read as a contrarian bullish signal, not a bearish one -- heavy put-writing usually reflects option sellers confident the market won\'t fall to that strike, which is a bullish position, rather than traders buying puts to bet on a decline.',
  },
]

export default async function NiftyPcrTodayPage() {
  const row = await getLatestRow('premarket_dashboard', 'trade_date, pcr_nifty, prev_close_nifty')
  const recentPosts = await getRecentPosts(5)

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: 'Nifty PCR Today',
    description: metadata.description,
    url: `${SITE_URL}/nifty-pcr-today`,
  }

  const pcr = row?.pcr_nifty
  const asOfLabel = row?.trade_date ? formatDateLabel(row.trade_date) : 'unavailable'

  const tableRows = [
    { metric: 'Nifty PCR', value: fmtNum(pcr), read: pcrRead(pcr) },
    { metric: 'Bias contribution', value: '20% of Market Bias (fixed weight)', read: 'Same weight regardless of days to expiry' },
  ]

  const paragraphs = [
    `Nifty's Put-Call Ratio reads ${fmtNum(pcr)} as of ${asOfLabel} — MarketCue's rules engine scores this as "${pcrRead(pcr)}". PCR is calculated as total put open interest divided by total call open interest across Nifty's option chain; it's a positioning indicator, not a price forecast, showing whether the market is more heavily hedged with puts or calls at any given moment.`,
    `The read is deliberately contrarian: a high PCR (well above 1.30) means significantly more puts are written relative to calls, which MarketCue treats as bullish rather than bearish. The logic is that option writers — who take on risk for a premium, rather than buying protection — are net short puts when they're confident the market won't fall that far, so heavy put-writing signals seller conviction that the downside is limited. Conversely, a PCR below 0.80 means calls dominate open interest, read as overbought / bearish.`,
    `PCR contributes a fixed 20% weight to MarketCue's Stage 1 Market Bias score regardless of how many days remain to expiry — unlike Gap % and Open Interest structure, whose weights shift as expiry approaches, PCR's influence on the overall bias stays constant throughout the expiry cycle. The remaining 80% comes from Gap %, OI structure, and Max Pain distance, each documented in full on the rules page.`,
  ]

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd(FAQ)) }} />
      <EvergreenPage
        eyebrow="Nifty PCR"
        h1="Nifty PCR Today"
        metricLabel="PCR"
        metricValue={fmtNum(pcr)}
        metricSub={`As of ${asOfLabel}`}
        tableRows={tableRows}
        paragraphs={paragraphs}
        faq={FAQ}
        recentPosts={recentPosts}
      />
    </>
  )
}
