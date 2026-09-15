import type { UTCTimestamp } from 'lightweight-charts'

export type IndicatorBar = {
  time: UTCTimestamp
  open: number
  high: number
  low: number
  close: number
}

export type IndicatorPoint = {
  time: UTCTimestamp
  value: number
}

/**
 * Calculates an EMA without requiring another market-data source.
 * The seed is the first close, which keeps the indicator stable when a
 * live session grows one candle at a time.
 */
export function ema(bars: IndicatorBar[], period: number): IndicatorPoint[] {
  if (period < 1 || bars.length === 0) return []

  const multiplier = 2 / (period + 1)
  let previous = bars[0].close
  const points: IndicatorPoint[] = [{ time: bars[0].time, value: previous }]

  for (let i = 1; i < bars.length; i += 1) {
    previous = (bars[i].close - previous) * multiplier + previous
    points.push({ time: bars[i].time, value: previous })
  }

  return points
}

/**
 * Opening range from the first N minutes of a session. The caller supplies
 * session bars, so the calculation never crosses into another trading day.
 */
export function openingRange(bars: IndicatorBar[], minutes = 15): { high: number; low: number } | null {
  if (bars.length === 0 || minutes < 1) return null

  const first = bars[0]
  const end = Number(first.time) + minutes * 60
  const opening = bars.filter((bar) => Number(bar.time) < end)
  if (opening.length === 0) return null

  return {
    high: Math.max(...opening.map((bar) => bar.high)),
    low: Math.min(...opening.map((bar) => bar.low)),
  }
}
