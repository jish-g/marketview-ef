import type { UTCTimestamp } from 'lightweight-charts'
import type { ChartColors } from '@/hooks/use-chart-colors'

// ---------------------------------------------------------------------------------------------
// The indicator framework's vocabulary.
//
// The chart is a host. Each indicator is a module that turns the loaded candles (plus the
// dashboard row and, later, any live table) into a list of DRAWABLES. The host owns the legend,
// the catalogue dialog, per-indicator settings, templates, persistence and rendering. Adding an
// indicator is one file plus one line in the registry; the renderer never changes.
// ---------------------------------------------------------------------------------------------

export type Row = Record<string, string | number | boolean | null>
export type Instrument = 'NIFTY' | 'SENSEX'
export type Bar = { time: UTCTimestamp; open: number; high: number; low: number; close: number }
/** A stored one-minute candle with the IST trade date it belongs to. */
export type Candle = { tradeDate: string; bar: Bar }

export type LineStyle = 'solid' | 'dashed' | 'dotted'

export type Drawable =
  /** Horizontal price line. `label` is the short name shown on the plot; the axis tag shows the price. */
  | { kind: 'hline'; price: number; color: string; style: LineStyle; width?: 1 | 2; label: string; alpha?: number }
  /** Shaded horizontal band behind the candles, with one axis tag at its centre. */
  | { kind: 'zone'; from: number; to: number; color: string; label: string }
  /** Vertical marker at a bar time, e.g. the session open. */
  | { kind: 'vline'; time: UTCTimestamp; color: string; label?: string }

export type SettingField =
  | { type: 'toggle'; key: string; label: string; color?: string; unavailable?: string }
  | { type: 'range'; key: string; label: string; min: number; max: number; step: number; unit?: string }
  | { type: 'multi'; key: string; label: string; options: { value: string; label: string; color?: string }[] }
  | { type: 'radio'; key: string; label: string; options: { value: string | number; label: string }[] }

export type Settings = Record<string, unknown>

export type IndicatorContext = {
  candles: Candle[]
  tradeDate: string
  instrument: Instrument
  row: Row
  colors: ChartColors
  /** Minutes per bar on screen; 0 means one bar per session. Lets an indicator adapt its density. */
  timeframeMinutes: number
}

export type IndicatorResult = {
  drawables: Drawable[]
  /** One-line live values for the legend row, plain text with `·` separators. */
  summary: string
}

export type IndicatorCategory = 'Levels' | 'Options' | 'Trend' | 'Volatility' | 'Volume' | 'Structure'

export type IndicatorDef = {
  id: string
  name: string
  category: IndicatorCategory
  description: string
  /** Legend swatch colour and the hue the indicator owns. One hue per indicator; see palette.ts. */
  color: string
  swatch: 'line' | 'dash' | 'dot' | 'zone' | 'vline' | 'bar'
  defaults: Settings
  fields: SettingField[]
  /** Present when the indicator cannot run yet (missing data source). Listed disabled with this reason. */
  unavailable?: string
  compute: (ctx: IndicatorContext, settings: Settings) => IndicatorResult
}
