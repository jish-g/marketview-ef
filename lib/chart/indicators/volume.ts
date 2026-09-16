import type { IndicatorDef } from '../types'
import { PALETTE } from '../palette'

// Volume: futures volume bars in a lower pane. Nifty and Sensex are indices, so their candles
// carry no volume; this turns on when the sync stores current-month futures candles with volume.
// Listed now so the catalogue, templates and colour slot are stable on that day.
export const volume: IndicatorDef = {
  id: 'volume',
  name: 'Volume',
  category: 'Volume',
  description: 'Futures volume per bar in a lower pane, with a 20-bar average',
  color: PALETTE.stone,
  swatch: 'bar',
  defaults: { average: true },
  fields: [{ type: 'toggle', key: 'average', label: '20-bar average' }],
  unavailable: 'Needs NIFTY / SENSEX futures volume in the candle table',
  compute() { return { drawables: [], summary: '' } },
}
