import type { ReactNode } from 'react'

// Publicly readable and crawlable -- this page is the credibility anchor for
// MarketCue's methodology (see app/rules/page.tsx generateMetadata). It used
// to be wrapped in AuthGuard, which made the client-rendered content return
// null to any request without a session, including search crawlers -- no
// auth is actually required to read the rules, so the guard is removed here
// rather than the page being made a protected doc.
export default function RulesLayout({ children }: { children: ReactNode }) {
  return <>{children}</>
}
