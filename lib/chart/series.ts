import type { UTCTimestamp } from 'lightweight-charts'
import type { Bar, Candle } from './types'

export const IST_OFFSET_S = 19800
export const SESSION_OPEN_MIN = 9 * 60 + 15

export type Timeframe = '1m' | '3m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d'
export const TIMEFRAMES: { key: Timeframe; minutes: number }[] = [
  { key: '1m', minutes: 1 }, { key: '3m', minutes: 3 }, { key: '5m', minutes: 5 }, { key: '15m', minutes: 15 },
  { key: '30m', minutes: 30 }, { key: '1h', minutes: 60 }, { key: '4h', minutes: 240 }, { key: '1d', minutes: 0 },
]
export const tfMinutes = (tf: Timeframe) => TIMEFRAMES.find((t) => t.key === tf)?.minutes ?? 1

// Buckets are anchored to the 09:15 IST open, not to the clock hour, so a 3m bar runs
// 09:15-09:18, an hourly bar 09:15-10:15 and a 4h bar 09:15-13:15 then 13:15-close. That is how
// every Indian charting terminal cuts intraday bars, and it keeps the first bar of the day whole.
// `minutes === 0` means one bar per session.
export function bucketStart(time: UTCTimestamp, minutes: number): UTCTimestamp {
  const istMinuteOfDay = Math.floor(((time + IST_OFFSET_S) % 86400) / 60)
  const sinceOpen = Math.max(0, istMinuteOfDay - SESSION_OPEN_MIN)
  const offset = minutes === 0 ? sinceOpen : sinceOpen % minutes
  return (time - offset * 60) as UTCTimestamp
}

export function aggregate(bars: Bar[], minutes: number): Bar[] {
  if (minutes === 1) return bars
  const out: Bar[] = []
  for (const b of bars) {
    const start = bucketStart(b.time, minutes)
    const last = out[out.length - 1]
    if (last && last.time === start) {
      last.high = Math.max(last.high, b.high)
      last.low = Math.min(last.low, b.low)
      last.close = b.close
      if (b.volume != null) last.volume = (last.volume ?? 0) + b.volume
    } else {
      out.push({ time: start, open: b.open, high: b.high, low: b.low, close: b.close, ...(b.volume != null ? { volume: b.volume } : {}) })
    }
  }
  return out
}

/** Swing highs and lows: a bar whose high (low) beats every bar within `k` either side. */
export function swings(bars: Bar[], k: number): { highs: number[]; lows: number[] } {
  const highs: number[] = [], lows: number[] = []
  const kk = Math.max(1, Math.min(k, Math.floor((bars.length - 1) / 2)))
  for (let i = kk; i < bars.length - kk; i++) {
    let isHigh = true, isLow = true
    for (let j = i - kk; j <= i + kk; j++) {
      if (j === i) continue
      if (bars[j].high >= bars[i].high) isHigh = false
      if (bars[j].low <= bars[i].low) isLow = false
      if (!isHigh && !isLow) break
    }
    if (isHigh) highs.push(bars[i].high)
    if (isLow) lows.push(bars[i].low)
  }
  return { highs, lows }
}

/** The first candle of each trade date, oldest first. */
export function sessionOpens(candles: Candle[]): { tradeDate: string; time: UTCTimestamp }[] {
  const out: { tradeDate: string; time: UTCTimestamp }[] = []
  let last = ''
  for (const c of candles) {
    if (c.tradeDate !== last) { out.push({ tradeDate: c.tradeDate, time: c.bar.time }); last = c.tradeDate }
  }
  return out
}

/** Latest trade date in the set that is strictly before `tradeDate`, or '' if none. */
export function previousTradeDate(candles: Candle[], tradeDate: string): string {
  let prev = ''
  for (const c of candles) if (c.tradeDate < tradeDate && c.tradeDate > prev) prev = c.tradeDate
  return prev
}
