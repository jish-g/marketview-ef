import type { MetadataRoute } from 'next'
import { createClient } from '@supabase/supabase-js'

// Auto-generated sitemap, served at /sitemap.xml by Next.js's built-in convention
// (this file is picked up automatically -- no route registration needed).
//
// This is a server component, re-run on every request (or at build/ISR time on
// Vercel), so it always reflects whatever is currently in blog_posts -- new
// Nifty & Sensex Today posts appear here automatically the moment the Edge
// Function's blog phase publishes them (9:00 AM / 8:00 PM IST daily). No
// separate "update the sitemap" job is needed: this route IS that job, it just
// runs on read instead of on a schedule.

const SITE_URL = 'https://marketcue.in'

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_PREMARKET_SUPABASE_URL || 'https://vkcklvoizfpbnjdgaxai.supabase.co'
const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_PREMARKET_SUPABASE_KEY || 'sb_publishable_-am88LW21cvkYYA_H9vqWA_K42a7bXG'

type BlogPostRow = { slug: string; phase: 'premarket' | 'postmarket'; published_at: string }

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticEntries: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, changeFrequency: 'daily', priority: 1 },
    { url: `${SITE_URL}/nifty-sensex-today`, changeFrequency: 'daily', priority: 0.9 },
    { url: `${SITE_URL}/rules`, changeFrequency: 'monthly', priority: 0.5 },
  ]

  let postEntries: MetadataRoute.Sitemap = []
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
    const { data } = await supabase
      .from('blog_posts')
      .select('slug, phase, published_at')
      .order('published_at', { ascending: false })
      .limit(1000)

    postEntries = ((data ?? []) as BlogPostRow[]).map((post) => ({
      url: `${SITE_URL}/nifty-sensex-today/${post.slug}`,
      lastModified: new Date(post.published_at),
      changeFrequency: 'never' as const,
      priority: 0.8,
    }))
  } catch {
    // If Supabase is briefly unreachable, still serve the static pages rather
    // than a broken sitemap -- Google will pick up new posts on a later crawl.
  }

  return [...staticEntries, ...postEntries]
}
