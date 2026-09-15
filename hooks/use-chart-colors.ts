'use client'

import { useEffect, useState } from 'react'

// Token colours for anything drawn on a canvas or as SVG attributes. Recharts sets stroke and
// fill as SVG ATTRIBUTES and lightweight-charts paints to a canvas -- `var(--up)` resolves in
// neither, which is why the payoff chart once shipped seven hardcoded hexes that never changed
// with the theme, and why its buy/sell green and red were a second pair sitting inches from
// .leg-badge's --up/--down. The values are read off documentElement instead and re-read when the
// theme class flips, so every chart is painted from the same palette as everything around it.
//
// Lives here rather than in app/dashboard/page.tsx because the Chart screen needs the same
// palette and importing it from a page module would put a second cycle through that file.
const CHART_FALLBACK = { up: '#23b26a', down: '#e35f5f', caution: '#e2b660', info: '#9288d9', muted: '#c3c2b7', faint: '#9b9a8c', rule: '#444441', ink: '#e8e7dd', surface: '#1b1b19' }

export type ChartColors = typeof CHART_FALLBACK

export function useChartColors(): ChartColors {
  const [colors, setColors] = useState(CHART_FALLBACK)
  useEffect(() => {
    const read = () => {
      const style = getComputedStyle(document.documentElement)
      const pick = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback
      setColors({
        up: pick('--up', CHART_FALLBACK.up),
        down: pick('--down', CHART_FALLBACK.down),
        caution: pick('--caution-ink', CHART_FALLBACK.caution),
        info: pick('--info', CHART_FALLBACK.info),
        muted: pick('--muted', CHART_FALLBACK.muted),
        faint: pick('--faint', CHART_FALLBACK.faint),
        rule: pick('--border-strong', CHART_FALLBACK.rule),
        ink: pick('--ink', CHART_FALLBACK.ink),
        surface: pick('--surface', CHART_FALLBACK.surface),
      })
    }
    read()
    const observer = new MutationObserver(read)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])
  return colors
}
