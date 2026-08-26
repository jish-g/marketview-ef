import type { Metadata } from 'next'
import { createClient } from '@supabase/supabase-js'
import NiftySensexTodayPostClient from './detail-client'

// Server-side metadata fetch for this dynamic route. Uses the same publishable
// (anon, read-only) Supabase credentials already used client-side and in
// sitemap.ts -- safe to read here since RLS restricts this key to SELECT only.
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_PREMARKET_SUPABASE_URL || 'https://vkcklvoizfpbnjdgaxai.supabase.co'
const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_PREMARKET_SUPABASE_KEY || 'sb_publishable_-am88LW21cvkYYA_H9vqWA_K42a7bXG'

const SITE_URL = 'https://marketcue.in'

type PostRow = { slug: string; title: string; body: string; phase: 'premarket' | 'postmarket'; trade_date: string }

async function getPost(slug: string): Promise<PostRow | null> {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
    const { data } = await supabase
      .from('blog_posts')
      .select('slug, title, body, phase, trade_date')
      .eq('slug', slug)
      .maybeSingle()
    return (data as PostRow | null) ?? null
  } catch {
    return null
  }
}

function firstSentence(body: string, max = 155): string {
  const text = body.replace(/\s+/g, ' ').trim()
  if (text.length <= max) return text
  return text.slice(0, max - 1).trimEnd() + '…'
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

  const title = `${post.title} | MarketCue`
  const description = firstSentence(post.body)
  const url = `${SITE_URL}/nifty-sensex-today/${post.slug}`

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title: post.title,
      description,
      url,
      siteName: 'MarketCue',
      type: 'article',
      publishedTime: post.trade_date,
    },
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description,
    },
  }
}

export default function Page() {
  return <NiftySensexTodayPostClient />
}
