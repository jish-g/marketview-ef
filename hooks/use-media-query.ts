'use client'

import { useEffect, useState } from 'react'

// Starts false on the server and on the first client render so hydration matches, then syncs on mount.
// Callers that need mobile-only behaviour should treat the first paint as desktop.
export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(false)

  useEffect(() => {
    const mql = window.matchMedia(query)
    setMatches(mql.matches)
    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])

  return matches
}

// Matches the breakpoint the stylesheet uses to collapse the sidebar into the burger drawer.
export function useIsMobile() {
  return useMediaQuery('(max-width: 900px)')
}
