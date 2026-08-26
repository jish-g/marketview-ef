import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'MarketCue — Nifty & Sensex market reads, built on rules you can audit'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

// Root-level opengraph-image: Next.js's file convention auto-generates this
// PNG and wires the og:image / twitter:image meta tags for any route that
// doesn't define its own more specific opengraph-image file. Uses the same
// orange/green brand palette as the live site (--primary #e0821f, --brand-green
// #1f8a4c) rather than a generic placeholder.
export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'flex-start',
          backgroundColor: '#f7f7f5',
          padding: '80px',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 14,
              backgroundColor: '#e0821f',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div style={{ width: 28, height: 28, display: 'flex', alignItems: 'flex-end', gap: 4 }}>
              <div style={{ width: 6, height: 12, backgroundColor: '#ffffff', borderRadius: 2 }} />
              <div style={{ width: 6, height: 20, backgroundColor: '#ffffff', borderRadius: 2 }} />
              <div style={{ width: 6, height: 28, backgroundColor: '#ffffff', borderRadius: 2 }} />
            </div>
          </div>
          <div style={{ display: 'flex', fontSize: 40, fontWeight: 700, color: '#1a1a18' }}>MarketCue</div>
        </div>

        <div
          style={{
            display: 'flex',
            marginTop: 56,
            fontSize: 56,
            fontWeight: 600,
            lineHeight: 1.15,
            color: '#1a1a18',
            maxWidth: 920,
          }}
        >
          Everyone gives you data.{' '}
          <span style={{ color: '#1f8a4c' }}>We read it.</span>
        </div>

        <div
          style={{
            display: 'flex',
            marginTop: 28,
            fontSize: 28,
            color: '#5b5851',
            maxWidth: 820,
          }}
        >
          A daily read on Nifty and Sensex, built from a rules engine you can audit.
        </div>
      </div>
    ),
    { ...size }
  )
}
