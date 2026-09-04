import type { Metadata } from 'next'
import { cache } from 'react'
import { createClient } from '@supabase/supabase-js'
import NiftySensexTodayPostClient from './detail-client'

export const revalidate = 60

// Server-side data fetch for this dynamic route. Uses the same publishable
// (anon, read-only) Supabase credentials already used client-side and in
// sitemap.ts -- safe to read here since RLS restricts this key to SELECT only.
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_PREMARKET_SUPABASE_URL || 'https://vkcklvoizfpbnjdgaxai.supabase.co'
const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_PREMARKET_SUPABASE_KEY || 'sb_publishable_-am88LW21cvkYYA_H9vqWA_K42a7bXG'

const SITE_URL = 'https://marketcue.in'

type PostRow = { id: string; slug: string; title: string; body: string; phase: 'premarket' | 'postmarket'; trade_date: string; instrument: 'NIFTY' | 'SENSEX' | 'BOTH'; badges: string[]; published_at: string }
type Row = Record<string, any>

// Wrapped in React's cache() so generateMetadata and the page body both calling
// getPost() for the same slug within one request collapse into a single
// Supabase round trip instead of two.
const getPost = cache(async (slug: string): Promise<PostRow | null> => {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
    const { data } = await supabase
      .from('blog_posts')
      .select('*')
      .eq('slug', slug)
      .maybeSingle()
    return (data as PostRow | null) ?? null
  } catch {
    return null
  }
})

// Wrapped in cache() for the same reason as getPost above -- generateMetadata
// and the page body both need this, and getPost's own cache guarantees they
// receive the identical `post` object reference, so this collapses to one
// Supabase round trip per request too.
const getMarketRow = cache(async (post: PostRow): Promise<Row | null> => {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
    const table = post.phase === 'premarket' ? 'premarket_dashboard' : 'postmarket_summary'
    const { data } = await supabase.from(table).select('*').eq('trade_date', post.trade_date).maybeSingle()
    return (data as Row | null) ?? null
  } catch {
    return null
  }
})

type PrevPost = { slug: string; title: string; phase: 'premarket' | 'postmarket'; trade_date: string }

const getPreviousPost = cache(async (post: PostRow): Promise<PrevPost | null> => {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
    const { data } = await supabase
      .from('blog_posts')
      .select('slug, title, phase, trade_date')
      .lt('published_at', post.published_at)
      .order('published_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    return (data as PrevPost | null) ?? null
  } catch {
    return null
  }
})

// One evergreen page per phase -- premarket reads pair naturally with GIFT
// Nifty (the leading indicator premarket is built from), postmarket reads
// with FII/DII flow (published alongside the post-market recap).
function relatedEvergreenLink(phase: 'premarket' | 'postmarket'): { href: string; label: string } {
  return phase === 'premarket'
    ? { href: '/gift-nifty-today', label: 'GIFT Nifty Today' }
    : { href: '/fii-dii-data-today', label: 'FII DII Data Today' }
}

function shortDateLabel(dateStr: string) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${dateStr}T00:00:00`))
}

// Purpose-built meta description leading with the actual numbers and stated
// bias, rather than the old approach of truncating the post body's first
// sentence mid-word with an ellipsis -- this always reads as a complete
// sentence and always surfaces the day's headline figures in the SERP snippet.
function purposefulDescription(post: PostRow, marketRow: Row | null): string {
  const date = shortDateLabel(post.trade_date)
  if (post.phase === 'premarket') {
    const giftPts = marketRow?.gift_nifty_gap_pts
    const giftStr = giftPts != null ? `GIFT Nifty ${Number(giftPts) > 0 ? '+' : ''}${giftPts} pts` : 'GIFT Nifty gap pending'
    const bias = marketRow?.market_bias_nifty ? String(marketRow.market_bias_nifty).toLowerCase() : 'neutral'
    const vix = marketRow?.india_vix != null ? `, India VIX ${marketRow.india_vix}` : ''
    return `Pre-market read for ${date}: ${giftStr}, bias ${bias}${vix}. Full rules-based scoring inside.`
  }
  const niftyPct = marketRow?.day_change_pct_nifty
  const sensexPct = marketRow?.day_change_pct_sensex
  const niftyStr = niftyPct != null ? `Nifty ${Number(niftyPct) > 0 ? '+' : ''}${niftyPct}%` : 'Nifty close pending'
  const sensexStr = sensexPct != null ? `, Sensex ${Number(sensexPct) > 0 ? '+' : ''}${sensexPct}%` : ''
  const bias = niftyPct != null ? (Number(niftyPct) > 0 ? 'bullish' : Number(niftyPct) < 0 ? 'bearish' : 'neutral') : 'neutral'
  return `Post-market read for ${date}: ${niftyStr}${sensexStr}, bias ${bias}. Full rules-based scoring inside.`
}

const BRAND_SUFFIX = ' | MarketCue'

// The generated headline (post.title, written by the external rules engine)
// already carries its own "| MarketCue" suffix -- stripping it here so the
// <title> template below applies exactly one, instead of doubling up into
// "... | MarketCue | MarketCue".
function bareHeadline(title: string): string {
  return title.replace(/\s*\|\s*MarketCue\s*$/i, '').trim()
}

// Keeps <title> at the audit's 50-60 char target: the brand suffix is never
// truncated, only the headline portion, so the page's own identity always
// stays intact in a truncated SERP snippet.
function pageTitle(headline: string): string {
  const maxHeadlineLen = 60 - BRAND_SUFFIX.length
  const trimmed = headline.length > maxHeadlineLen ? `${headline.slice(0, maxHeadlineLen - 1).trimEnd()}…` : headline
  return `${trimmed}${BRAND_SUFFIX}`
}

// blog_posts.published_at is a UTC timestamp (e.g. "...+00:00") holding the
// real checkpoint time the read was generated -- reformatted here to a fixed
// +05:30 (IST) offset so machine-readable <time datetime> / Article schema
// dates read naturally for a site with an entirely IST audience, instead of
// exposing the UTC offset or (worse) a date-only "midnight" value.
function toISTISOString(isoUtc: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(new Date(isoUtc))
  const get = (type: string) => parts.find((p) => p.type === type)?.value
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}+05:30`
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const post = await getPost(slug)

  if (!post) {
    return {
      title: 'Post not found — Nifty & Sensex Today | MarketCue',
      description: 'This Nifty and Sensex Today post may have been unpublished.',
    }
  }

  const marketRow = await getMarketRow(post)
  const headline = bareHeadline(post.title)
  const description = purposefulDescription(post, marketRow)
  const url = `${SITE_URL}/nifty-sensex-today/${post.slug}`

  return {
    title: pageTitle(headline),
    description,
    alternates: { canonical: url },
    openGraph: {
      title: headline,
      description,
      url,
      siteName: 'MarketCue',
      type: 'article',
      publishedTime: toISTISOString(post.published_at),
    },
    twitter: {
      card: 'summary_large_image',
      title: headline,
      description,
    },
  }
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const post = await getPost(slug)
  const marketRow = post ? await getMarketRow(post) : null
  const previousPost = post ? await getPreviousPost(post) : null

  const jsonLd = post
    ? {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: bareHeadline(post.title),
        description: purposefulDescription(post, marketRow),
        datePublished: toISTISOString(post.published_at),
        dateModified: toISTISOString(post.published_at),
        author: { '@type': 'Person', name: 'Jishnu', jobTitle: 'Founder, MarketCue', url: `${SITE_URL}/about` },
        publisher: { '@type': 'Organization', name: 'MarketCue', url: SITE_URL },
        mainEntityOfPage: { '@type': 'WebPage', '@id': `${SITE_URL}/nifty-sensex-today/${post.slug}` },
        articleSection: post.phase === 'premarket' ? 'Pre-market' : 'Post-market',
      }
    : null

  const breadcrumbJsonLd = post
    ? {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
          { '@type': 'ListItem', position: 2, name: 'Nifty & Sensex Today', item: `${SITE_URL}/nifty-sensex-today` },
          { '@type': 'ListItem', position: 3, name: bareHeadline(post.title), item: `${SITE_URL}/nifty-sensex-today/${post.slug}` },
        ],
      }
    : null

  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
      {breadcrumbJsonLd && (
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
        />
      )}
      <NiftySensexTodayPostClient
        initialPost={post}
        initialMarketRow={marketRow}
        publishedAtIST={post ? toISTISOString(post.published_at) : null}
        previousPost={previousPost}
        evergreenLink={post ? relatedEvergreenLink(post.phase) : null}
      />
    </>
  )
}
