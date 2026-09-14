import type { MetadataRoute } from 'next'

const SITE_URL = 'https://marketcue.in'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      // /dashboard is deliberately NOT disallowed. It carries `robots: noindex` in its layout,
      // and a crawler blocked by robots.txt can never fetch the page to read that directive --
      // which is how a disallowed URL still ends up indexed URL-only when something links to
      // it, and the home page links it prominently. Allowing the crawl is what makes the
      // noindex effective. /auth stays blocked: those are redirect endpoints with no content.
      { userAgent: '*', allow: '/', disallow: ['/login', '/signup', '/auth', '/design'] },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
