'use client'

import { useEffect, useState } from 'react'

/**
 * null until the viewport has actually been queried. On the server and in the first client
 * render there is nothing to measure, and the previous `false` default gave callers no way to
 * tell "desktop" apart from "not known yet" -- so they read it as desktop and acted on it. The
 * dashboard did: its drawer-sync effect ran once with false on a phone, opened the drawer, and
 * corrected itself a frame later, which shipped as a flash of the nav and its backdrop on every
 * mobile load.
 *
 * Callers should hold viewport-dependent behaviour while this is null rather than assuming
 * either side of the breakpoint.
 */
export function useMediaQuery(query: string): boolean | null {
  const [matches, setMatches] = useState<boolean | null>(null)

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
export function useIsMobile(): boolean | null {
  return useMediaQuery('(max-width: 900px)')
}
