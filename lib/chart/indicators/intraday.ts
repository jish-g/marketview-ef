import type { Drawable, IndicatorDef } from '../types'
import { PALETTE } from '../palette'
import { previousTradeDate, sessionOpens } from '../series'
import { fmt } from '@/lib/format'

// Intraday: the day-open marker, the previous session's High / Low / Close, and VWAP.
// Open, High, Low and Close come from the candles already loaded. VWAP needs volume, which index
// candles do not carry (Nifty and Sensex are indices); it turns on when the sync also stores
// current-month futures candles with volume. Its slot, colour and label are reserved here so
// nothing moves on that day.
export const intraday: IndicatorDef = {
  id: 'intraday',
  name: 'Intraday',
  category: 'Levels',
  description: 'Day open marker · previous day High, Low, Close · VWAP',
  color: PALETTE.amber,
  swatch: 'dash',
  defaults: { open: true, high: true, low: true, close: true, vwap: false },
  fields: [
    { type: 'toggle', key: 'open', label: 'Day open 09:15', color: PALETTE.stone },
    { type: 'toggle', key: 'high', label: 'Prev day High', color: PALETTE.amber },
    { type: 'toggle', key: 'low', label: 'Prev day Low', color: PALETTE.amber },
    { type: 'toggle', key: 'close', label: 'Prev day Close', color: PALETTE.amber },
    { type: 'toggle', key: 'vwap', label: 'VWAP', color: PALETTE.cyan, unavailable: 'Needs futures volume in the candle table' },
  ],
  compute({ candles, tradeDate, row, instrument, timeframeMinutes }, s) {
    const drawables: Drawable[] = []
    const parts: string[] = []

    // A marker at every session start is useful on intraday bars and noise on 4h / 1d, where a
    // day is one or two bars anyway.
    if (s.open && timeframeMinutes > 0 && timeframeMinutes < 240) {
      for (const o of sessionOpens(candles)) drawables.push({ kind: 'vline', time: o.time, color: PALETTE.stone, label: o.tradeDate === tradeDate ? '09:15 open' : undefined })
    }

    const prev = previousTradeDate(candles, tradeDate)
    let high = -Infinity, low = Infinity, close = NaN
    if (prev) {
      for (const c of candles) {
        if (c.tradeDate !== prev) continue
        high = Math.max(high, c.bar.high); low = Math.min(low, c.bar.low); close = c.bar.close
      }
    } else {
      // No earlier session loaded: the dashboard row still knows the previous close.
      const v = Number(row[`prev_close_${instrument === 'NIFTY' ? 'nifty' : 'sensex'}`])
      if (Number.isFinite(v) && v > 0) close = v
    }
    if (s.high && Number.isFinite(high)) { drawables.push({ kind: 'hline', price: high, color: PALETTE.amber, style: 'dashed', label: 'High' }); parts.push(`H ${fmt.level(high)}`) }
    if (s.low && Number.isFinite(low)) { drawables.push({ kind: 'hline', price: low, color: PALETTE.amber, style: 'dashed', label: 'Low' }); parts.push(`L ${fmt.level(low)}`) }
    if (s.close && Number.isFinite(close)) { drawables.push({ kind: 'hline', price: close, color: PALETTE.amber, style: 'dotted', alpha: 0.75, label: 'Close' }); parts.push(`C ${fmt.level(close)}`) }

    return { drawables, summary: parts.join(' · ') || 'no previous session loaded' }
  },
}
