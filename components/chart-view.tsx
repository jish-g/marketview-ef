'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import useSWR from 'swr'
import type { IChartApi, IPriceLine, IPrimitivePaneRenderer, IPrimitivePaneView, ISeriesApi, ISeriesPrimitive, SeriesAttachedParameter, Time, UTCTimestamp } from 'lightweight-charts'
import { createClient } from '@/lib/supabase/client'
import { useChartColors } from '@/hooks/use-chart-colors'
import { PhaseAside, Disclaimer, EmptyState, Skeleton } from '@/components/ui/ds'
import { fmt } from '@/lib/format'

type Row = Record<string, string | number | boolean | null>
type Instrument = 'NIFTY' | 'SENSEX'
type Span = 'session' | 'history'
type Bar = { time: UTCTimestamp; open: number; high: number; low: number; close: number }
// A one-minute candle as stored, with the IST trade date it belongs to. Everything the chart
// draws is derived from these in the browser: the range filter, the timeframe aggregation and
// the previous-session levels all read this one array, so a live one-minute update flows into
// every view without a second query.
type Candle = { tradeDate: string; bar: Bar }

type Timeframe = '1m' | '3m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d'
const TIMEFRAMES: { key: Timeframe; minutes: number }[] = [
  { key: '1m', minutes: 1 }, { key: '3m', minutes: 3 }, { key: '5m', minutes: 5 }, { key: '15m', minutes: 15 },
  { key: '30m', minutes: 30 }, { key: '1h', minutes: 60 }, { key: '4h', minutes: 240 }, { key: '1d', minutes: 0 },
]

const IST_OFFSET_S = 19800
const SESSION_OPEN_MIN = 9 * 60 + 15

function todayIST() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

const IST_TIME = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false })
const IST_DAY = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short' })
const IST_FULL = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })

// Buckets are anchored to the 09:15 IST open, not to the clock hour, so a 3m bar runs
// 09:15-09:18, an hourly bar 09:15-10:15 and a 4h bar 09:15-13:15 then 13:15-close. That is how
// every Indian charting terminal cuts intraday bars, and it keeps the first bar of the day whole.
function bucketStart(time: UTCTimestamp, minutes: number): UTCTimestamp {
  const istMinuteOfDay = Math.floor(((time + IST_OFFSET_S) % 86400) / 60)
  const sinceOpen = Math.max(0, istMinuteOfDay - SESSION_OPEN_MIN)
  const offset = minutes === 0 ? sinceOpen : sinceOpen % minutes
  return (time - offset * 60) as UTCTimestamp
}

function aggregate(bars: Bar[], minutes: number): Bar[] {
  if (minutes === 1) return bars
  const out: Bar[] = []
  for (const b of bars) {
    const start = bucketStart(b.time, minutes)
    const last = out[out.length - 1]
    if (last && last.time === start) {
      last.high = Math.max(last.high, b.high)
      last.low = Math.min(last.low, b.low)
      last.close = b.close
    } else {
      out.push({ time: start, open: b.open, high: b.high, low: b.low, close: b.close })
    }
  }
  return out
}

// The indicator registry. Every overlay the chart can draw is one entry here: the Indicators
// panel lists them, the price-line effect filters on them, and the choice is remembered per
// browser. Adding an indicator is one line here plus whatever computes its levels.
type LevelKey = 'oi' | 'pivot' | 'phlc'
const INDICATORS: { key: LevelKey; label: string; description: string; defaultOn: boolean }[] = [
  { key: 'oi', label: 'OI walls', description: 'OI support and resistance zones, plus max pain, from the option chain', defaultOn: true },
  { key: 'phlc', label: 'PHLC', description: 'Previous day high, low and close', defaultOn: true },
  { key: 'pivot', label: 'Pivots', description: 'Pivot support and resistance', defaultOn: false },
]
const INDICATOR_STORE = 'marketcue.chart.indicators.v1'

function loadHidden(): Set<LevelKey> {
  const fallback = new Set<LevelKey>(INDICATORS.filter((i) => !i.defaultOn).map((i) => i.key))
  try {
    const raw = window.localStorage.getItem(INDICATOR_STORE)
    if (!raw) return fallback
    const off = JSON.parse(raw) as string[]
    const known = new Set(INDICATORS.map((i) => i.key as string))
    return new Set(off.filter((k): k is LevelKey => known.has(k)))
  } catch { return fallback }
}

// A level is a line by default. A level with `band` is a zone: a shaded strip `band` points either
// side of the value, drawn behind the candles. OI walls are zones because option OI sits on a strike
// and price reacts around it, not at one tick.
type LevelDef = { group: LevelKey; title: string; value: number; tone: 'up' | 'down' | 'info' | 'muted'; dashed: boolean; band?: number }

// Strike interval per index. A wall zone spans one interval centred on the strike.
const STRIKE_STEP: Record<Instrument, number> = { NIFTY: 50, SENSEX: 100 }

type Zone = { from: number; to: number; color: string }

// lightweight-charts series primitive that paints horizontal zones across the pane, under the
// series. It reads the series' own price scale, so zones pan and zoom with the candles.
class ZonesPrimitive implements ISeriesPrimitive<Time> {
  private zones: Zone[] = []
  private series: ISeriesApi<'Candlestick'> | null = null
  private requestUpdate: (() => void) | null = null
  private readonly view: IPrimitivePaneView = {
    zOrder: () => 'bottom',
    renderer: (): IPrimitivePaneRenderer => ({
      draw: (target) => {
        const series = this.series
        if (!series || this.zones.length === 0) return
        target.useMediaCoordinateSpace(({ context, mediaSize }) => {
          for (const z of this.zones) {
            const top = series.priceToCoordinate(z.to)
            const bottom = series.priceToCoordinate(z.from)
            if (top == null || bottom == null) continue
            context.save()
            context.globalAlpha = 0.18
            context.fillStyle = z.color
            context.fillRect(0, Math.min(top, bottom), mediaSize.width, Math.max(1, Math.abs(bottom - top)))
            context.restore()
          }
        })
      },
    }),
  }
  attached({ series, requestUpdate }: SeriesAttachedParameter<Time>) {
    this.series = series as ISeriesApi<'Candlestick'>
    this.requestUpdate = requestUpdate
  }
  detached() { this.series = null; this.requestUpdate = null }
  paneViews() { return [this.view] }
  // Widen the price scale so every visible zone is on screen. Without this a wall just beyond
  // the session's range would be silently off the chart, which is the opposite of its purpose.
  autoscaleInfo() {
    if (this.zones.length === 0) return null
    return { priceRange: { minValue: Math.min(...this.zones.map((z) => z.from)), maxValue: Math.max(...this.zones.map((z) => z.to)) } }
  }
  setZones(zones: Zone[]) { this.zones = zones; this.requestUpdate?.() }
}

// Option-chain levels the Verdict screen reads, drawn on the index price axis. The verdict's
// premium target and stop are deliberately absent: they are option-premium points, not prices
// the spot is expected to reach.
function levelsFor(row: Row, instrument: Instrument): LevelDef[] {
  const suffix = instrument === 'NIFTY' ? 'nifty' : 'sensex'
  const read = (key: string): number | null => {
    const v = row[key]
    if (v === null || v === undefined || v === '') return null
    const n = Number(v)
    return Number.isFinite(n) && n > 0 ? n : null
  }
  const defs: (LevelDef | null)[] = [
    read(`oi_support_${suffix}`) != null ? { group: 'oi', title: 'OI support', value: read(`oi_support_${suffix}`)!, tone: 'up', dashed: false, band: STRIKE_STEP[instrument] / 2 } : null,
    read(`oi_resistance_${suffix}`) != null ? { group: 'oi', title: 'OI resistance', value: read(`oi_resistance_${suffix}`)!, tone: 'down', dashed: false, band: STRIKE_STEP[instrument] / 2 } : null,
    read(`max_pain_${suffix}`) != null ? { group: 'oi', title: 'Max pain', value: read(`max_pain_${suffix}`)!, tone: 'info', dashed: true } : null,
    read(`chart_support_${suffix}`) != null ? { group: 'pivot', title: 'Pivot support', value: read(`chart_support_${suffix}`)!, tone: 'up', dashed: true } : null,
    read(`chart_resistance_${suffix}`) != null ? { group: 'pivot', title: 'Pivot resistance', value: read(`chart_resistance_${suffix}`)!, tone: 'down', dashed: true } : null,
  ]
  return defs.filter((d): d is LevelDef => d != null)
}

// Previous session high, low and close, from the candles themselves: the last trade date in the
// loaded set that is earlier than the one on screen. The dashboard row's prev close is the
// fallback for the close alone when no earlier session is loaded.
function phlcFor(candles: Candle[], tradeDate: string, fallbackClose: number | null): LevelDef[] {
  let prevDate = ''
  for (const c of candles) if (c.tradeDate < tradeDate && c.tradeDate > prevDate) prevDate = c.tradeDate
  if (!prevDate) {
    return fallbackClose != null ? [{ group: 'phlc', title: 'PDC', value: fallbackClose, tone: 'muted', dashed: true }] : []
  }
  let high = -Infinity, low = Infinity, close = NaN
  for (const c of candles) {
    if (c.tradeDate !== prevDate) continue
    high = Math.max(high, c.bar.high)
    low = Math.min(low, c.bar.low)
    close = c.bar.close
  }
  if (!Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(close)) return []
  return [
    { group: 'phlc', title: 'PDH', value: high, tone: 'muted', dashed: true },
    { group: 'phlc', title: 'PDL', value: low, tone: 'muted', dashed: true },
    { group: 'phlc', title: 'PDC', value: close, tone: 'muted', dashed: true },
  ]
}

function sessionRead(bars: Bar[], levels: LevelDef[], scope: string): string | null {
  if (bars.length < 2) return null
  const first = bars[0]
  const last = bars[bars.length - 1]
  const high = Math.max(...bars.map((b) => b.high))
  const low = Math.min(...bars.map((b) => b.low))
  const changePct = ((last.close - first.open) / first.open) * 100
  const flat = Math.abs(changePct) <= 0.05
  const support = levels.find((l) => l.group === 'oi' && l.tone === 'up')
  const resistance = levels.find((l) => l.group === 'oi' && l.tone === 'down')
  const parts: string[] = []
  parts.push(flat ? `Flat ${scope} at ${fmt.level(last.close)}` : `${fmt.pct(changePct)} ${scope} at ${fmt.level(last.close)}`)
  parts.push(`range ${fmt.level(low)}–${fmt.level(high)}`)
  if (resistance && high >= resistance.value) parts.push(`tagged OI resistance at ${fmt.level(resistance.value)}`)
  else if (support && low <= support.value) parts.push(`tagged OI support at ${fmt.level(support.value)}`)
  else if (support && resistance) parts.push(`inside the OI band ${fmt.level(support.value)}–${fmt.level(resistance.value)}`)
  return parts.join(' · ') + '.'
}

export function ChartView({ row }: { row: Row }) {
  const [instrument, setInstrument] = useState<Instrument>('NIFTY')
  const [span, setSpan] = useState<Span>('history')
  const [timeframe, setTimeframe] = useState<Timeframe>('5m')
  // Defaults for the server render; the remembered choice is applied after mount so the first
  // client paint matches the HTML and hydration stays clean.
  const [hidden, setHidden] = useState<Set<LevelKey>>(() => new Set<LevelKey>(INDICATORS.filter((i) => !i.defaultOn).map((i) => i.key)))
  useEffect(() => { setHidden(loadHidden()) }, [])
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [candles, setCandles] = useState<Candle[]>([])
  const [fullscreen, setFullscreen] = useState(false)

  const colors = useChartColors()
  const supabase = useMemo(() => createClient(), [])
  const tradeDate = String(row.trade_date ?? todayIST())
  const isToday = tradeDate === todayIST()

  const containerRef = useRef<HTMLDivElement | null>(null)
  const frameRef = useRef<HTMLDivElement | null>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const priceLinesRef = useRef<IPriceLine[]>([])
  const zonesRef = useRef<ZonesPrimitive | null>(null)
  const [chartReady, setChartReady] = useState(false)

  // Always load the 30-session window, whatever range is on screen: the range switch is then a
  // client-side filter (instant), and the previous session is always present for PHLC.
  // 60 calendar days reliably contains 30 trading sessions across holidays.
  const fromDate = useMemo(() => {
    const d = new Date(`${tradeDate}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() - 60)
    return d.toISOString().slice(0, 10)
  }, [tradeDate])

  const { data: fetched, error, isLoading } = useSWR<Candle[]>(
    ['index-candles', instrument, fromDate, tradeDate],
    async () => {
      // PostgREST caps a single response at 1,000 rows and 30 sessions of one-minute bars is
      // ~11,000, so the window is read in pages. One count request first, then every page in
      // parallel, so the whole history lands in about the time of two round trips.
      const PAGE = 1000
      const base = () => supabase
        .from('index_candles')
        .select('bucket, trade_date, open, high, low, close', { count: 'exact' })
        .eq('instrument', instrument)
        .gte('trade_date', fromDate)
        .lte('trade_date', tradeDate)
        .order('bucket', { ascending: true })
      const first = await base().range(0, PAGE - 1)
      if (first.error) throw first.error
      const total = first.count ?? (first.data?.length ?? 0)
      const rest = await Promise.all(
        Array.from({ length: Math.max(0, Math.ceil(total / PAGE) - 1) }, (_, i) => base().range((i + 1) * PAGE, (i + 2) * PAGE - 1)),
      )
      for (const page of rest) if (page.error) throw page.error
      const data = [...(first.data ?? []), ...rest.flatMap((p) => p.data ?? [])]

      const mapped: Candle[] = (data as Row[]).map((c) => ({
        tradeDate: String(c.trade_date ?? ''),
        bar: {
          time: Math.floor(new Date(String(c.bucket)).getTime() / 1000) as UTCTimestamp,
          open: Number(c.open), high: Number(c.high), low: Number(c.low), close: Number(c.close),
        },
      })).filter(({ tradeDate: d, bar }) => d && [bar.open, bar.high, bar.low, bar.close].every(Number.isFinite))

      const dates = Array.from(new Set(mapped.map((c) => c.tradeDate))).sort().slice(-30)
      const keep = new Set(dates)
      return mapped.filter((c) => keep.has(c.tradeDate))
    },
    { revalidateOnFocus: false },
  )

  useEffect(() => { setCandles(fetched ?? []) }, [fetched])

  // Live updates only for the current trading date. index-candle-sync writes one-minute Kite
  // candles into Supabase and Realtime delivers those inserts/updates straight to this chart.
  useEffect(() => {
    if (!isToday) return
    const channel = supabase
      .channel(`index-candles-${instrument}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'index_candles', filter: `instrument=eq.${instrument}` }, (payload) => {
        const next = payload.new as Row | null
        if (!next?.bucket || String(next.trade_date ?? '') !== tradeDate) return
        const bar: Bar = {
          time: Math.floor(new Date(String(next.bucket)).getTime() / 1000) as UTCTimestamp,
          open: Number(next.open), high: Number(next.high), low: Number(next.low), close: Number(next.close),
        }
        if (![bar.open, bar.high, bar.low, bar.close].every(Number.isFinite)) return
        setCandles((prev) => {
          const at = prev.findIndex((c) => c.bar.time === bar.time)
          if (at === -1) return [...prev, { tradeDate, bar }].sort((a, b) => a.bar.time - b.bar.time)
          const cur = prev[at].bar
          if (cur.close === bar.close && cur.high === bar.high && cur.low === bar.low && cur.open === bar.open) return prev
          const copy = prev.slice()
          copy[at] = { tradeDate, bar }
          return copy
        })
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [supabase, instrument, isToday, tradeDate])

  // Derived views. The one-minute array is the only state; everything below is a pure function
  // of it plus the three switches, so a live update re-derives all of them in one render.
  const sessionCandles = useMemo(
    () => (span === 'session' ? candles.filter((c) => c.tradeDate === tradeDate) : candles),
    [candles, span, tradeDate],
  )
  const tfMinutes = TIMEFRAMES.find((t) => t.key === timeframe)?.minutes ?? 1
  const bars = useMemo(() => aggregate(sessionCandles.map((c) => c.bar), tfMinutes), [sessionCandles, tfMinutes])

  const prevCloseFallback = useMemo(() => {
    const v = row[`prev_close_${instrument === 'NIFTY' ? 'nifty' : 'sensex'}`]
    const n = Number(v)
    return v != null && v !== '' && Number.isFinite(n) && n > 0 ? n : null
  }, [row, instrument])
  const levels = useMemo(
    () => [...levelsFor(row, instrument), ...phlcFor(candles, tradeDate, prevCloseFallback)],
    [row, instrument, candles, tradeDate, prevCloseFallback],
  )

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
        grid: { vertLines: { visible: false }, horzLines: { visible: false } },
        crosshair: { mode: CrosshairMode.Normal },
        // Breathing room the way a charting terminal lays it out: the series keeps 12% clear
        // above and below so the outer axis labels are never clipped by the frame, and the last
        // candle sits a few bars in from the price axis instead of touching it.
        rightPriceScale: { borderColor: colors.rule, scaleMargins: { top: 0.12, bottom: 0.12 } },
        timeScale: {
          borderColor: colors.rule,
          rightOffset: 6,
          timeVisible: true,
          secondsVisible: false,
          tickMarkFormatter: (time: number, tickMarkType: number) => tickMarkType <= 2 ? IST_DAY.format(new Date(time * 1000)) : IST_TIME.format(new Date(time * 1000)),
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
      const zones = new ZonesPrimitive()
      series.attachPrimitive(zones)
      zonesRef.current = zones
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
      zonesRef.current = null
      seriesRef.current = null
      chartRef.current = null
      setChartReady(false)
      chart?.remove()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!chartReady || !seriesRef.current) return
    seriesRef.current.setData(bars)
  }, [bars, chartReady])

  // Fit once per view identity, after bars have arrived. Not on every bars change: a refit each
  // minute would yank the axis out from under someone who has zoomed in.
  const fitKeyRef = useRef('')
  useEffect(() => {
    if (!chartReady || !chartRef.current || bars.length === 0) return
    const key = `${instrument}|${span}|${timeframe}|${tradeDate}`
    if (fitKeyRef.current === key) return
    fitKeyRef.current = key
    chartRef.current.timeScale().fitContent()
  }, [bars, chartReady, instrument, span, timeframe, tradeDate])

  useEffect(() => {
    if (!chartReady || !chartRef.current || !seriesRef.current) return
    chartRef.current.applyOptions({
      layout: { textColor: colors.muted },
      rightPriceScale: { borderColor: colors.rule },
      timeScale: { borderColor: colors.rule },
    })
    seriesRef.current.applyOptions({
      upColor: colors.up, downColor: colors.down,
      borderUpColor: colors.up, borderDownColor: colors.down,
      wickUpColor: colors.up, wickDownColor: colors.down,
    })
  }, [colors, chartReady])

  useEffect(() => {
    const series = seriesRef.current
    if (!chartReady || !series) return
    for (const line of priceLinesRef.current) series.removePriceLine(line)
    const visible = levels.filter((l) => !hidden.has(l.group))
    const toneColor = (l: LevelDef) => l.tone === 'up' ? colors.up : l.tone === 'down' ? colors.down : l.tone === 'info' ? colors.info : colors.faint
    zonesRef.current?.setZones(visible.filter((l) => l.band != null).map((l) => ({ from: l.value - l.band!, to: l.value + l.band!, color: toneColor(l) })))
    priceLinesRef.current = visible
      .filter((l) => l.band == null)
      .map((l) => series.createPriceLine({
        price: l.value,
        color: toneColor(l),
        lineWidth: 1,
        lineStyle: l.dashed ? 2 : 0,
        axisLabelVisible: true,
        title: l.title,
      }))
  }, [levels, hidden, colors, chartReady])

  // Fullscreen prefers the browser's own API: the frame element goes fullscreen, the
  // ResizeObserver above resizes the canvas, and Escape exits as everywhere else. Where the API
  // is missing or refused (iPhone Safari, embedded views) the frame is instead pinned over the
  // viewport with CSS, which the same ResizeObserver handles. Escape is wired for that path too.
  useEffect(() => {
    const sync = () => { if (document.fullscreenElement == null) setFullscreen(false) }
    document.addEventListener('fullscreenchange', sync)
    return () => document.removeEventListener('fullscreenchange', sync)
  }, [])
  useEffect(() => {
    if (!fullscreen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.fullscreenElement) setFullscreen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [fullscreen])
  const toggleFullscreen = useCallback(async () => {
    const el = frameRef.current
    if (!el) return
    if (fullscreen) {
      if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined)
      setFullscreen(false)
      return
    }
    setFullscreen(true)
    try { await el.requestFullscreen?.() } catch { /* CSS fallback already applied */ }
  }, [fullscreen])

  const toggleLevel = useCallback((key: LevelKey) => {
    setHidden((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      try { window.localStorage.setItem(INDICATOR_STORE, JSON.stringify(Array.from(next))) } catch { /* private mode */ }
      return next
    })
  }, [])

  useEffect(() => {
    if (!menuOpen) return
    const onDown = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [menuOpen])

  const read = useMemo(() => sessionRead(bars, levels, span === 'session' ? 'on the session' : 'over 30 sessions'), [bars, levels, span])
  const activeCount = useMemo(() => INDICATORS.filter((i) => !hidden.has(i.key) && levels.some((l) => l.group === i.key)).length, [hidden, levels])
  const lastBar = bars.length ? bars[bars.length - 1] : null
  const lastCandleAt = sessionCandles.length ? new Date(sessionCandles[sessionCandles.length - 1].bar.time * 1000).toISOString() : null

  return <section className="phase-view chart-view">
    <div className="review-section-head">
      <div>
        <p className="eyebrow">Price action · {isToday ? 'LIVE FROM KITE' : `HISTORY THROUGH ${tradeDate}`}</p>
        <h2>Chart</h2>
      </div>
      <PhaseAside capturedAt={lastCandleAt} />
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
        {([['history', '30 trading days'], ['session', 'This session']] as [Span, string][]).map(([s, label]) => (
          <button key={s} type="button" className={span === s ? 'is-active' : ''} aria-pressed={span === s} onClick={() => setSpan(s)}>{label}</button>
        ))}
      </div>
      <div className="chart-switch chart-switch-tf" role="group" aria-label="Timeframe">
        {TIMEFRAMES.map((t) => (
          <button key={t.key} type="button" className={timeframe === t.key ? 'is-active' : ''} aria-pressed={timeframe === t.key} onClick={() => setTimeframe(t.key)}>{t.key}</button>
        ))}
      </div>
      <div className="chart-menu" ref={menuRef}>
        <button type="button" className={`chart-menu-button ${menuOpen ? 'is-open' : ''}`} aria-haspopup="dialog" aria-expanded={menuOpen} onClick={() => setMenuOpen((o) => !o)}>
          <span aria-hidden="true">ƒ</span> Indicators{activeCount > 0 && <b>{activeCount}</b>}
        </button>
        {menuOpen && <div className="chart-menu-panel" role="dialog" aria-label="Indicators">
          <p className="chart-menu-title">Indicators</p>
          {INDICATORS.map((ind) => {
            const available = levels.some((l) => l.group === ind.key)
            const on = available && !hidden.has(ind.key)
            return <label key={ind.key} className={`chart-menu-item ${available ? '' : 'is-unavailable'}`}>
              <span className="chart-menu-text">
                <span className="chart-menu-name"><i className={`chart-legend-swatch swatch-${ind.key}`} aria-hidden="true" />{ind.label}</span>
                <small>{available ? ind.description : 'Not available for this session'}</small>
              </span>
              <input type="checkbox" role="switch" className="chart-menu-switch" checked={on} disabled={!available} onChange={() => toggleLevel(ind.key)} />
            </label>
          })}
        </div>}
      </div>
      {lastBar && <span className="chart-last"><span>Last</span><b>{fmt.level(lastBar.close)}</b></span>}
    </div>

    <div className={`chart-frame ${fullscreen ? 'is-fullscreen' : ''}`} ref={frameRef}>
      <div className="chart-canvas" ref={containerRef} />
      <button type="button" className="chart-fullscreen" onClick={toggleFullscreen} aria-pressed={fullscreen} title={fullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen'}>
        {fullscreen ? 'Exit' : 'Fullscreen'}
      </button>
      {fullscreen && <div className="chart-fullscreen-caption">
        <b>{instrument === 'NIFTY' ? 'Nifty 50' : 'Sensex'}</b> · {timeframe} · {span === 'session' ? 'This session' : '30 trading days'}
        {lastBar && <> · Last <b>{fmt.level(lastBar.close)}</b></>}
      </div>}
      {(isLoading || error || bars.length === 0) && <div className="chart-overlay">
        {isLoading
          ? <Skeleton width={480} height={180} />
          : error
            ? <EmptyState label="Chart" headline="Candles could not be loaded" reason="The request to Supabase failed. Reopening this screen retries." />
            : <EmptyState
              label="Chart"
              headline={isToday ? 'No live candles recorded yet' : 'No candles on record'}
              reason={isToday
                ? 'Live one-minute candles appear once the market sync writes the first bar.'
                : 'The selected history is not present in the candle table.'} />}
      </div>}
    </div>

    {read && <p className="chart-read">{read}</p>}

    <p className="chart-note">
      One-minute index spot candles from Zerodha Kite Connect, aggregated in the browser to the
      selected timeframe from the 09:15 IST open. The chart keeps the latest 30 trading sessions and
      receives the current session live through Supabase Realtime. OI walls and pivots are the same
      figures the Verdict screen reads; PHLC is computed from the previous session&apos;s candles.
    </p>

    <Disclaimer source="Zerodha Kite Connect" capturedAt={lastCandleAt ? fmt.timeIST(lastCandleAt) : null} />
  </section>
}
