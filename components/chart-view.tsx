'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import useSWR from 'swr'
import type { IChartApi, IPriceLine, ISeriesApi, UTCTimestamp } from 'lightweight-charts'
import { createClient } from '@/lib/supabase/client'
import { useChartColors } from '@/hooks/use-chart-colors'
import { PhaseAside, Disclaimer, EmptyState, Skeleton } from '@/components/ui/ds'
import { fmt } from '@/lib/format'

type Row = Record<string, string | number | boolean | null>
type Instrument = 'NIFTY' | 'SENSEX'
type Span = 'session' | 'week' | 'month'
type Bar = { time: UTCTimestamp; open: number; high: number; low: number; close: number }

function todayIST() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

// Candle timestamps are true UTC epoch seconds, and lightweight-charts renders a timestamp as
// UTC. Rather than shifting the data by 19800s (the usual trick, which makes every value in the
// table a lie about what it is), the axis and crosshair are formatted through Intl in
// Asia/Kolkata. The numbers stay honest; only the labels are localised.
const IST_TIME = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false })
const IST_DAY = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short' })
const IST_FULL = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })

// Levels the chart may draw. Every one of these is an index price, which is the only kind of
// number that belongs on an index price axis.
//
// The verdict's target and stop are deliberately absent: those are option PREMIUM points
// (conservative x 0.6 and x 0.3 of the expected move, captured on a position), not levels the
// spot is expected to reach. Drawing them here would put a number on the price axis that the
// index has no relationship to.
type LevelKey = 'oi' | 'pivot' | 'maxpain' | 'prev'
const LEVEL_GROUPS: { key: LevelKey; label: string }[] = [
  { key: 'oi', label: 'OI support / resistance' },
  { key: 'pivot', label: 'Pivot support / resistance' },
  { key: 'maxpain', label: 'Max pain' },
  { key: 'prev', label: 'Previous close' },
]

type LevelDef = { group: LevelKey; title: string; value: number; tone: 'up' | 'down' | 'info' | 'muted'; dashed: boolean }

function levelsFor(row: Row, instrument: Instrument): LevelDef[] {
  const suffix = instrument === 'NIFTY' ? 'nifty' : 'sensex'
  const read = (key: string): number | null => {
    const v = row[key]
    if (v === null || v === undefined || v === '') return null
    const n = Number(v)
    return Number.isFinite(n) && n > 0 ? n : null
  }
  const defs: (LevelDef | null)[] = [
    read(`oi_support_${suffix}`) != null ? { group: 'oi', title: 'OI support', value: read(`oi_support_${suffix}`)!, tone: 'up', dashed: false } : null,
    read(`oi_resistance_${suffix}`) != null ? { group: 'oi', title: 'OI resistance', value: read(`oi_resistance_${suffix}`)!, tone: 'down', dashed: false } : null,
    read(`chart_support_${suffix}`) != null ? { group: 'pivot', title: 'Pivot support', value: read(`chart_support_${suffix}`)!, tone: 'up', dashed: true } : null,
    read(`chart_resistance_${suffix}`) != null ? { group: 'pivot', title: 'Pivot resistance', value: read(`chart_resistance_${suffix}`)!, tone: 'down', dashed: true } : null,
    read(`max_pain_${suffix}`) != null ? { group: 'maxpain', title: 'Max pain', value: read(`max_pain_${suffix}`)!, tone: 'info', dashed: true } : null,
    read(`prev_close_${suffix}`) != null ? { group: 'prev', title: 'Prev close', value: read(`prev_close_${suffix}`)!, tone: 'muted', dashed: true } : null,
  ]
  return defs.filter((d): d is LevelDef => d != null)
}

// The chart's own read of the session, in words, so the screen answers a question rather than
// only drawing a picture. Nothing here is asserted that is not in the bars themselves.
function sessionRead(bars: Bar[], levels: LevelDef[]): string | null {
  if (bars.length < 2) return null
  const first = bars[0]
  const last = bars[bars.length - 1]
  const changePct = ((last.close - first.open) / first.open) * 100
  const high = Math.max(...bars.map((b) => b.high))
  const low = Math.min(...bars.map((b) => b.low))
  const flat = Math.abs(changePct) <= 0.05
  const support = levels.find((l) => l.group === 'oi' && l.tone === 'up')
  const resistance = levels.find((l) => l.group === 'oi' && l.tone === 'down')

  // fmt.pct is always signed, so the sign does the work a colour alone must never do (rule 8) --
  // no "Up"/"Down" word in front of it, which would only repeat the glyph.
  const parts: string[] = []
  parts.push(flat
    ? `Flat on the session at ${fmt.level(last.close)}`
    : `${fmt.pct(changePct)} on the session at ${fmt.level(last.close)}`)
  parts.push(`range ${fmt.level(low)}–${fmt.level(high)}`)
  if (resistance && high >= resistance.value) parts.push(`tagged OI resistance at ${fmt.level(resistance.value)}`)
  else if (support && low <= support.value) parts.push(`tagged OI support at ${fmt.level(support.value)}`)
  else if (support && resistance) parts.push('held inside the OI band')
  return `${parts.join(', ')}.`
}

export function ChartView({ row }: { row: Row }) {
  const [instrument, setInstrument] = useState<Instrument>('NIFTY')
  const [span, setSpan] = useState<Span>('session')
  const [hidden, setHidden] = useState<Set<LevelKey>>(() => new Set<LevelKey>(['prev']))
  const [bars, setBars] = useState<Bar[]>([])

  const colors = useChartColors()
  const supabase = useMemo(() => createClient(), [])
  const tradeDate = String(row.trade_date ?? todayIST())
  const isToday = tradeDate === todayIST()
  const levels = useMemo(() => levelsFor(row, instrument), [row, instrument])

  const containerRef = useRef<HTMLDivElement | null>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const priceLinesRef = useRef<IPriceLine[]>([])
  const [chartReady, setChartReady] = useState(false)

  // Each span widens to a calendar window behind the session, not a session count -- trade_date
  // is a date, so "last N sessions" cannot be a LIMIT without a distinct-day subquery. The
  // windows are padded past their nominal trading days so public holidays in the middle do not
  // eat into the count: ~5 sessions in a fortnight, ~30 sessions in ~44 days.
  const fromDate = useMemo(() => {
    if (span === 'session') return tradeDate
    const back = span === 'month' ? 44 : 13
    const d = new Date(`${tradeDate}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() - back)
    return d.toISOString().slice(0, 10)
  }, [span, tradeDate])

  const { data: fetched, error, isLoading } = useSWR<Bar[]>(
    ['index-candles', instrument, fromDate, tradeDate],
    async () => {
      const { data, error: queryError } = await supabase
        .from('index_candles')
        .select('bucket, open, high, low, close')
        .eq('instrument', instrument)
        .gte('trade_date', fromDate)
        .lte('trade_date', tradeDate)
        .order('bucket', { ascending: true })
      if (queryError) throw queryError
      return ((data ?? []) as Row[]).map((c) => ({
        time: Math.floor(new Date(String(c.bucket)).getTime() / 1000) as UTCTimestamp,
        open: Number(c.open), high: Number(c.high), low: Number(c.low), close: Number(c.close),
      }))
    },
    { revalidateOnFocus: false },
  )

  useEffect(() => { setBars(fetched ?? []) }, [fetched])

  // Realtime, not a second poll: index-candle-sync already pulls Kite once a minute, and this
  // pushes the row it writes straight to the open chart. Only for a live session -- a pinned
  // past session cannot gain bars.
  useEffect(() => {
    if (!isToday) return
    const channel = supabase
      .channel(`index-candles-${instrument}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'index_candles', filter: `instrument=eq.${instrument}` }, (payload) => {
        const next = payload.new as Row | null
        if (!next?.bucket) return
        const bar: Bar = {
          time: Math.floor(new Date(String(next.bucket)).getTime() / 1000) as UTCTimestamp,
          open: Number(next.open), high: Number(next.high), low: Number(next.low), close: Number(next.close),
        }
        if (![bar.open, bar.high, bar.low, bar.close].every(Number.isFinite)) return
        setBars((prev) => {
          const at = prev.findIndex((b) => b.time === bar.time)
          if (at === -1) return [...prev, bar].sort((a, b) => a.time - b.time)
          if (prev[at].close === bar.close && prev[at].high === bar.high && prev[at].low === bar.low) return prev
          const copy = prev.slice()
          copy[at] = bar
          return copy
        })
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [supabase, instrument, isToday])

  // Chart creation. lightweight-charts touches document/canvas on construction, so the library
  // is imported inside the effect: it never runs during the server render, and it lands in its
  // own chunk that only the Chart screen pulls.
  useEffect(() => {
    let disposed = false
    let chart: IChartApi | null = null
    let observer: ResizeObserver | null = null

    ;(async () => {
      const { createChart, CandlestickSeries, ColorType, CrosshairMode, LineStyle } = await import('lightweight-charts')
      const el = containerRef.current
      if (disposed || !el) return

      chart = createChart(el, {
        width: el.clientWidth,
        height: el.clientHeight,
        layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: colors.muted, attributionLogo: false },
        grid: { vertLines: { color: colors.rule }, horzLines: { color: colors.rule } },
        crosshair: { mode: CrosshairMode.Normal },
        rightPriceScale: { borderColor: colors.rule },
        timeScale: {
          borderColor: colors.rule,
          timeVisible: true,
          secondsVisible: false,
          // TickMarkType: Year 0, Month 1, DayOfMonth 2, Time 3, TimeWithSeconds 4.
          tickMarkFormatter: (time: number, tickMarkType: number) =>
            tickMarkType <= 2 ? IST_DAY.format(new Date(time * 1000)) : IST_TIME.format(new Date(time * 1000)),
        },
        localization: { timeFormatter: (time: number) => `${IST_FULL.format(new Date(time * 1000))} IST` },
      })

      const series = chart.addSeries(CandlestickSeries, {
        upColor: colors.up, downColor: colors.down,
        borderUpColor: colors.up, borderDownColor: colors.down,
        wickUpColor: colors.up, wickDownColor: colors.down,
        priceLineStyle: LineStyle.Dotted,
      })

      chartRef.current = chart
      seriesRef.current = series
      setChartReady(true)

      observer = new ResizeObserver(([entry]) => {
        if (!entry) return
        chart?.applyOptions({ width: Math.floor(entry.contentRect.width), height: Math.floor(entry.contentRect.height) })
      })
      observer.observe(el)
    })()

    return () => {
      disposed = true
      observer?.disconnect()
      priceLinesRef.current = []
      seriesRef.current = null
      chartRef.current = null
      setChartReady(false)
      chart?.remove()
    }
    // Colours are applied by their own effect below; re-creating the whole chart on a theme
    // flip would throw away the viewer's pan and zoom.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Data.
  useEffect(() => {
    if (!chartReady || !seriesRef.current) return
    seriesRef.current.setData(bars)
  }, [bars, chartReady])

  // Fit the view once per series identity, and only once its bars have actually arrived: the
  // fetch is async, so fitting the moment the instrument changes would fit an empty chart and
  // then leave the real data unfitted. Keyed rather than run on every `bars` change because a
  // refit each minute would yank the axis out from under someone who had zoomed in.
  const fitKeyRef = useRef('')
  useEffect(() => {
    if (!chartReady || !chartRef.current || bars.length === 0) return
    const key = `${instrument}|${span}|${tradeDate}`
    if (fitKeyRef.current === key) return
    fitKeyRef.current = key
    chartRef.current.timeScale().fitContent()
  }, [bars, chartReady, instrument, span, tradeDate])

  // Theme.
  useEffect(() => {
    if (!chartReady || !chartRef.current || !seriesRef.current) return
    chartRef.current.applyOptions({
      layout: { textColor: colors.muted },
      grid: { vertLines: { color: colors.rule }, horzLines: { color: colors.rule } },
      rightPriceScale: { borderColor: colors.rule },
      timeScale: { borderColor: colors.rule },
    })
    seriesRef.current.applyOptions({
      upColor: colors.up, downColor: colors.down,
      borderUpColor: colors.up, borderDownColor: colors.down,
      wickUpColor: colors.up, wickDownColor: colors.down,
    })
  }, [colors, chartReady])

  // Levels.
  useEffect(() => {
    const series = seriesRef.current
    if (!chartReady || !series) return
    for (const line of priceLinesRef.current) series.removePriceLine(line)
    priceLinesRef.current = levels
      .filter((l) => !hidden.has(l.group))
      .map((l) => series.createPriceLine({
        price: l.value,
        color: l.tone === 'up' ? colors.up : l.tone === 'down' ? colors.down : l.tone === 'info' ? colors.info : colors.faint,
        lineWidth: 1,
        lineStyle: l.dashed ? 2 : 0,
        axisLabelVisible: true,
        title: l.title,
      }))
  }, [levels, hidden, colors, chartReady])

  const toggleLevel = useCallback((key: LevelKey) => {
    setHidden((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const read = useMemo(() => sessionRead(bars, levels), [bars, levels])
  const availableGroups = useMemo(() => LEVEL_GROUPS.filter((g) => levels.some((l) => l.group === g.key)), [levels])
  const lastBar = bars.length ? bars[bars.length - 1] : null

  return <section className="phase-view chart-view">
    <div className="review-section-head">
      <div>
        <p className="eyebrow">Price action · {isToday ? 'UPDATES EVERY MINUTE' : `SESSION ${tradeDate}`}</p>
        <h2>Chart</h2>
      </div>
      <PhaseAside capturedAt={lastBar ? new Date(lastBar.time * 1000).toISOString() : null} />
    </div>

    <div className="chart-controls">
      <div className="chart-switch" role="group" aria-label="Instrument">
        {(['NIFTY', 'SENSEX'] as Instrument[]).map((i) => (
          <button key={i} type="button" className={instrument === i ? 'is-active' : ''} aria-pressed={instrument === i} onClick={() => setInstrument(i)}>
            {i === 'NIFTY' ? 'Nifty 50' : 'Sensex'}
          </button>
        ))}
      </div>
      <div className="chart-switch" role="group" aria-label="Range">
        {([['session', 'This session'], ['week', 'Last 5 sessions'], ['month', 'Last 30 sessions']] as [Span, string][]).map(([s, label]) => (
          <button key={s} type="button" className={span === s ? 'is-active' : ''} aria-pressed={span === s} onClick={() => setSpan(s)}>{label}</button>
        ))}
      </div>
      {lastBar && <span className="chart-last">
        <span>Last</span><b>{fmt.level(lastBar.close)}</b>
      </span>}
    </div>

    <div className="chart-frame">
      {/* The canvas is always mounted so the chart is never torn down and rebuilt between
          states; the overlay sits on top of it while there is nothing to draw. */}
      <div className="chart-canvas" ref={containerRef} />
      {(isLoading || error || bars.length === 0) && <div className="chart-overlay">
        {/* A fixed height, not 100%: the overlay centres its child in a grid, where a
            percentage height has no resolved container height to be a percentage of. */}
        {isLoading
          ? <Skeleton width={480} height={180} />
          : error
            ? <EmptyState label="Chart" headline="Candles could not be loaded" reason="The request to Supabase failed. The series is unchanged; reopening this screen retries." />
            : <EmptyState
              label="Chart"
              headline={isToday ? 'No candles recorded for this session yet' : 'No candles on record for this session'}
              reason={isToday
                ? 'Bars are written once a minute from 9:15 AM IST. Before the first one lands — or on a day the Kite login has not run — there is nothing to draw.'
                : 'This session pre-dates the candle history, or the sync did not run that day.'} />}
      </div>}
    </div>

    {availableGroups.length > 0 && <div className="chart-legend">
      <span className="chart-legend-label">Levels</span>
      {availableGroups.map((g) => (
        <button key={g.key} type="button" className={`chart-legend-item ${hidden.has(g.key) ? 'is-off' : ''}`} aria-pressed={!hidden.has(g.key)} onClick={() => toggleLevel(g.key)}>
          <i className={`chart-legend-swatch swatch-${g.key}`} aria-hidden="true" />{g.label}
        </button>
      ))}
    </div>}

    {read && <p className="chart-read">{read}</p>}

    <p className="chart-note">
      One-minute candles for the index spot, from Zerodha Kite Connect. Levels are the same
      figures the Verdict screen reads — option-premium targets are not shown here, because they
      are not index prices.
    </p>

    <Disclaimer source="Zerodha Kite Connect" capturedAt={lastBar ? fmt.timeIST(new Date(lastBar.time * 1000).toISOString()) : null} />
  </section>
}
