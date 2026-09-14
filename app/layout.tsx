import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google'
import Script from 'next/script'
import './globals.css'

// Design system type: Plex Sans for everything, Plex Mono for strike prices and option
// symbols only. Exposed as CSS variables so app/tokens/typography.css can build
// --font-sans / --font-mono from them.
const plexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-plex-sans',
  display: 'swap',
})

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-plex-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  metadataBase: new URL('https://marketcue.in'),
  title: 'MarketCue — Trading Dashboard',
  description: 'A read-only premarket dashboard for Indian equity markets.',
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // The app renders dark whatever the OS prefers, so the browser-chrome hints are not
  // keyed on prefers-color-scheme: they would disagree with the page on a light OS.
  colorScheme: 'dark light',
  themeColor: '#151515',
}

const organizationJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'MarketCue',
  url: 'https://marketcue.in',
  logo: 'https://marketcue.in/apple-icon.png',
  description: 'AI-Agentic Option Intelligence Platform for Indian Stock Market.',
  sameAs: ['https://t.me/marketcue_in', 'https://x.com/marketcue_in', 'https://www.linkedin.com/company/marketcue-in'],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${plexSans.variable} ${plexMono.variable}`}>
      <body className="antialiased">
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
        <Script async src="https://www.googletagmanager.com/gtag/js?id=G-45YLMT11SF" strategy="afterInteractive" />
        <Script id="gtag-init" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-45YLMT11SF');
          `}
        </Script>
        <Script id="ms-clarity" strategy="afterInteractive">
          {`
            (function(c,l,a,r,i,t,y){
              c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
              t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
              y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
            })(window, document, "clarity", "script", "y7w6mh9ly2");
          `}
        </Script>
      </body>
    </html>
  )
}
