import type { Drawable, IndicatorDef } from '../types'
import { PALETTE } from '../palette'
import { previousTradeDate } from '../series'
import { fmt } from '@/lib/format'

// Intraday: the day-open marker, the previous session's High / Low / Close, and VWAP.
// Open, High, Low and Close come from the candles already loaded. VWAP is the cumulative
// volume-weighted typical price of the current-month futures contract, restarting at 09:15 each
// day -- index candles carry no volume (Nifty and Sensex are indices, not traded instruments), so
// this reads the NIFTY_FUT / SENSEX_FUT rows the sync writes alongside the index. It is a futures
// figure and labelled as one; it stays off until at least one futures candle for today exists.
export const intraday: IndicatorDef = {
  id: 'intraday',
  name: 'Intraday',
  category: 'Levels',
  description: 'Day open marker · previous day High, Low, Close · VWAP (futures)',
  color: PALETTE.amber,
  swatch: 'dash',
  defaults: { open: true, high: true, low: true, close: true, vwap: true },
  fields: [
    { type: 'toggle', key: 'open', label: 'Day open 09:15', color: PALETTE.stone },
    { type: 'toggle', key: 'high', label: 'Prev day High', color: PALETTE.amber },
    { type: 'toggle', key: 'low', label: 'Prev day Low', color: PALETTE.amber },
    { type: 'toggle', key: 'close', label: 'Prev day Close', color: PALETTE.amber },
    { type: 'toggle', key: 'vwap', label: 'VWAP · futures', color: PALETTE.cyan },
  ],
  compute({ candles, futuresCandles, tradeDate, row, instrument, timeframeMinutes }, s) {
    const drawables: Drawable[] = []
    const parts: string[] = []

    // Just today's open, not every session's: with 30 sessions loaded a mark on each one is a
    // page of dotted lines, not a landmark. Noise on 4h / 1d too, where a day is one or two bars.
    if (s.open && timeframeMinutes > 0 && timeframeMinutes < 240) {
      const todayOpen = candles.find((c) => c.tradeDate === tradeDate)
      if (todayOpen) drawables.push({ kind: 'vline', time: todayOpen.bar.time, color: PALETTE.stone, label: '09:15 open' })
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

    if (s.vwap) {
      const today = futuresCandles.filter((c) => c.tradeDate === tradeDate).map((c) => c.bar).sort((a, b) => a.time - b.time)
      const points: { time: typeof today[number]['time']; value: number }[] = []
      let cumPV = 0, cumV = 0
      for (const b of today) {
        const vol = b.volume ?? 0
        if (vol <= 0) continue
        cumPV += ((b.high + b.low + b.close) / 3) * vol
        cumV += vol
        if (cumV > 0) points.push({ time: b.time, value: cumPV / cumV })
      }
      if (points.length > 0) {
        drawables.push({ kind: 'series', points, color: PALETTE.cyan, width: 2, label: 'VWAP · fut' })
        parts.push(`VWAP ${fmt.level(points[points.length - 1].value)}`)
      }
    }

    return { drawables, summary: parts.join(' · ') || 'no previous session loaded' }
  },
}
