import { createHmac, randomBytes } from 'crypto'

const TWEET_URL = 'https://api.twitter.com/2/tweets'

function percentEncode(str: string) {
  return encodeURIComponent(str).replace(/[!*'()]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())
}

function buildAuthHeader(method: string, url: string) {
  const apiKey = process.env.TWITTER_API_KEY
  const apiSecret = process.env.TWITTER_API_SECRET
  const accessToken = process.env.TWITTER_ACCESS_TOKEN
  const accessSecret = process.env.TWITTER_ACCESS_SECRET
  if (!apiKey || !apiSecret || !accessToken || !accessSecret) {
    throw new Error('Twitter API credentials not configured')
  }

  const oauthParams: Record<string, string> = {
    oauth_consumer_key: apiKey,
    oauth_nonce: randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: accessToken,
    oauth_version: '1.0',
  }

  // The tweet body is JSON, not application/x-www-form-urlencoded, so per the
  // OAuth 1.0a spec only the oauth_* params are part of the signature base.
  const paramString = Object.keys(oauthParams)
    .sort()
    .map((k) => `${percentEncode(k)}=${percentEncode(oauthParams[k])}`)
    .join('&')

  const signatureBase = [method.toUpperCase(), percentEncode(url), percentEncode(paramString)].join('&')
  const signingKey = `${percentEncode(apiSecret)}&${percentEncode(accessSecret)}`
  const signature = createHmac('sha1', signingKey).update(signatureBase).digest('base64')

  const authParams = { ...oauthParams, oauth_signature: signature }
  return (
    'OAuth ' +
    Object.keys(authParams)
      .sort()
      .map((k) => `${percentEncode(k)}="${percentEncode(authParams[k as keyof typeof authParams])}"`)
      .join(', ')
  )
}

export async function postTweet(text: string) {
  const authHeader = buildAuthHeader('POST', TWEET_URL)
  const res = await fetch(TWEET_URL, {
    method: 'POST',
    headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(`Twitter API error: ${JSON.stringify(body)}`)
  return body
}
