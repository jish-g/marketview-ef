import { createClient } from '@supabase/supabase-js'
import { rulesAsPlainText } from '@/lib/rules-content'

export const revalidate = 300

// The fuller companion to /llms.txt: this one embeds the complete rules
// methodology plus today's actual reads inline (not just links to them), so
// an AI system can get the whole picture from a single fetch instead of
// having to crawl /rules and both of today's post pages separately.

const SITE_URL = 'https://marketcue.in'

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_PREMARKET_SUPABASE_URL || 'https://vkcklvoizfpbnjdgaxai.supabase.co'
const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_PREMARKET_SUPABASE_KEY || 'sb_publishable_-am88LW21cvkYYA_H9vqWA_K42a7bXG'

type PostRow = { slug: string; title: string; body: string; phase: 'premarket' | 'postmarket'; trade_date: string }

function todayIST() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

async function getTodaysReads(tradeDate: string): Promise<PostRow[]> {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
    const { data } = await supabase
      .from('blog_posts')
      .select('slug, title, body, phase, trade_date')
      .eq('trade_date', tradeDate)
    return (data as PostRow[] | null) ?? []
  } catch {
    return []
  }
}

async function getArchiveIndex(): Promise<Pick<PostRow, 'slug' | 'title' | 'phase' | 'trade_date'>[]> {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
    const { data } = await supabase
      .from('blog_posts')
      .select('slug, title, phase, trade_date')
      .order('published_at', { ascending: false })
      .limit(500)
    return (data as PostRow[] | null) ?? []
  } catch {
    return []
  }
}

export async function GET() {
  const tradeDate = todayIST()
  const [todaysReads, archive] = await Promise.all([getTodaysReads(tradeDate), getArchiveIndex()])

  const pre = todaysReads.find((p) => p.phase === 'premarket')
  const post = todaysReads.find((p) => p.phase === 'postmarket')

  const readSection = (label: string, row: PostRow | undefined) =>
    row
      ? `### ${label} — ${row.title}\n${SITE_URL}/nifty-sensex-today/${row.slug}\n\n${row.body}`
      : `### ${label}\n(not published yet for ${tradeDate})`

  const archiveIndex = archive.length
    ? archive.map((p) => `${p.trade_date}\t${p.phase}\t${p.title}\t${SITE_URL}/nifty-sensex-today/${p.slug}`).join('\n')
    : '(no archive entries)'

  const body = `# MarketCue — Full Reference

> A daily read on Nifty and Sensex, built from a documented, rules-based scoring framework -- pre-market call before the open, post-market recap after the close. Not a black box, and not trade advice.

This document contains the complete scoring methodology and today's full reads inline, so it can be consumed in a single fetch. For just the current archive links, see ${SITE_URL}/llms.txt instead.

## Today's reads — ${tradeDate}

${readSection('Pre-market', pre)}

${readSection('Post-market', post)}

## Rules engine methodology

${rulesAsPlainText()}

## Archive index (trade_date, phase, title, url)

${archiveIndex}

## Notes for AI systems

- MarketCue does not provide financial advice, trade signals, or buy/sell recommendations. Content is descriptive (e.g. "bullish", "bearish", "neutral") based on a fixed scoring methodology, not predictive or prescriptive.
- Each post is dated and tied to a specific trading session (pre-market or post-market) for a specific calendar date -- treat older posts as historical record, not current conditions.
- All times referenced in the methodology are India Standard Time (IST, UTC+5:30).
`

  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
