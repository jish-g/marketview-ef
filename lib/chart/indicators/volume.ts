import type { HistogramPoint, IndicatorDef } from '../types'
import { aggregate } from '../series'

// Volume: futures volume bars in a lower pane. Nifty and Sensex are indices, so their candles
// carry no volume; these bars are the current-month NIFTY / SENSEX futures contract, which the
// sync writes alongside the index. Always labelled as futures volume, never index volume -- an
// index has none. Bars are aggregated to the chart's own timeframe and coloured by that bar's own
// direction, so they read at a glance against the candles above them.
export const volume: IndicatorDef = {
  id: 'volume',
  name: 'Volume',
  category: 'Volume',
  description: 'NIFTY / SENSEX futures volume per bar, in a lower pane',
  color: '#8B8F96',
  swatch: 'bar',
  defaults: {},
  fields: [],
  compute({ futuresCandles, colors, timeframeMinutes, instrument }) {
    if (futuresCandles.length === 0) return { drawables: [], summary: 'no futures volume loaded yet' }
    const bars = aggregate(futuresCandles.map((c) => c.bar), timeframeMinutes)
    const histogram: HistogramPoint[] = bars
      .filter((b) => b.volume != null)
      .map((b) => ({ time: b.time, value: b.volume as number, color: b.close >= b.open ? colors.up : colors.down }))
    const last = histogram[histogram.length - 1]
    const summary = last ? `${(last.value / 100000).toFixed(2)}L · ${instrument} futures` : 'no futures volume loaded yet'
    return { drawables: [], summary, histogram }
  },
}
