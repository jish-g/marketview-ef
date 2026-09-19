import type { IndicatorDef } from '../types'
import { PALETTE } from '../palette'
import { aggregate } from '../series'

// Market Pulse: a one-line session-character read, combining two things already computed
// elsewhere on this chart rather than any new data. Draws nothing -- legend-only, same category
// of signal as FII/DII (context, not a level to react to bar by bar).
//
// Regime: a light heuristic, NOT the calibrated session-character classifier from the roadmap's
// Phase 2 (that one is trained against 30+ days of history and decides which playbook applies --
// a bigger, separate project). This is just: how much of today's own high-low range did the net
// move actually cover? A close near the open despite a wide range is a choppy/range day; a close
// near one extreme is a trend day. Labelled as a heuristic, not a validated signal, same honesty
// CVD-proxy already applies to itself.
//
// CVD confirmation: recomputes the same per-bar delta CVD-proxy draws (from futures candles
// already loaded, nothing new fetched) and states whether today's net move and the CVD-proxy's
// running sign agree -- a quick, no-tick-data confluence read one step past just showing the line.
const TREND_RATIO = 0.6

export const marketPulse: IndicatorDef = {
  id: 'marketpulse',
  name: 'Market Pulse',
  category: 'Trend',
  description: 'One-line session read: range-bound or trending (heuristic), and whether CVD-proxy confirms',
  color: PALETTE.denim,
  swatch: 'dot',
  defaults: {},
  fields: [],
  compute({ candles, futuresCandles, tradeDate, timeframeMinutes }) {
    const todayBars = candles.filter((c) => c.tradeDate === tradeDate).map((c) => c.bar)
    if (todayBars.length < 2) return { drawables: [], summary: 'no bars for today yet' }

    const open = todayBars[0].open
    const last = todayBars[todayBars.length - 1].close
    const high = Math.max(...todayBars.map((b) => b.high))
    const low = Math.min(...todayBars.map((b) => b.low))
    const range = high - low
    const net = last - open
    const ratio = range > 0 ? Math.abs(net) / range : 0
    const regime = ratio > TREND_RATIO ? (net >= 0 ? 'Trending up' : 'Trending down') : 'Range-bound'

    const todayFut = futuresCandles.filter((c) => c.tradeDate === tradeDate).map((c) => c.bar)
    const bars = aggregate(todayFut, timeframeMinutes)
    let running = 0
    for (const b of bars) {
      const vol = b.volume ?? 0, r = b.high - b.low
      if (vol > 0 && r > 0) running += (((b.close - b.low) - (b.high - b.close)) / r) * vol
    }
    if (bars.length === 0) return { drawables: [], summary: `${regime} (heuristic) · no CVD data yet` }

    const confirms = (net >= 0 && running >= 0) || (net < 0 && running < 0)
    const cvdLabel = `CVD ${running >= 0 ? '+' : ''}${(running / 100000).toFixed(2)}L`
    return { drawables: [], summary: `${regime} (heuristic) · ${cvdLabel} · ${confirms ? 'confirmed' : 'not confirming'}` }
  },
}
