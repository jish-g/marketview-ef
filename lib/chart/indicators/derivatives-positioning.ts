import type { IndicatorDef, Instrument, Row } from '../types'
import { PALETTE } from '../palette'
import { fmt } from '@/lib/format'

// Derivatives Positioning: a one-line rollup of three things already read elsewhere on this
// chart -- PCR bias, OI-wall momentum, and max-pain pull -- into a single "how are the options
// positioned right now" read. Zero new data: PCR/max-pain/straddle-delta come from the same
// premarket_dashboard row OI Walls already reads, and OI-wall momentum reuses Power Scanner's
// oiSnapshotHistory (the freshest read of whether OI is building or leaving at the key strikes).
// Draws nothing -- legend-only, same category of signal as Market Pulse.
function read(row: Row, key: string): number | null {
  const v = row[key]
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function pcrLabel(pcr: number): string {
  if (pcr > 1.3) return 'Bullish tilt'
  if (pcr < 0.8) return 'Bearish tilt'
  return 'Neutral'
}

export const derivativesPositioning: IndicatorDef = {
  id: 'derivativespositioning',
  name: 'Derivatives Positioning',
  category: 'Options',
  description: 'One-line rollup: PCR bias, OI-wall momentum, and max-pain pull -- no new data',
  color: PALETTE.clay,
  swatch: 'dot',
  defaults: {},
  fields: [],
  compute({ row, instrument, oiSnapshotHistory, candles, tradeDate }) {
    const suffix: Record<Instrument, string> = { NIFTY: 'nifty', SENSEX: 'sensex' }
    const pcr = read(row, `pcr_${suffix[instrument]}`)
    const maxPain = read(row, `max_pain_${suffix[instrument]}`)
    const parts: string[] = []

    if (pcr != null) parts.push(`PCR ${pcr.toFixed(2)} (${pcrLabel(pcr)})`)

    const latest = oiSnapshotHistory[oiSnapshotHistory.length - 1]
    const wallNotes: string[] = []
    if (latest?.oiResistanceChange === 'Addition') wallNotes.push('resistance building')
    else if (latest?.oiResistanceChange === 'Unwinding') wallNotes.push('resistance easing')
    if (latest?.oiSupportChange === 'Addition') wallNotes.push('support building')
    else if (latest?.oiSupportChange === 'Unwinding') wallNotes.push('support easing')
    if (wallNotes.length) parts.push(wallNotes.join(', '))

    const todayBars = candles.filter((c) => c.tradeDate === tradeDate).map((c) => c.bar)
    const last = todayBars.length ? todayBars[todayBars.length - 1].close : null
    if (maxPain != null && last != null) parts.push(`${fmt.level(maxPain)} max pain (${fmt.pts(last - maxPain)})`)

    return { drawables: [], summary: parts.join(' · ') || 'no derivatives data yet' }
  },
}
