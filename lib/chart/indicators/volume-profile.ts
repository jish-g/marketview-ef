import type { Drawable, IndicatorDef } from '../types'
import { PALETTE } from '../palette'
import { fmt } from '@/lib/format'

// Volume Profile / POC: every other volume view on this chart aggregates by time (the Volume
// pane, VWAP); this aggregates the same futures volume by PRICE instead. The Point of Control is
// the price band that saw the most volume -- where the real business happened today, a different
// read from VWAP (an average) or the day's high/low (extremes). Bucketed by strike-ish step size
// since that's the granularity this app already thinks in for levels.
const STEP: Record<string, number> = { NIFTY: 25, SENSEX: 50 }

function weekStartIST(tradeDate: string): string {
  const d = new Date(`${tradeDate}T00:00:00Z`)
  const day = d.getUTCDay()
  d.setUTCDate(d.getUTCDate() + (day === 0 ? -6 : 1) - day)
  return d.toISOString().slice(0, 10)
}

// A 1-min bar's volume is spread evenly across every price bucket its high-low range touches --
// the standard approximation for a volume profile when only OHLCV is available, not tick data.
function pointOfControl(bars: { high: number; low: number; volume?: number }[], step: number): number | null {
  const byBucket = new Map<number, number>()
  for (const b of bars) {
    const vol = b.volume ?? 0
    if (vol <= 0) continue
    const lo = Math.floor(b.low / step), hi = Math.floor(b.high / step)
    const n = hi - lo + 1
    const share = vol / n
    for (let k = lo; k <= hi; k++) byBucket.set(k, (byBucket.get(k) ?? 0) + share)
  }
  if (byBucket.size === 0) return null
  let bestBucket = 0, bestVol = -1
  for (const [bucket, vol] of byBucket) if (vol > bestVol) { bestVol = vol; bestBucket = bucket }
  return bestBucket * step + step / 2
}

export const volumeProfile: IndicatorDef = {
  id: 'volumeprofile',
  name: 'Volume Profile',
  category: 'Volume',
  description: 'Point of control: the price with the most futures volume today or this week',
  color: PALETTE.orange,
  swatch: 'dash',
  defaults: { period: 'day' },
  fields: [
    { type: 'radio', key: 'period', label: 'Period', options: [{ value: 'day', label: 'Day' }, { value: 'week', label: 'Week' }] },
  ],
  compute({ futuresCandles, tradeDate, instrument }, s) {
    const period = s.period === 'week' ? 'week' : 'day'
    const from = period === 'week' ? weekStartIST(tradeDate) : tradeDate
    const bars = futuresCandles.filter((c) => c.tradeDate >= from && c.tradeDate <= tradeDate).map((c) => c.bar)
    const step = STEP[instrument]
    const poc = pointOfControl(bars, step)
    if (poc == null) return { drawables: [], summary: 'no futures volume loaded yet' }
    const drawables: Drawable[] = [{ kind: 'hline', price: poc, color: PALETTE.orange, style: 'dashed', label: period === 'week' ? 'POC · week' : 'POC · day' }]
    return { drawables, summary: `POC ${fmt.level(poc)} · ${period === 'week' ? 'week' : 'day'}` }
  },
}
