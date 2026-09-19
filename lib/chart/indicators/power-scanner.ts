import type { UTCTimestamp } from 'lightweight-charts'
import type { Drawable, IndicatorDef } from '../types'
import { PALETTE } from '../palette'
import { fmt } from '@/lib/format'

// Power Scanner (narrow): flags every time the OI support or resistance strike's
// Addition/Unwinding state changes from oi-snapshot-log's 1-min feed -- the moment fresh OI
// starts building (or unwinding) at the level the chart is already watching. This is the narrow,
// two-key-strikes version: a full-chain OI-event scan across every strike would read
// option_chain_snapshot instead and is a separate, heavier feature.
//
// oi_snapshot_log's Addition/Unwinding is computed against Upstox's own prev_oi (the prior
// session's close OI), not the previous minute's snapshot -- so a genuine status change is a real
// event, not just per-poll noise, and doesn't fire on every tick.
function flipEvents(history: { time: UTCTimestamp; oiSupport: number | null; oiResistance: number | null; oiSupportChange: string | null; oiResistanceChange: string | null }[], colors: { up: string; down: string }): Drawable[] {
  const out: Drawable[] = []
  for (let i = 1; i < history.length; i++) {
    const prev = history[i - 1], cur = history[i]
    if (cur.oiSupportChange && cur.oiSupportChange !== 'Flat' && cur.oiSupportChange !== prev.oiSupportChange) {
      out.push({ kind: 'vline', time: cur.time, color: colors.up, label: `Support ${cur.oiSupportChange}` })
    }
    if (cur.oiResistanceChange && cur.oiResistanceChange !== 'Flat' && cur.oiResistanceChange !== prev.oiResistanceChange) {
      out.push({ kind: 'vline', time: cur.time, color: colors.down, label: `Resistance ${cur.oiResistanceChange}` })
    }
  }
  return out
}

export const powerScanner: IndicatorDef = {
  id: 'powerscanner',
  name: 'Power Scanner',
  category: 'Options',
  description: 'Flags fresh OI Addition/Unwinding at the support and resistance strikes, as it happens',
  color: PALETTE.maroon,
  swatch: 'vline',
  defaults: {},
  fields: [],
  compute({ oiSnapshotHistory, colors }) {
    if (oiSnapshotHistory.length === 0) return { drawables: [], summary: 'no OI history for this session yet' }
    const drawables = flipEvents(oiSnapshotHistory, colors)
    const latest = oiSnapshotHistory[oiSnapshotHistory.length - 1]
    const parts: string[] = []
    if (latest.oiSupport != null) parts.push(`S ${fmt.level(latest.oiSupport)}${latest.oiSupportChange ? ` · ${latest.oiSupportChange}` : ''}`)
    if (latest.oiResistance != null) parts.push(`R ${fmt.level(latest.oiResistance)}${latest.oiResistanceChange ? ` · ${latest.oiResistanceChange}` : ''}`)
    return { drawables, summary: parts.join(' · ') || 'no OI levels yet' }
  },
}
