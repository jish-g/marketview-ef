// One hue per indicator, chosen so lines that can sit within a few points of each other never
// share a family. Green and red are reserved for OI support and resistance (the same --up/--down
// the candles use, read from the theme at draw time); grey is chart structure such as the day
// open. Everything else takes a slot here. A new indicator takes the next free slot; the
// registry refuses a duplicate so repetition cannot creep back in as the catalogue grows.
export const PALETTE = {
  amber: '#E0B15A',      // previous day High / Low / Close
  violet: '#8B7CF6',     // max pain
  teal: '#2FC4B2',       // chart levels 1H (and the intraday ramp below)
  blue: '#5B8DEF',       // chart levels 1D
  pink: '#EE6FB0',       // CVD proxy
  orange: '#F0883E',     // volume profile point of control
  cyan: '#35C6E8',       // VWAP
  periwinkle: '#9AA8E8', // FII/DII
  olive: '#A9B36B',      // ATR bands (future)
  taupe: '#C4B2A3',      // CPR (future)
  rose: '#D08C9C',       // gap zone (future)
  stone: '#8B8F96',      // structure: day open, volume
  sage: '#8FBF9F',       // market profile TPO
  maroon: '#A6455C',     // power scanner OI events
  denim: '#5D7FA8',      // market pulse
} as const

// Timeframe ramp for chart levels: the intraday frames share the teal family and step darker as
// the frame lengthens; the daily frame takes its own hue so it reads as a different thing.
export const TIMEFRAME_COLORS: Record<string, string> = {
  '5m': '#7FE0D3', '15m': '#5CD3C4', '30m': '#45CBBA', '1H': PALETTE.teal, '4H': '#26A896', '1D': PALETTE.blue,
}
