import type { Drawable, IndicatorDef } from '../types'
import { TIMEFRAME_COLORS } from '../palette'
import { aggregate, swings } from '../series'
import { fmt } from '@/lib/format'

// Chart levels: for each enabled timeframe, aggregate the loaded candles, find swing highs and
// lows, and draw the nearest swing above the last price as resistance and the nearest below as
// support. Each timeframe is its own switch, so "1H with 1D" or "4H with 30m" is two clicks.
// Thirty loaded sessions means the 1D levels are the last month's swings.
const FRAMES: { key: string; minutes: number; width: 1 | 2 }[] = [
  { key: '5m', minutes: 5, width: 1 }, { key: '15m', minutes: 15, width: 1 }, { key: '30m', minutes: 30, width: 1 },
  { key: '1H', minutes: 60, width: 1 }, { key: '4H', minutes: 240, width: 2 }, { key: '1D', minutes: 0, width: 2 },
]

export const chartLevels: IndicatorDef = {
  id: 'levels',
  name: 'Chart levels',
  category: 'Levels',
  description: 'Nearest swing support and resistance per timeframe · 5m 15m 30m 1H 4H 1D',
  color: TIMEFRAME_COLORS['1H'],
  swatch: 'line',
  defaults: { frames: ['1H', '1D'], swing: 4, per: 1 },
  fields: [
    { type: 'multi', key: 'frames', label: 'Timeframes', options: FRAMES.map((f) => ({ value: f.key, label: f.key, color: TIMEFRAME_COLORS[f.key] })) },
    { type: 'range', key: 'swing', label: 'Swing width', min: 2, max: 8, step: 1, unit: 'bars each side' },
    { type: 'radio', key: 'per', label: 'Levels per side', options: [{ value: 1, label: '1' }, { value: 2, label: '2' }] },
  ],
  compute({ candles }, s) {
    const drawables: Drawable[] = []
    const parts: string[] = []
    if (candles.length === 0) return { drawables, summary: '' }
    const bars = candles.map((c) => c.bar)
    const last = bars[bars.length - 1].close
    const frames = Array.isArray(s.frames) ? (s.frames as string[]) : []
    const per = Number(s.per) || 1
    for (const f of FRAMES) {
      if (!frames.includes(f.key)) continue
      const { highs, lows } = swings(aggregate(bars, f.minutes), Number(s.swing) || 4)
      const R = highs.filter((v) => v > last).sort((a, b) => a - b).slice(0, per)
      const S = lows.filter((v) => v < last).sort((a, b) => b - a).slice(0, per)
      const color = TIMEFRAME_COLORS[f.key]
      for (const v of R) drawables.push({ kind: 'hline', price: v, color, style: 'solid', width: f.width, label: `${f.key} R` })
      for (const v of S) drawables.push({ kind: 'hline', price: v, color, style: 'solid', width: f.width, label: `${f.key} S` })
      if (R.length || S.length) parts.push(`${f.key} ${S[0] != null ? fmt.level(S[0]) : '–'} / ${R[0] != null ? fmt.level(R[0]) : '–'}`)
    }
    return { drawables, summary: parts.join(' · ') || 'no swings in range' }
  },
}
