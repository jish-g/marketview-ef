import type { Drawable, IndicatorDef, Instrument } from '../types'
import { PALETTE } from '../palette'
import { fmt } from '@/lib/format'

// OI walls: the option-chain support and resistance strikes as shaded zones, and max pain as a
// line. Values come from the dashboard row today (refreshed by the market-data job every five
// minutes in session). A three-minute feed from the nearest 20 strikes is a pipeline change; when
// it lands the chart subscribes to that table and the zones move live, same as candles.
//
// A wall is stored as one strike. The zone is centred on it and spans one strike interval by
// default, because OI sits on the strike and price reacts around it, not at one tick.
const STRIKE_STEP: Record<Instrument, number> = { NIFTY: 50, SENSEX: 100 }

function read(row: Record<string, unknown>, key: string): number | null {
  const v = row[key]
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : null
}

export const oiWalls: IndicatorDef = {
  id: 'oiwalls',
  name: 'OI walls',
  category: 'Options',
  description: 'Support and resistance zones from option OI · max pain',
  color: '#2FB77E',
  swatch: 'zone',
  defaults: { support: true, resistance: true, maxpain: true, band: 50 },
  fields: [
    { type: 'toggle', key: 'support', label: 'Support wall', color: '#2FB77E' },
    { type: 'toggle', key: 'resistance', label: 'Resistance wall', color: '#E5533D' },
    { type: 'toggle', key: 'maxpain', label: 'Max pain', color: PALETTE.violet },
    { type: 'range', key: 'band', label: 'Zone width', min: 0, max: 100, step: 25, unit: '% of strike step' },
  ],
  compute({ row, instrument, colors }, s) {
    const suffix = instrument === 'NIFTY' ? 'nifty' : 'sensex'
    const half = (STRIKE_STEP[instrument] * (Number(s.band) / 100)) / 2
    const drawables: Drawable[] = []
    const parts: string[] = []
    const sup = read(row, `oi_support_${suffix}`), res = read(row, `oi_resistance_${suffix}`), mp = read(row, `max_pain_${suffix}`)
    if (s.support && sup != null) {
      drawables.push(half > 0 ? { kind: 'zone', from: sup - half, to: sup + half, color: colors.up, label: 'OI support' } : { kind: 'hline', price: sup, color: colors.up, style: 'solid', label: 'OI support' })
      parts.push(`S ${fmt.level(sup)}`)
    }
    if (s.resistance && res != null) {
      drawables.push(half > 0 ? { kind: 'zone', from: res - half, to: res + half, color: colors.down, label: 'OI resistance' } : { kind: 'hline', price: res, color: colors.down, style: 'solid', label: 'OI resistance' })
      parts.push(`R ${fmt.level(res)}`)
    }
    if (s.maxpain && mp != null) {
      drawables.push({ kind: 'hline', price: mp, color: PALETTE.violet, style: 'dashed', label: 'Max pain' })
      parts.push(`MP ${fmt.level(mp)}`)
    }
    return { drawables, summary: parts.join(' · ') || 'no OI levels for this session' }
  },
}
