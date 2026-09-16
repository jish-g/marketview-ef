import type { Drawable, IndicatorDef } from '../types'
import { PALETTE } from '../palette'
import { fmt } from '@/lib/format'

// Pivots: the pipeline's chart support and resistance from the dashboard row. Existed on the chart
// before the framework; migrated as-is. Off by default.
export const pivots: IndicatorDef = {
  id: 'pivots',
  name: 'Pivots',
  category: 'Levels',
  description: 'Pivot support and resistance from the pre-market read',
  color: PALETTE.taupe,
  swatch: 'dash',
  defaults: { support: true, resistance: true },
  fields: [
    { type: 'toggle', key: 'support', label: 'Pivot support', color: PALETTE.taupe },
    { type: 'toggle', key: 'resistance', label: 'Pivot resistance', color: PALETTE.taupe },
  ],
  compute({ row, instrument }, s) {
    const suffix = instrument === 'NIFTY' ? 'nifty' : 'sensex'
    const num = (k: string) => { const n = Number(row[k]); return Number.isFinite(n) && n > 0 ? n : null }
    const drawables: Drawable[] = []
    const parts: string[] = []
    const sup = num(`chart_support_${suffix}`), res = num(`chart_resistance_${suffix}`)
    if (s.support && sup != null) { drawables.push({ kind: 'hline', price: sup, color: PALETTE.taupe, style: 'dashed', label: 'Pivot S' }); parts.push(`S ${fmt.level(sup)}`) }
    if (s.resistance && res != null) { drawables.push({ kind: 'hline', price: res, color: PALETTE.taupe, style: 'dashed', label: 'Pivot R' }); parts.push(`R ${fmt.level(res)}`) }
    return { drawables, summary: parts.join(' · ') || 'no pivots for this session' }
  },
}
