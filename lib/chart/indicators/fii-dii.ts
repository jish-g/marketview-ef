import type { IndicatorDef } from '../types'
import { PALETTE } from '../palette'

// FII/DII: the most recent post-market cash-market net flow on record. This is a slow, daily,
// end-of-day figure (market-data-sync's post-fii phase, ~8pm IST) -- not an intraday signal, and
// the underlying data itself can lag its own trade_date by several days depending on when the
// upstream source publishes it. It draws nothing on the chart; the legend line, with the actual
// data date always shown alongside it, is the point -- a regime-context read ("who's been buying
// the cash market lately"), never something to react to bar by bar.
function fmtCr(v: number | null): string {
  if (v == null) return '–'
  return `${v >= 0 ? '+' : ''}${v.toFixed(0)}cr`
}

function fmtDataDate(d: string | null): string {
  if (!d) return ''
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' }).format(new Date(`${d}T00:00:00Z`))
}

export const fiiDii: IndicatorDef = {
  id: 'fiidii',
  name: 'FII / DII',
  category: 'Trend',
  description: 'Latest post-market FII/DII cash-market net flow -- a daily regime read, not an intraday signal',
  color: PALETTE.periwinkle,
  swatch: 'dot',
  defaults: {},
  fields: [],
  compute({ postmarketSummary }) {
    if (!postmarketSummary || (postmarketSummary.fiiNetCr == null && postmarketSummary.diiNetCr == null)) {
      return { drawables: [], summary: 'no FII/DII data yet' }
    }
    const { fiiNetCr, diiNetCr, dataDate } = postmarketSummary
    const dateLabel = fmtDataDate(dataDate)
    const summary = `FII ${fmtCr(fiiNetCr)} · DII ${fmtCr(diiNetCr)}${dateLabel ? ` · data ${dateLabel}` : ''}`
    return { drawables: [], summary }
  },
}
