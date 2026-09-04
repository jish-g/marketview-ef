const SITE_URL = 'https://marketcue.in'

// Pings IndexNow (Bing, and other participating search engines) with the
// URL(s) that just published, so they can crawl sooner than a scheduled
// sitemap re-fetch would allow. Called only from the two daily premarket/
// postmarket publish triggers -- not from any intraday checkpoint -- since
// IndexNow throttles keys that ping too frequently.
export async function indexNow(urls: string[]): Promise<void> {
  const key = process.env.INDEXNOW_KEY
  if (!key || urls.length === 0) return

  try {
    const res = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        host: 'marketcue.in',
        key,
        keyLocation: `${SITE_URL}/${key}.txt`,
        urlList: urls,
      }),
    })
    // IndexNow gives no per-URL feedback -- 200/202 means the batch was
    // accepted, nothing more. Logged so a bad status shows up in function logs.
    console.log(`IndexNow: ${res.status} for ${urls.length} URL(s)`)
  } catch (err) {
    console.log(`IndexNow: request failed — ${String(err)}`)
  }
}
