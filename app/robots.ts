import type { MetadataRoute } from 'next'

const SITE_URL = 'https://marketcue.in'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: '*', allow: '/', disallow: ['/dashboard', '/login', '/signup', '/auth'] },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
