import type { Metadata } from 'next'
import { EvergreenPage } from '@/components/evergreen-page'
import { faqJsonLd, type FaqItem } from '@/lib/faq'
import { getLatestRow, getRecentPosts, fmtNum, formatDateLabel, getUpdatedMeta } from '@/lib/market-data'

export const revalidate = 300

const SITE_URL = 'https://marketcue.in'

export const metadata: Metadata = {
  title: 'FII DII Data Today — Net Cash Flow | MarketCue',
  description: "Today's FII and DII net cash flow figures for Indian equities, from MarketCue's daily post-market data.",
  alternates: { canonical: `${SITE_URL}/fii-dii-data-today` },
}

const FAQ: FaqItem[] = [
  {
    question: 'What are FII and DII in the stock market?',
    answer:
      'FII stands for Foreign Institutional Investor and DII for Domestic Institutional Investor. Both are large institutional players whose daily net buying or selling of Indian equities is published after each session and closely watched as a proxy for large-money sentiment.',
  },
  {
    question: 'How do FII/DII flows affect Nifty and Sensex?',
    answer:
      'Sustained net FII selling tends to coincide with downward pressure on Nifty and Sensex, since foreign flows are typically the larger and more momentum-driven of the two; sustained DII buying can offset that pressure, as domestic institutions (mutual funds, insurers) often buy into weakness. A single day\'s flow is noisy -- the trend over several sessions matters more than any one print.',
  },
  {
    question: 'Where does MarketCue get FII/DII data from?',
    answer:
      'MarketCue publishes the FII/DII net cash flow figures reported by the exchanges after each trading session, alongside the day\'s post-market Nifty and Sensex recap.',
  },
]

function flowRead(v: any): string {
  if (v == null || v === '') return '—'
  const n = Number(v)
  if (n > 0) return 'Net buyer'
  if (n < 0) return 'Net seller'
  return 'Flat'
}

export default async function FiiDiiDataTodayPage() {
  const row = await getLatestRow('postmarket_summary', 'trade_date, fii_net_cash_cr, dii_net_cash_cr, fii_dii_data_date')
  const recentPosts = await getRecentPosts(5)
  const updated = getUpdatedMeta(row)

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: 'FII DII Data Today',
    description: metadata.description,
    url: `${SITE_URL}/fii-dii-data-today`,
    dateModified: updated.iso,
    temporalCoverage: updated.tradeDate ?? undefined,
    creator: { '@type': 'Organization', name: 'MarketCue' },
  }

  const fii = row?.fii_net_cash_cr
  const dii = row?.dii_net_cash_cr
  const asOfLabel = row?.fii_dii_data_date ?? row?.trade_date
  const asOfDisplay = asOfLabel ? formatDateLabel(asOfLabel) : 'unavailable'

  const tableRows = [
    { metric: 'FII Net Cash Flow', value: fii != null ? `₹${fii} Cr` : '—', read: flowRead(fii) },
    { metric: 'DII Net Cash Flow', value: dii != null ? `₹${dii} Cr` : '—', read: flowRead(dii) },
  ]

  const paragraphs = [
    `As of ${asOfDisplay}, Foreign Institutional Investors (FII) were ${fii != null ? `net ${flowRead(fii).toLowerCase()}s at ₹${Math.abs(Number(fii))} crore` : 'not yet available'}, while Domestic Institutional Investors (DII) were ${dii != null ? `net ${flowRead(dii).toLowerCase()}s at ₹${Math.abs(Number(dii))} crore` : 'not yet available'}. These figures are published by the exchanges after each session closes and represent the aggregate net buying or selling by each investor class across Indian equities that day.`,
    `FII and DII flows matter because of scale: both categories move enough capital that a sustained run of net selling or buying can shift the supply-demand balance for Nifty and Sensex independent of retail sentiment. FII flows tend to be more momentum-driven and sensitive to global risk appetite, currency moves, and US rate expectations; DII flows (largely mutual funds and insurers investing systematic domestic savings) are typically steadier and often buy into weakness that FIIs are selling into, which is one reason Indian markets have historically been more resilient to foreign outflows than some other emerging markets.`,
    `A single day's FII or DII print is noisy and shouldn't be over-read in isolation -- it's the multi-day trend that tends to correlate with market direction. MarketCue publishes this data alongside its post-market Nifty and Sensex recap every trading day, so it can be read in context with the session's actual price action rather than as a standalone number.`,
  ]

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd(FAQ)) }} />
      <EvergreenPage
        eyebrow="FII / DII Data"
        h1="FII DII Data Today"
        updatedISO={updated.iso}
        updatedLabel={updated.label}
        metricLabel="FII Net Flow"
        metricValue={fii != null ? `₹${fii} Cr` : '—'}
        metricSub={`As of ${asOfDisplay} — DII ₹${fmtNum(dii)} Cr`}
        tableRows={tableRows}
        paragraphs={paragraphs}
        faq={FAQ}
        recentPosts={recentPosts}
      />
    </>
  )
}
