import type { ReactNode } from 'react'

// Publicly readable and crawlable, same reasoning as app/rules/layout.tsx: this page is linked
// from inside the authenticated Chart screen, but reading it needs no session.
export default function IndicatorsLayout({ children }: { children: ReactNode }) {
  return <>{children}</>
}
