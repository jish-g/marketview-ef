// The chart indicators reference -- one section per shipped indicator in lib/chart/indicators/*.ts,
// shared between /indicators/[slug] (visible pages), the short in-chart blurb
// (components/chart-view.tsx), and the AI-SEO plain-text exports (llms.txt, llms-full.txt).
// Keep this in sync with each indicator's actual compute() logic; it documents what is
// implemented, not an aspiration.
export const INDICATOR_SECTIONS = [
  {
    id: 'intraday',
    title: '1. Intraday — Day Open, Previous Day Levels & VWAP',
    intro:
      "A dotted marker at today's 09:15 IST session open (intraday timeframes only, hidden on 4H and 1D where a day is one or two bars), the previous session's High, Low and Close, and VWAP. Since NIFTY and SENSEX are indices and carry no real traded volume, VWAP is computed from the current-month futures contract instead and labelled \"VWAP · futures\" -- it restarts at 09:15 each session.",
    columns: ['Element', 'Source', 'Notes'],
    rows: [
      ['Day open', "Today's first loaded candle", 'Intraday timeframes only'],
      ['Prev day High / Low / Close', 'Previous session’s candles (or the dashboard row if no prior session is loaded)', 'Amber, dashed for High/Low, dotted for Close'],
      ['VWAP', 'Cumulative volume-weighted typical price of the current-month futures contract', 'Off until at least one futures candle for today exists'],
    ],
  },
  {
    id: 'oiwalls',
    title: '2. OI Walls — Support, Resistance & Max Pain',
    intro:
      "Support and resistance zones from the options chain, and max pain, read from the pre-market dashboard row. Each wall is a strike ± half a strike step, scaled by a configurable band width so the zone can be widened or collapsed to a single line. A wall further than 2% from the last close still draws in full -- it just stops stretching the price axis, showing instead as a small pinned arrow and price at the edge of the pane, so it never costs the candles' readability.",
    columns: ['Instrument', 'Strike step', 'Zone width'],
    rows: [
      ['NIFTY', '50 points', 'Band % × 50, centred on the strike'],
      ['SENSEX', '100 points', 'Band % × 100, centred on the strike'],
    ],
  },
  {
    id: 'levels',
    title: '3. Chart Levels — Swing Support & Resistance',
    intro:
      'For each enabled timeframe, the loaded candles are aggregated to that timeframe and scanned for swing highs and lows -- a bar whose high (or low) beats every bar within a configurable number of bars on either side. The nearest swing above the last price draws as resistance, the nearest below as support, one or two levels per side. Every timeframe is its own independent switch, so any combination -- 1H with 1D, or 4H with 30m -- is available at once.',
    columns: ['Setting', 'Range', 'Default'],
    rows: [
      ['Timeframes', '5m, 15m, 30m, 1H, 4H, 1D', '1H and 1D'],
      ['Swing width', '2–8 bars each side', '4 bars'],
      ['Levels per side', '1 or 2', '1'],
    ],
  },
  {
    id: 'pivots',
    title: '4. Pivots — Pre-Market Support & Resistance',
    intro:
      "The chart's own pivot support and resistance, computed once before the market opens and read directly from the dashboard row -- the same figures the Verdict screen uses. Off by default.",
    columns: ['Element', 'Source'],
    rows: [['Pivot support / resistance', 'Pre-market dashboard row, computed before open']],
  },
  {
    id: 'volume',
    title: '5. Volume — Futures Volume by Bar',
    intro:
      'A lower-pane histogram of volume per bar. NIFTY and SENSEX candles carry no volume of their own -- these bars are the current-month futures contract, aggregated to the chart’s own timeframe and coloured by that bar’s own direction, always labelled as futures volume rather than index volume.',
    columns: ['Element', 'Source', 'Notes'],
    rows: [['Volume bars', 'Current-month futures contract', 'Hidden until a futures candle for today exists']],
  },
  {
    id: 'volumeprofile',
    title: '6. Volume Profile — Point of Control',
    intro:
      "Every other volume view on this chart aggregates by time; this aggregates the same futures volume by price instead. Each 1-minute bar's volume is spread evenly across every price bucket its high-low range touches -- the standard approximation for a volume profile when only open/high/low/close/volume is available, not individual trades. The Point of Control is the bucket that received the most volume: the price the market actually did the most business at, a different read from VWAP (an average) or the day's high/low (extremes).",
    columns: ['Instrument', 'Bucket size', 'Period'],
    rows: [
      ['NIFTY', '25 points', 'Day or week, toggled in settings'],
      ['SENSEX', '50 points', 'Day or week, toggled in settings'],
    ],
  },
  {
    id: 'marketprofile',
    title: '7. Market Profile (TPO) — Value Area & Time-Price Point of Control',
    intro:
      "Volume Profile aggregates today's futures volume by price; this aggregates the session's own bars by price instead, weighting every 30-minute period equally regardless of how much traded in it -- the classic Time Price Opportunity read. The TPO Point of Control is the price the session spent the most time at, not the most business (that's Volume Profile) or the average (that's VWAP). The value area is the tightest band of price levels holding 70% of the session's periods, built outward from the point of control.",
    columns: ['Instrument', 'Bucket size', 'Period length'],
    rows: [
      ['NIFTY', '25 points', '30 minutes'],
      ['SENSEX', '50 points', '30 minutes'],
    ],
  },
  {
    id: 'cvdproxy',
    title: '8. CVD (proxy) — Approximate Order Flow',
    intro:
      "Zerodha's Kite Connect API exposes one-minute candles, not individual trades with a buyer or seller side, so genuine order flow cannot be read directly. This approximates it: for each bar, where the close sits within that bar's own high-low range -- weighted by the bar's futures volume -- estimates whether the bar leaned toward buying or selling pressure. Summed running through the session, it becomes a proxy Cumulative Volume Delta line, sharing the volume pane on its own scale since its cumulative value was never a price. The number itself matters less than its direction relative to price -- a new price high the proxy does not confirm is the signal worth noticing, not the absolute level.",
    columns: ['Element', 'Formula', 'Notes'],
    rows: [
      ['Per-bar delta', '((close − low) − (high − close)) ÷ (high − low) × volume', 'Futures volume; zero when the bar has no range or no volume'],
      ['CVD-proxy line', 'Running sum of the per-bar delta, reset each session at 09:15', 'Shares the volume pane’s own scale'],
    ],
  },
  {
    id: 'fiidii',
    title: '9. FII / DII — Cash Market Net Flow',
    intro:
      "The most recent FII and DII cash-market net flow on record, read from the daily post-market pipeline job. Unlike every other indicator on this chart, it draws nothing -- it's a legend-only line, because it isn't a price level and isn't an intraday signal. It's a slow, end-of-day figure, and the underlying data itself can lag by several days depending on when the upstream source publishes it, which is why the data date is always shown alongside the numbers rather than implying it's today's flow. Read it as regime context -- who's been net buying or selling the cash market lately -- not as something to react to bar by bar.",
    columns: ['Element', 'Source', 'Notes'],
    rows: [
      ['FII / DII net (₹cr)', "market-data-sync's daily post-fii phase, ~8pm IST", 'Cash market (NSE_EQ), not derivatives'],
      ['Data date', 'The date the flow figures actually describe', 'Can lag the pipeline’s own run date by several days'],
    ],
  },
]

// Markdown rendering of the above, used by /llms-full.txt -- mirrors lib/rules-content.ts's
// rulesAsPlainText() so the two AI-SEO exports read consistently.
export function indicatorsAsPlainText(): string {
  const sectionText = INDICATOR_SECTIONS.map((s) => {
    const header = `| ${s.columns.join(' | ')} |`
    const divider = `| ${s.columns.map(() => '---').join(' | ')} |`
    const rows = s.rows.map((r) => `| ${r.join(' | ')} |`).join('\n')
    return `## ${s.title}\n\n${s.intro}\n\n${header}\n${divider}\n${rows}`
  }).join('\n\n')

  return `What each indicator on the MarketCue chart draws and how it's computed. No indicator here reads more into the market than its own note says; see /rules for the separate scoring methodology the pre-market and post-market reads are trained on.\n\n${sectionText}`
}
