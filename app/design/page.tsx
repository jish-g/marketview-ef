import type { Metadata } from 'next'
import { SpecimenClient } from './specimen-client'
import './specimen.css'

// Internal reference surface for the design system. Kept out of the index and the sitemap --
// it is for building against, not for readers.
export const metadata: Metadata = {
  title: 'Design system — MarketCue',
  description: 'Reference implementation of the MarketCue design system: tokens, primitives and the composed Verdict screen.',
  robots: { index: false, follow: false },
}

export default function DesignPage() {
  return <SpecimenClient />
}
