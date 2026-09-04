import type { Metadata } from 'next'
import { EvergreenPage } from '@/components/evergreen-page'
import { faqJsonLd, type FaqItem } from '@/lib/faq'
import { getLatestRow, getRecentPosts, fmtNum, fmtPct, formatDateLabel, vixRead } from '@/lib/market-data'

export const revalidate = 300

const SITE_URL = 'https://marketcue.in'

export const metadata: Metadata = {
  title: 'India VIX Today — Live Reading & Read | MarketCue',
  description: "Today's India VIX level and what it means for option buying and selling strategies, from MarketCue's documented rules engine.",
  alternates: { canonical: `${SITE_URL}/india-vix-today` },
}

const FAQ: FaqItem[] = [
  {
    question: 'How does India VIX affect option buying?',
    answer:
      'India VIX sets the day’s risk posture. MarketCue reads 11–14 as the ideal, lowest-risk range for buying premium; below 11 as thin, theta-heavy premium; 14–18 as elevated; 18–22 as high with IV-crush risk; and above 22 as a level that blocks fresh option-buying strategies specifically, while selling strategies (credit spreads, iron condors) remain allowed.',
  },
  {
    question: 'What is considered a high India VIX?',
    answer:
      'MarketCue treats 18 and above as elevated, and above 22 as high enough to block fresh option-buying strategies outright (selling strategies remain allowed at any VIX level). Below 11 is treated as unusually low — thin, theta-heavy premium that makes buying less attractive for a different reason.',
  },
  {
    question: 'Does a high India VIX mean the market will fall?',
    answer:
      'No — VIX measures expected volatility (the magnitude of moves priced into options), not direction. A high VIX means bigger swings are expected in either direction, and richer option premiums as a result; it does not by itself indicate a bullish or bearish bias.',
  },
]

export default async function IndiaVixTodayPage() {
  const row = await getLatestRow('premarket_dashboard', 'trade_date, india_vix, india_vix_change_pct')
  const recentPosts = await getRecentPosts(5)

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: 'India VIX Today',
    description: metadata.description,
    url: `${SITE_URL}/india-vix-today`,
  }

  const vix = row?.india_vix
  const asOfLabel = row?.trade_date ? formatDateLabel(row.trade_date) : 'unavailable'

  const tableRows = [
    { metric: 'India VIX', value: fmtNum(vix), read: vixRead(vix) },
    { metric: 'Change vs previous session', value: fmtPct(row?.india_vix_change_pct), read: row?.india_vix_change_pct != null ? (Number(row.india_vix_change_pct) >= 0 ? 'Volatility expectation rising' : 'Volatility expectation falling') : '—' },
  ]

  const paragraphs = [
    `India VIX stood at ${fmtNum(vix)} as of ${asOfLabel} — ${vixRead(vix).toLowerCase()}. India VIX (the "fear gauge") measures the market's expectation of Nifty's volatility over the next 30 days, derived from the prices of out-of-the-money Nifty options. It doesn't predict direction — only magnitude: a higher VIX means the market is pricing in bigger swings, in either direction, and option premiums get richer as a result.`,
    `MarketCue's rules engine uses India VIX as the first of three inputs to its Stage 2 Option Readiness score (alongside IV-vs-VIX and days-to-expiry). The bands are fixed and documented: 11–14 is the ideal, lowest-risk range for buying option premium; below 11 is unusually thin, theta-heavy premium; 14–18 is elevated; 18–22 carries real IV-crush risk; and above 22 blocks fresh option-buying strategies specifically — though selling strategies like credit spreads and iron condors remain allowed at any VIX level, since a seller benefits from elevated premium rather than being exposed to it decaying.`,
    `Today's reading of ${fmtNum(vix)} means the rules engine currently scores India VIX as "${vixRead(vix)}" for the purposes of picking a strategy — this feeds directly into whether a Naked Call/Put, a Debit Spread, a Credit Spread, or an Iron Condor gets recommended for a given Market Bias, alongside the IV-vs-VIX and days-to-expiry scores. The full scoring table is on the rules page linked below.`,
  ]

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd(FAQ)) }} />
      <EvergreenPage
        eyebrow="India VIX"
        h1="India VIX Today"
        metricLabel="India VIX"
        metricValue={fmtNum(vix)}
        metricSub={`As of ${asOfLabel}`}
        tableRows={tableRows}
        paragraphs={paragraphs}
        faq={FAQ}
        recentPosts={recentPosts}
      />
    </>
  )
}
