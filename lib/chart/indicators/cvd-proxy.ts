import type { Drawable, IndicatorDef } from '../types'
import { PALETTE } from '../palette'
import { aggregate } from '../series'

// CVD-proxy: an approximation of order-flow buy/sell pressure built from OHLCV alone, since Kite
// never exposes tick-level trades with an aggressor side. Per bar, where the close sits within
// that bar's own high-low range -- weighted by the bar's volume -- estimates whether the bar was
// buyer- or seller-dominated (close near the high on strong volume = buying pressure; near the
// low = selling). Summed running through the session, it becomes a proxy Cumulative Volume Delta.
// Unlike every other level on this chart (OI, POC, swing S/R), which describe what already
// happened, this updates every bar and is the closest thing to a leading signal available without
// tick data -- divergence from price (a new high with the proxy not confirming it) is the useful
// read, not the absolute number. Shares the volume pane's own scale so a cumulative figure never
// has to coexist with the candles on the price axis.
export const cvdProxy: IndicatorDef = {
  id: 'cvdproxy',
  name: 'CVD (proxy)',
  category: 'Volume',
  description: 'Approximate buy/sell pressure from candle shape and futures volume, cumulative for the session',
  color: PALETTE.pink,
  swatch: 'line',
  defaults: {},
  fields: [],
  compute({ futuresCandles, tradeDate, timeframeMinutes }) {
    const today = futuresCandles.filter((c) => c.tradeDate === tradeDate).map((c) => c.bar)
    const bars = aggregate(today, timeframeMinutes)
    if (bars.length === 0) return { drawables: [], summary: 'no futures volume loaded yet' }
    let running = 0
    const points = bars.map((b) => {
      const vol = b.volume ?? 0
      const range = b.high - b.low
      if (vol > 0 && range > 0) running += (((b.close - b.low) - (b.high - b.close)) / range) * vol
      return { time: b.time, value: running }
    })
    const drawables: Drawable[] = [{ kind: 'series', points, color: PALETTE.pink, width: 2, label: 'CVD · proxy', priceScaleId: 'volume' }]
    const summary = `${running >= 0 ? '+' : ''}${(running / 100000).toFixed(2)}L · futures`
    return { drawables, summary }
  },
}
