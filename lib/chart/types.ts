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
/** `volume` is present only for futures candles; index spot candles carry none. */
export type Bar = { time: UTCTimestamp; open: number; high: number; low: number; close: number; volume?: number }
/** A stored one-minute candle with the IST trade date it belongs to. */
export type Candle = { tradeDate: string; bar: Bar }

export type LineStyle = 'solid' | 'dashed' | 'dotted'

export type Drawable =
  /** Horizontal price line. `label` is the short name shown on the plot; the axis tag shows the price.
   * `alwaysVisible`: exempt from the "within 2% of last close" autoscale limit -- for the handful of
   * levels (OI walls) that are the point of looking at the chart and must never silently scroll off. */
  | { kind: 'hline'; price: number; color: string; style: LineStyle; width?: 1 | 2; label: string; alpha?: number; alwaysVisible?: boolean }
  /** Shaded horizontal band behind the candles, with one axis tag at its centre. */
  | { kind: 'zone'; from: number; to: number; color: string; label: string; alwaysVisible?: boolean }
  /** Vertical marker at a bar time, e.g. the session open. */
  | { kind: 'vline'; time: UTCTimestamp; color: string; label?: string }
  /** A line traced through points on the price axis, e.g. VWAP. Rendered as its own line series. */
  | { kind: 'series'; points: { time: UTCTimestamp; value: number }[]; color: string; width?: 1 | 2; label: string }

export type SettingField =
  | { type: 'toggle'; key: string; label: string; color?: string; unavailable?: string }
  | { type: 'range'; key: string; label: string; min: number; max: number; step: number; unit?: string }
  | { type: 'multi'; key: string; label: string; options: { value: string; label: string; color?: string }[] }
  | { type: 'radio'; key: string; label: string; options: { value: string | number; label: string }[] }

export type Settings = Record<string, unknown>

export type IndicatorContext = {
  candles: Candle[]
  /** One-minute futures candles for the current instrument's current-month contract, with
   * volume. Empty until the sync writes NIFTY_FUT / SENSEX_FUT rows. */
  futuresCandles: Candle[]
  tradeDate: string
  instrument: Instrument
  row: Row
  colors: ChartColors
  /** Minutes per bar on screen; 0 means one bar per session. Lets an indicator adapt its density. */
  timeframeMinutes: number
}

export type HistogramPoint = { time: UTCTimestamp; value: number; color: string }

export type IndicatorResult = {
  drawables: Drawable[]
  /** One-line live values for the legend row, plain text with `·` separators. */
  summary: string
  /** Bars for a lower pane (currently: futures volume). At most one indicator should set this;
   * the host shows a pane only while an active indicator provides one. */
  histogram?: HistogramPoint[]
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
