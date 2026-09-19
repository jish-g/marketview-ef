import type { Drawable, IndicatorDef } from '../types'
import { PALETTE } from '../palette'
import { aggregate } from '../series'
import { fmt } from '@/lib/format'

// Market Profile (TPO): Volume Profile aggregates today's futures volume by price; this
// aggregates the session's own bars by price instead, weighting every period equally regardless
// of how much volume traded in it -- the classic Time Price Opportunity read. Each 30-minute
// period ("TPO letter") counts once against every price bucket its high-low range touches. The
// bucket with the most periods is the TPO point of control -- the price the session spent the
// most TIME at, a different read from Volume Profile's POC (most business) or VWAP (an average).
// The value area is the tightest band of buckets holding 70% of the session's periods, expanded
// outward from the POC one bucket at a time -- the standard value-area construction.
const STEP: Record<string, number> = { NIFTY: 25, SENSEX: 50 }
const PERIOD_MINUTES = 30
const VALUE_AREA_PCT = 0.7

function tpoProfile(periods: { high: number; low: number }[], step: number) {
  const byBucket = new Map<number, number>()
  for (const p of periods) {
    const lo = Math.floor(p.low / step), hi = Math.floor(p.high / step)
    for (let k = lo; k <= hi; k++) byBucket.set(k, (byBucket.get(k) ?? 0) + 1)
  }
  return byBucket
}

function valueArea(byBucket: Map<number, number>, totalPeriods: number) {
  let pocBucket = 0, pocCount = -1
  for (const [bucket, count] of byBucket) if (count > pocCount) { pocCount = count; pocBucket = bucket }
  const target = totalPeriods * VALUE_AREA_PCT
  let lo = pocBucket, hi = pocBucket, covered = pocCount
  while (covered < target) {
    const below = byBucket.get(lo - 1) ?? 0
    const above = byBucket.get(hi + 1) ?? 0
    if (below === 0 && above === 0) break
    if (below >= above) { lo -= 1; covered += below } else { hi += 1; covered += above }
  }
  return { pocBucket, lo, hi }
}

export const marketProfile: IndicatorDef = {
  id: 'marketprofile',
  name: 'Market Profile (TPO)',
  category: 'Structure',
  description: 'Time-based session profile: the price level (and value area) the session spent the most time at',
  color: PALETTE.sage,
  swatch: 'zone',
  defaults: {},
  fields: [],
  compute({ candles, tradeDate, instrument }) {
    const bars = candles.filter((c) => c.tradeDate === tradeDate).map((c) => c.bar)
    if (bars.length === 0) return { drawables: [], summary: 'no bars loaded for today' }
    const periods = aggregate(bars, PERIOD_MINUTES)
    const step = STEP[instrument]
    const byBucket = tpoProfile(periods, step)
    if (byBucket.size === 0) return { drawables: [], summary: '' }
    const { pocBucket, lo, hi } = valueArea(byBucket, periods.length)
    const poc = pocBucket * step + step / 2
    const vah = (hi + 1) * step
    const val = lo * step
    const drawables: Drawable[] = [
      { kind: 'hline', price: poc, color: PALETTE.sage, style: 'dashed', label: 'TPO POC' },
      { kind: 'zone', from: val, to: vah, color: PALETTE.sage, label: 'Value area' },
    ]
    return { drawables, summary: `TPO POC ${fmt.level(poc)} · VA ${fmt.level(val)}–${fmt.level(vah)}` }
  },
}
