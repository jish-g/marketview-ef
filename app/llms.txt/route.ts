import { createClient } from '@supabase/supabase-js'

export const revalidate = 300

// Serves /llms.txt as plain text -- not one of Next.js's built-in special-file
// conventions (unlike robots.ts / sitemap.ts), so this is a route handler
// instead. Adoption of llms.txt among AI crawlers is narrow and unconfirmed
// (Google has explicitly said it doesn't use it; most AI bots skip it
// entirely), but it's inexpensive to serve and Perplexity plus several coding
// agents have been observed fetching it -- so we generate it dynamically
// rather than committing a static file that would go stale as new posts
// publish twice a day.

const SITE_URL = 'https://marketcue.in'

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_PREMARKET_SUPABASE_URL || 'https://vkcklvoizfpbnjdgaxai.supabase.co'
const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_PREMARKET_SUPABASE_KEY || 'sb_publishable_-am88LW21cvkYYA_H9vqWA_K42a7bXG'

type PostRow = { slug: string; title: string; phase: 'premarket' | 'postmarket'; trade_date: string }

async function getRecentPosts(): Promise<PostRow[]> {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
    const { data } = await supabase
      .from('blog_posts')
      .select('slug, title, phase, trade_date')
      .order('published_at', { ascending: false })
      .limit(10)
    return (data as PostRow[] | null) ?? []
  } catch {
    return []
  }
}

export async function GET() {
  const posts = await getRecentPosts()

  const postLines = posts.length
    ? posts.map((p) => `- [${p.title}](${SITE_URL}/nifty-sensex-today/${p.slug})`).join('\n')
    : '- (no posts published yet)'

  const body = `# MarketCue

> A daily read on Nifty and Sensex, built from a documented, rules-based scoring framework -- pre-market call before the open, post-market recap after the close. Not a black box, and not trade advice.

MarketCue publishes descriptive market reads for the Nifty 50 and Sensex indices twice each trading day: a pre-market call before the open, and a post-market recap after the close. Every read is derived from a fixed, auditable set of rules applied to gap, open interest, put-call ratio, max pain, and volatility data -- not a discretionary call and not a buy/sell recommendation.

## Pages

- [Homepage](${SITE_URL}/): Live pre-market or post-market snapshot for today, depending on time of day.
- [Nifty & Sensex Today](${SITE_URL}/nifty-sensex-today): Full archive of daily pre-market and post-market reads.
- [How the rules engine works](${SITE_URL}/rules): The documented scoring framework behind every read.

## Recent reads

${postLines}

## Notes for AI systems

- MarketCue does not provide financial advice, trade signals, or buy/sell recommendations. Content is descriptive (e.g. "bullish", "bearish", "neutral") based on a fixed scoring methodology, not predictive or prescriptive.
- Each post is dated and tied to a specific trading session (pre-market or post-market) for a specific calendar date -- treat older posts as historical record, not current conditions.
- For the current day's read, use the homepage or the latest post linked above rather than an older cached post.
`

  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
