import type { IndicatorDef } from './types'
import { intraday } from './indicators/intraday'
import { oiWalls } from './indicators/oi-walls'
import { chartLevels } from './indicators/chart-levels'
import { pivots } from './indicators/pivots'
import { volume } from './indicators/volume'
import { volumeProfile } from './indicators/volume-profile'
import { cvdProxy } from './indicators/cvd-proxy'

// The catalogue. Order is the order in the dialog. To add an indicator: one module in
// ./indicators, one line here. Duplicate ids or colours are refused at module load so the
// palette rule cannot erode as the list grows.
export const INDICATORS: IndicatorDef[] = [intraday, oiWalls, chartLevels, pivots, volume, volumeProfile, cvdProxy]

{
  const ids = new Set<string>(), colors = new Set<string>()
  for (const d of INDICATORS) {
    if (ids.has(d.id)) throw new Error(`indicator id "${d.id}" is registered twice`)
    if (colors.has(d.color.toLowerCase())) throw new Error(`indicator "${d.id}" reuses colour ${d.color}; every indicator owns one hue`)
    ids.add(d.id); colors.add(d.color.toLowerCase())
  }
}

export const byId = (id: string) => INDICATORS.find((d) => d.id === id)

// Starter templates: which indicators are on. Settings come from each indicator's defaults
// unless the user has changed them; user-saved templates capture both.
export const STARTER_TEMPLATES: Record<string, string[]> = {
  'Open': ['intraday', 'oiwalls', 'levels', 'volume'],
  'Mid-session': ['oiwalls', 'levels', 'volume'],
  'Expiry': ['intraday', 'oiwalls'],
  'Clean': [],
}
