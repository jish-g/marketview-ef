'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import useSWR from 'swr'
import type { IChartApi, IPriceLine, IPrimitivePaneRenderer, IPrimitivePaneView, ISeriesApi, ISeriesPrimitive, SeriesAttachedParameter, Time, UTCTimestamp } from 'lightweight-charts'
import { createClient } from '@/lib/supabase/client'
import { useChartColors } from '@/hooks/use-chart-colors'
import { PhaseAside, Disclaimer, EmptyState, Skeleton } from '@/components/ui/ds'
import { fmt } from '@/lib/format'
import type { Bar, Candle, Drawable, Instrument, Row, SettingField, Settings } from '@/lib/chart/types'
import { TIMEFRAMES, type Timeframe, aggregate, tfMinutes } from '@/lib/chart/series'
import { INDICATORS, byId } from '@/lib/chart/registry'
import { type ChartState, defaultState, loadState, saveState } from '@/lib/chart/store'

// ---------------------------------------------------------------------------------------------
// The Chart screen is a HOST. It loads candles, keeps them live, and renders whatever the active
// indicator modules (lib/chart/indicators) ask it to draw. It owns the legend, the catalogue
// dialog, per-indicator settings, templates and persistence. See lib/chart/types.ts.
// ---------------------------------------------------------------------------------------------

function todayIST() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}
const IST_TIME = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false })
const IST_DAY = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short' })
const IST_FULL = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })

// Everything the built-in price-line API cannot draw: shaded zones under the candles, vertical
// markers at bar times, and an autoscale hint so every active level stays on screen.
type Zone = { from: number; to: number; color: string }
type VLine = { time: UTCTimestamp; color: string; label?: string }
class OverlayPrimitive implements ISeriesPrimitive<Time> {
  private zones: Zone[] = []
  private vlines: VLine[] = []
  // Separate from `zones`/drawing: only the prices within the "keep on screen" rule feed the
  // autoscale hint. Every zone and vline is always drawn regardless of this list -- a level that
  // isn't near the last close just doesn't stretch the axis to reach it.
  private autoscalePrices: number[] = []
  private series: ISeriesApi<'Candlestick'> | null = null
  private chart: IChartApi | null = null
  private requestUpdate: (() => void) | null = null
  private readonly view: IPrimitivePaneView = {
    zOrder: () => 'bottom',
    renderer: (): IPrimitivePaneRenderer => ({
      draw: (target) => {
        const series = this.series, chart = this.chart
        if (!series || !chart) return
        target.useMediaCoordinateSpace(({ context, mediaSize }) => {
          for (const z of this.zones) {
            const top = series.priceToCoordinate(z.to), bottom = series.priceToCoordinate(z.from)
            if (top == null || bottom == null) continue
            context.save(); context.globalAlpha = 0.18; context.fillStyle = z.color
            context.fillRect(0, Math.min(top, bottom), mediaSize.width, Math.max(1, Math.abs(bottom - top)))
            context.restore()
          }
          for (const v of this.vlines) {
            const x = chart.timeScale().timeToCoordinate(v.time)
            if (x == null) continue
            context.save(); context.strokeStyle = v.color; context.globalAlpha = 0.8; context.setLineDash([2, 4]); context.lineWidth = 1
            context.beginPath(); context.moveTo(x, 0); context.lineTo(x, mediaSize.height); context.stroke()
            if (v.label) { context.setLineDash([]); context.fillStyle = v.color; context.font = '11px system-ui, sans-serif'; context.textBaseline = 'top'; context.fillText(v.label, x + 6, 6) }
            context.restore()
          }
        })
      },
    }),
  }
  attached({ chart, series, requestUpdate }: SeriesAttachedParameter<Time>) {
    this.chart = chart; this.series = series as ISeriesApi<'Candlestick'>; this.requestUpdate = requestUpdate
  }
  detached() { this.chart = null; this.series = null; this.requestUpdate = null }
  paneViews() { return [this.view] }
  autoscaleInfo() {
    if (this.autoscalePrices.length === 0) return null
    return { priceRange: { minValue: Math.min(...this.autoscalePrices), maxValue: Math.max(...this.autoscalePrices) } }
  }
  set(zones: Zone[], vlines: VLine[], autoscalePrices: number[]) { this.zones = zones; this.vlines = vlines; this.autoscalePrices = autoscalePrices; this.requestUpdate?.() }
}

function sessionRead(bars: Bar[], levels: { support?: number; resistance?: number }): string | null {
  if (bars.length < 2) return null
  const first = bars[0], last = bars[bars.length - 1]
  const high = Math.max(...bars.map((b) => b.high)), low = Math.min(...bars.map((b) => b.low))
  const changePct = ((last.close - first.open) / first.open) * 100
  const parts = [Math.abs(changePct) <= 0.05 ? `Flat on the session at ${fmt.level(last.close)}` : `${fmt.pct(changePct)} on the session at ${fmt.level(last.close)}`, `range ${fmt.level(low)}–${fmt.level(high)}`]
  if (levels.resistance && high >= levels.resistance) parts.push(`tagged OI resistance at ${fmt.level(levels.resistance)}`)
  else if (levels.support && low <= levels.support) parts.push(`tagged OI support at ${fmt.level(levels.support)}`)
  else if (levels.support && levels.resistance) parts.push(`inside the OI band ${fmt.level(levels.support)}–${fmt.level(levels.resistance)}`)
  return parts.join(' · ') + '.'
}

// One PostgREST fetch of a candle set for one instrument name, paginated: a response caps at
// 1,000 rows and 30 sessions of one-minute bars is ~11,000. Shared by the index spot and the
// futures contract, since both live in the same table under different instrument names.
async function fetchCandleSet(supabase: ReturnType<typeof createClient>, instrumentName: string, fromDate: string, tradeDate: string): Promise<Candle[]> {
  const PAGE = 1000
  const base = () => supabase.from('index_candles').select('bucket, trade_date, open, high, low, close, volume', { count: 'exact' })
    .eq('instrument', instrumentName).gte('trade_date', fromDate).lte('trade_date', tradeDate).order('bucket', { ascending: true })
  const first = await base().range(0, PAGE - 1)
  if (first.error) throw first.error
  const total = first.count ?? (first.data?.length ?? 0)
  const rest = await Promise.all(Array.from({ length: Math.max(0, Math.ceil(total / PAGE) - 1) }, (_, i) => base().range((i + 1) * PAGE, (i + 2) * PAGE - 1)))
  for (const page of rest) if (page.error) throw page.error
  const data = [...(first.data ?? []), ...rest.flatMap((p) => p.data ?? [])]
  return (data as Row[]).map((c) => {
    const vol = Number(c.volume)
    return {
      tradeDate: String(c.trade_date ?? ''),
      bar: {
        time: Math.floor(new Date(String(c.bucket)).getTime() / 1000) as UTCTimestamp,
        open: Number(c.open), high: Number(c.high), low: Number(c.low), close: Number(c.close),
        ...(Number.isFinite(vol) && vol > 0 ? { volume: vol } : {}),
      },
    }
  }).filter(({ tradeDate: d, bar }) => d && [bar.open, bar.high, bar.low, bar.close].every(Number.isFinite))
}

export function ChartView({ row, layout = 'embedded', initialInstrument, initialTimeframe }: {
  row: Row
  /** 'embedded' (default): the Chart tab inside the dashboard shell, unchanged. 'full': the
   * standalone chart-only route (app/dashboard/chart) -- a slim nav bar in place of the
   * eyebrow/title/notes/disclaimer, with the chart filling the rest of the viewport. Both share
   * every hook and the whole chart-frame subtree below; only the surrounding chrome differs. */
  layout?: 'embedded' | 'full'
  initialInstrument?: Instrument
  initialTimeframe?: Timeframe
}) {
  const [instrument, setInstrument] = useState<Instrument>(initialInstrument ?? 'NIFTY')
  const [timeframe, setTimeframe] = useState<Timeframe>(initialTimeframe ?? '5m')
  const [candles, setCandles] = useState<Candle[]>([])
  const [futuresCandles, setFuturesCandles] = useState<Candle[]>([])
  const [state, setState] = useState<ChartState>(defaultState)
  const loadedRef = useRef(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [drawerId, setDrawerId] = useState<string | null>(null)
  const [tplOpen, setTplOpen] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)

  const colors = useChartColors()
  const supabase = useMemo(() => createClient(), [])
  const tradeDate = String(row.trade_date ?? todayIST())
  const isToday = tradeDate === todayIST()

  const containerRef = useRef<HTMLDivElement | null>(null)
  const frameRef = useRef<HTMLDivElement | null>(null)
  const tplRef = useRef<HTMLDivElement | null>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const overlayRef = useRef<OverlayPrimitive | null>(null)
  const priceLinesRef = useRef<IPriceLine[]>([])
  const lineSeriesRef = useRef<ISeriesApi<'Line'>[]>([])
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null)
  const [chartReady, setChartReady] = useState(false)

  // Remembered choices are applied after mount so the first client paint matches the HTML.
  useEffect(() => { setState(loadState()); loadedRef.current = true }, [])
  useEffect(() => { if (loadedRef.current) saveState(state) }, [state])
  const update = useCallback((patch: Partial<ChartState> | ((s: ChartState) => Partial<ChartState>)) => {
    setState((s) => ({ ...s, ...(typeof patch === 'function' ? patch(s) : patch) }))
  }, [])

  // Always load the 30-session window: the range on screen is the timeframe plus scrolling, and
  // the previous session is always present for the intraday levels. 60 calendar days reliably
  // contains 30 trading sessions across holidays.
  const fromDate = useMemo(() => { const d = new Date(`${tradeDate}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - 60); return d.toISOString().slice(0, 10) }, [tradeDate])

  const { data: fetched, error, isLoading } = useSWR<Candle[]>(
    ['index-candles', instrument, fromDate, tradeDate],
    async () => {
      const mapped = await fetchCandleSet(supabase, instrument, fromDate, tradeDate)
      const keep = new Set(Array.from(new Set(mapped.map((c) => c.tradeDate))).sort().slice(-30))
      return mapped.filter((c) => keep.has(c.tradeDate))
    },
    { revalidateOnFocus: false },
  )
  useEffect(() => { setCandles(fetched ?? []) }, [fetched])

  // The current-month futures contract for this instrument, with volume. Empty until the sync
  // writes NIFTY_FUT / SENSEX_FUT rows; every indicator that reads it treats an empty array as
  // "not available yet" rather than an error.
  const futuresInstrument = `${instrument}_FUT`
  const { data: fetchedFutures } = useSWR<Candle[]>(
    ['index-candles', futuresInstrument, fromDate, tradeDate],
    () => fetchCandleSet(supabase, futuresInstrument, fromDate, tradeDate),
    { revalidateOnFocus: false },
  )
  useEffect(() => { setFuturesCandles(fetchedFutures ?? []) }, [fetchedFutures])

  // Live updates for the current trading date only. index-candle-sync writes one-minute Kite
  // candles into Supabase and Realtime delivers those inserts and updates straight here.
  useEffect(() => {
    if (!isToday) return
    const applyUpdate = (setter: typeof setCandles) => (payload: { new: Row | null }) => {
      const next = payload.new
      if (!next?.bucket || String(next.trade_date ?? '') !== tradeDate) return
      const vol = Number(next.volume)
      const bar: Bar = {
        time: Math.floor(new Date(String(next.bucket)).getTime() / 1000) as UTCTimestamp,
        open: Number(next.open), high: Number(next.high), low: Number(next.low), close: Number(next.close),
        ...(Number.isFinite(vol) && vol > 0 ? { volume: vol } : {}),
      }
      if (![bar.open, bar.high, bar.low, bar.close].every(Number.isFinite)) return
      setter((prev) => {
        const at = prev.findIndex((c) => c.bar.time === bar.time)
        if (at === -1) return [...prev, { tradeDate, bar }].sort((a, b) => a.bar.time - b.bar.time)
        const cur = prev[at].bar
        if (cur.close === bar.close && cur.high === bar.high && cur.low === bar.low && cur.open === bar.open && cur.volume === bar.volume) return prev
        const copy = prev.slice(); copy[at] = { tradeDate, bar }; return copy
      })
    }
    const channel = supabase.channel(`index-candles-${instrument}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'index_candles', filter: `instrument=eq.${instrument}` }, applyUpdate(setCandles))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'index_candles', filter: `instrument=eq.${futuresInstrument}` }, applyUpdate(setFuturesCandles))
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [supabase, instrument, futuresInstrument, isToday, tradeDate])

  // Derived: the one-minute array is the only data state; everything below is a pure function
  // of it plus the switches, so a live update re-derives all of it in one render.
  const minutes = tfMinutes(timeframe)
  const bars = useMemo(() => aggregate(candles.map((c) => c.bar), minutes), [candles, minutes])
  const todayBars = useMemo(() => aggregate(candles.filter((c) => c.tradeDate === tradeDate).map((c) => c.bar), minutes), [candles, tradeDate, minutes])

  const results = useMemo(() => {
    const ctx = { candles, futuresCandles, tradeDate, instrument, row, colors, timeframeMinutes: minutes }
    const out: Record<string, ReturnType<typeof INDICATORS[number]['compute']>> = {}
    for (const id of state.active) {
      const def = byId(id)
      if (!def || def.unavailable) continue
      try { out[id] = def.compute(ctx, state.settings[id] ?? def.defaults) } catch { out[id] = { drawables: [], summary: 'could not compute' } }
    }
    return out
  }, [candles, futuresCandles, tradeDate, instrument, row, colors, minutes, state.active, state.settings])

  const visibleDrawables = useMemo(() => {
    const hidden = new Set(state.hidden)
    const out: Drawable[] = []
    for (const id of state.active) if (!hidden.has(id) && results[id]) out.push(...results[id].drawables)
    return out
  }, [state.active, state.hidden, results])

  // Lower pane data: the first active, visible indicator that supplies a histogram. Only Volume
  // does today; the pane simply does not appear when nothing supplies one.
  const activeHistogram = useMemo(() => {
    const hidden = new Set(state.hidden)
    for (const id of state.active) {
      if (hidden.has(id)) continue
      const h = results[id]?.histogram
      if (h && h.length > 0) return h
    }
    return null
  }, [state.active, state.hidden, results])

  // Chart creation. lightweight-charts touches document/canvas on construction, so it is imported
  // inside the effect: never during the server render, and in its own chunk.
  useEffect(() => {
    let disposed = false, chart: IChartApi | null = null, observer: ResizeObserver | null = null
    ;(async () => {
      const { createChart, CandlestickSeries, HistogramSeries, ColorType, CrosshairMode, LineStyle } = await import('lightweight-charts')
      const el = containerRef.current
      if (disposed || !el) return
      chart = createChart(el, {
        width: el.clientWidth, height: el.clientHeight,
        layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: colors.muted, attributionLogo: false },
        grid: { vertLines: { visible: false }, horzLines: { visible: false } },
        crosshair: { mode: CrosshairMode.Normal },
        rightPriceScale: { borderColor: colors.rule, scaleMargins: { top: 0.12, bottom: 0.12 } },
        timeScale: {
          borderColor: colors.rule, rightOffset: 6, timeVisible: true, secondsVisible: false,
          tickMarkFormatter: (time: number, tickMarkType: number) => tickMarkType <= 2 ? IST_DAY.format(new Date(time * 1000)) : IST_TIME.format(new Date(time * 1000)),
        },
        localization: { timeFormatter: (time: number) => `${IST_FULL.format(new Date(time * 1000))} IST` },
      })
      const series = chart.addSeries(CandlestickSeries, {
        upColor: colors.up, downColor: colors.down, borderUpColor: colors.up, borderDownColor: colors.down, wickUpColor: colors.up, wickDownColor: colors.down,
        priceLineStyle: LineStyle.Dotted,
      })
      const overlay = new OverlayPrimitive()
      series.attachPrimitive(overlay)
      // Volume lives on its own price scale pinned to the bottom of the same pane -- the usual
      // lightweight-charts technique for a "lower pane" without a second chart. Empty until an
      // indicator supplies a histogram, so it is invisible when nothing needs it.
      const volumeSeries = chart.addSeries(HistogramSeries, { priceScaleId: 'volume', priceFormat: { type: 'volume' }, lastValueVisible: false, priceLineVisible: false })
      chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 }, visible: false })
      chartRef.current = chart; seriesRef.current = series; overlayRef.current = overlay; volumeSeriesRef.current = volumeSeries
      setChartReady(true)
      observer = new ResizeObserver(([entry]) => { if (entry) chart?.applyOptions({ width: Math.floor(entry.contentRect.width), height: Math.floor(entry.contentRect.height) }) })
      observer.observe(el)
    })()
    return () => {
      disposed = true; observer?.disconnect()
      priceLinesRef.current = []; lineSeriesRef.current = []; overlayRef.current = null; volumeSeriesRef.current = null; seriesRef.current = null; chartRef.current = null
      setChartReady(false); chart?.remove()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { if (chartReady && seriesRef.current) seriesRef.current.setData(bars) }, [bars, chartReady])

  // Range: today plus the two sessions before it fitted to the frame on intraday timeframes
  // (scroll left for older sessions, up to 30); the whole window on 1h and longer, where today is
  // only a handful of bars. Three sessions of context is the readable default a terminal opens
  // to -- PDH/PDL and the last couple of days' shape are visible without scrolling, and it is
  // still a deliberate scroll away from the full 30-session history.
  const CONTEXT_SESSIONS = 2
  const showToday = useCallback(() => {
    const chart = chartRef.current
    if (!chart || bars.length === 0) return
    if (minutes > 0 && minutes <= 30) {
      const dates = Array.from(new Set(candles.map((c) => c.tradeDate))).sort()
      const idx = dates.indexOf(tradeDate)
      const cutoff = dates[Math.max(0, (idx === -1 ? dates.length - 1 : idx) - CONTEXT_SESSIONS)]
      const contextBars = aggregate(candles.filter((c) => c.tradeDate >= cutoff).map((c) => c.bar), minutes)
      // Time-based, not logical-index-based: with ~2,000+ bars loaded, setVisibleLogicalRange's
      // index-to-time mapping was observed to desync from the series' actual data (axis ticks and
      // coordinateToTime reported dates days off from what series.data() held at the same index),
      // while the underlying candles were correct all along. Anchoring on the bars' own timestamps
      // sidesteps that mapping entirely.
      const from = contextBars.length ? contextBars[0].time : bars[0].time
      const to = (bars[bars.length - 1].time + minutes * 60 * 6) as UTCTimestamp
      chart.timeScale().setVisibleRange({ from, to })
    } else {
      chart.timeScale().fitContent()
    }
  }, [bars, candles, tradeDate, minutes])

  // The 30-session fetch resolves in stages -- candles state updates one render after the SWR
  // fetch itself completes, and a page of Realtime backfill can still be catching up for a few
  // ticks after that. A one-shot "already fitted this view" guard was locking in whichever of
  // those still-incomplete `bars` snapshots happened to be current on its single run, then never
  // reapplying once the real 30-session data was actually in place -- the chart was left showing
  // a fit computed against data that no longer matched what was on screen. So instead: keep
  // recomputing and reapplying the default range on every relevant data change, and only stop
  // once the user has actually touched the chart (a real pointer/wheel event on the canvas, not
  // our own programmatic calls) -- that is still "never yank the axis from someone who has
  // zoomed", just anchored to a genuine interaction instead of a single best-effort guess.
  const userInteractedRef = useRef(false)
  const viewKeyRef = useRef('')
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const mark = () => { userInteractedRef.current = true }
    el.addEventListener('wheel', mark, { passive: true })
    el.addEventListener('pointerdown', mark)
    return () => { el.removeEventListener('wheel', mark); el.removeEventListener('pointerdown', mark) }
  }, [])
  useEffect(() => {
    if (!chartReady || isLoading || bars.length === 0) return
    const key = `${instrument}|${timeframe}|${tradeDate}`
    if (key !== viewKeyRef.current) { viewKeyRef.current = key; userInteractedRef.current = false }
    if (!userInteractedRef.current) showToday()
  }, [bars, chartReady, isLoading, instrument, timeframe, tradeDate, showToday])

  useEffect(() => {
    if (!chartReady || !chartRef.current || !seriesRef.current) return
    chartRef.current.applyOptions({ layout: { textColor: colors.muted }, rightPriceScale: { borderColor: colors.rule }, timeScale: { borderColor: colors.rule } })
    seriesRef.current.applyOptions({ upColor: colors.up, downColor: colors.down, borderUpColor: colors.up, borderDownColor: colors.down, wickUpColor: colors.up, wickDownColor: colors.down })
  }, [colors, chartReady])

  // Render pass: hlines become price lines (axis tag = price, title = short name on the plot);
  // zones and vlines go to the overlay; `series` drawables (VWAP) become their own line series;
  // every level price feeds the autoscale hint.
  useEffect(() => {
    const series = seriesRef.current, overlay = overlayRef.current, chart = chartRef.current
    if (!chartReady || !series || !overlay || !chart) return
    let cancelled = false
    for (const line of priceLinesRef.current) series.removePriceLine(line)
    for (const ls of lineSeriesRef.current) chart.removeSeries(ls)
    lineSeriesRef.current = []
    const lines: IPriceLine[] = [], zones: Zone[] = [], vlines: VLine[] = [], prices: number[] = [], alwaysVisiblePrices: number[] = [], lineSeries: ISeriesApi<'Line'>[] = []
    ;(async () => {
      const { LineSeries, LineStyle } = await import('lightweight-charts')
      if (cancelled || chart !== chartRef.current) return
      for (const d of visibleDrawables) {
        if (d.kind === 'hline') {
          (d.alwaysVisible ? alwaysVisiblePrices : prices).push(d.price)
          lines.push(series.createPriceLine({ price: d.price, color: d.color, lineWidth: d.width ?? 1, lineStyle: d.style === 'dashed' ? 2 : d.style === 'dotted' ? 1 : 0, axisLabelVisible: true, title: d.label }))
        } else if (d.kind === 'zone') {
          zones.push({ from: d.from, to: d.to, color: d.color })
          ;(d.alwaysVisible ? alwaysVisiblePrices : prices).push(d.from, d.to)
          // A line-less price line gives the zone one axis tag at its centre and its name on the plot.
          lines.push(series.createPriceLine({ price: (d.from + d.to) / 2, color: d.color, lineVisible: false, axisLabelVisible: true, title: d.label }))
        } else if (d.kind === 'vline') {
          vlines.push({ time: d.time, color: d.color, label: d.label })
        } else if (d.kind === 'series') {
          const ls = chart.addSeries(LineSeries, { color: d.color, lineWidth: d.width ?? 2, lineStyle: LineStyle.Solid, priceLineVisible: true, lastValueVisible: false, title: d.label, crosshairMarkerVisible: false })
          ls.setData(d.points)
          lineSeries.push(ls)
          if (d.points.length) prices.push(d.points[d.points.length - 1].value)
        }
      }
      priceLinesRef.current = lines
      lineSeriesRef.current = lineSeries
      // Every zone and vline is always drawn -- OI resistance must show up exactly as reliably as
      // OI support does, whatever the current distance between them and the last close. Autoscale
      // is the only thing that stays selective: a level within 2% of the last close is allowed to
      // widen the visible range, so a month-old daily swing can never squash today's candles by
      // forcing the axis out to reach it -- UNLESS the level is marked `alwaysVisible` (the OI
      // walls), which always gets to stretch the axis: a support/resistance wall is the reason
      // someone opens this chart, and it must never silently scroll off just because price drifted
      // more than 2% away from it.
      const last = bars.length ? bars[bars.length - 1].close : null
      const near = (p: number) => last == null || Math.abs(p - last) / last <= 0.02
      const autoscalePrices = [...prices.filter(near), ...alwaysVisiblePrices]
      overlay.set(zones, vlines, autoscalePrices)
    })()
    return () => { cancelled = true }
  }, [visibleDrawables, chartReady, bars])

  // Lower pane: shown only while an active indicator supplies bars.
  useEffect(() => {
    const chart = chartRef.current, vol = volumeSeriesRef.current
    if (!chartReady || !chart || !vol) return
    if (activeHistogram) {
      vol.setData(activeHistogram.map((h) => ({ time: h.time, value: h.value, color: h.color })))
      chart.priceScale('volume').applyOptions({ visible: true })
    } else {
      vol.setData([])
      chart.priceScale('volume').applyOptions({ visible: false })
    }
  }, [activeHistogram, chartReady])

  // Fullscreen prefers the browser API; a CSS fallback pins the frame where it is refused.
  useEffect(() => {
    const sync = () => { if (document.fullscreenElement == null) setFullscreen(false) }
    document.addEventListener('fullscreenchange', sync)
    return () => document.removeEventListener('fullscreenchange', sync)
  }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (dialogOpen) setDialogOpen(false)
      else if (drawerId) setDrawerId(null)
      else if (tplOpen) setTplOpen(false)
      else if (fullscreen && !document.fullscreenElement) setFullscreen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [dialogOpen, drawerId, tplOpen, fullscreen])
  useEffect(() => {
    if (!tplOpen) return
    const onDown = (e: MouseEvent) => { if (tplRef.current && !tplRef.current.contains(e.target as Node)) setTplOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [tplOpen])
  const toggleFullscreen = useCallback(async () => {
    const el = frameRef.current
    if (!el) return
    if (fullscreen) { if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined); setFullscreen(false); return }
    setFullscreen(true)
    try { await el.requestFullscreen?.() } catch { /* CSS fallback already applied */ }
  }, [fullscreen])

  // ---- actions ----
  const addIndicator = (id: string) => update((s) => ({ active: s.active.includes(id) ? s.active.filter((x) => x !== id) : [...s.active, id], hidden: s.hidden.filter((x) => x !== id) }))
  const removeIndicator = (id: string) => { update((s) => ({ active: s.active.filter((x) => x !== id), hidden: s.hidden.filter((x) => x !== id) })); if (drawerId === id) setDrawerId(null) }
  const toggleHidden = (id: string) => update((s) => ({ hidden: s.hidden.includes(id) ? s.hidden.filter((x) => x !== id) : [...s.hidden, id] }))
  const setSetting = (id: string, key: string, value: unknown) => update((s) => ({ settings: { ...s.settings, [id]: { ...(s.settings[id] ?? {}), [key]: value } } }))
  const resetSettings = (id: string) => { const def = byId(id); if (def) update((s) => ({ settings: { ...s.settings, [id]: { ...def.defaults } } })) }
  const applyTemplate = (name: string) => update((s) => {
    const t = s.templates[name]; if (!t) return {}
    const settings = { ...s.settings }
    for (const [id, st] of Object.entries(t.settings ?? {})) settings[id] = { ...(byId(id)?.defaults ?? {}), ...st }
    return { template: name, active: [...t.ids], hidden: [], settings }
  })
  const saveTemplate = () => {
    const name = window.prompt('Template name', state.template === 'Open' ? 'My setup' : state.template)?.trim()
    if (!name) return
    update((s) => ({ template: name, templates: { ...s.templates, [name]: { ids: [...s.active], settings: Object.fromEntries(s.active.map((id) => [id, s.settings[id]])) } } }))
  }

  const lastBar = bars.length ? bars[bars.length - 1] : null
  const lastCandleAt = candles.length ? new Date(candles[candles.length - 1].bar.time * 1000).toISOString() : null
  const oi = useMemo(() => {
    const suffix = instrument === 'NIFTY' ? 'nifty' : 'sensex'
    const n = (k: string) => { const v = Number(row[k]); return Number.isFinite(v) && v > 0 ? v : undefined }
    return { support: n(`oi_support_${suffix}`), resistance: n(`oi_resistance_${suffix}`) }
  }, [row, instrument])
  const read = useMemo(() => sessionRead(todayBars, oi), [todayBars, oi])
  const catalogue = useMemo(() => { const q = query.trim().toLowerCase(); return INDICATORS.filter((d) => !q || `${d.name} ${d.description} ${d.category}`.toLowerCase().includes(q)) }, [query])
  const drawerDef = drawerId ? byId(drawerId) : undefined

  // Shared between both layouts: the instrument/timeframe/indicators/template controls, and the
  // whole chart-frame subtree (canvas, legend, corner buttons, drawer, loading/empty overlay).
  // Only the chrome around them differs by `layout`.
  const instrumentSwitch = <div className="chart-switch" role="group" aria-label="Instrument">
    {(['NIFTY', 'SENSEX'] as Instrument[]).map((i) => (
      <button key={i} type="button" className={instrument === i ? 'is-active' : ''} aria-pressed={instrument === i} onClick={() => setInstrument(i)}>{i === 'NIFTY' ? 'Nifty 50' : 'Sensex'}</button>
    ))}
  </div>
  const timeframeSwitch = <div className="chart-switch chart-switch-tf" role="group" aria-label="Timeframe">
    {TIMEFRAMES.map((t) => (
      <button key={t.key} type="button" className={timeframe === t.key ? 'is-active' : ''} aria-pressed={timeframe === t.key} onClick={() => setTimeframe(t.key)}>{t.key}</button>
    ))}
  </div>
  const indicatorsButton = <button type="button" className="chart-menu-button" aria-haspopup="dialog" aria-expanded={dialogOpen} onClick={() => setDialogOpen(true)}>
    <span aria-hidden="true">ƒ</span> Indicators{state.active.length > 0 && <b>{state.active.length}</b>}
  </button>
  const templateMenu = <div className="chart-menu" ref={tplRef}>
    <button type="button" className={`chart-menu-button ${tplOpen ? 'is-open' : ''}`} aria-haspopup="menu" aria-expanded={tplOpen} onClick={() => setTplOpen((o) => !o)}>
      Template <em>{state.template}</em> ▾
    </button>
    {tplOpen && <div className="chart-menu-panel chart-tpl-panel" role="menu">
      {Object.entries(state.templates).map(([name, t]) => (
        <button key={name} type="button" role="menuitemradio" aria-checked={state.template === name} className="chart-tpl-item" onClick={() => { applyTemplate(name); setTplOpen(false) }}>
          <span>{state.template === name ? '●' : '○'} {name}</span><small>{t.ids.length} on</small>
        </button>
      ))}
      <hr />
      <button type="button" role="menuitem" className="chart-tpl-item" onClick={() => { saveTemplate(); setTplOpen(false) }}><span>Save current as…</span></button>
    </div>}
  </div>
  const lastPriceChip = lastBar && <span className="chart-last"><span>Last</span><b>{fmt.level(lastBar.close)}</b></span>

  // The standalone chart tab opens from here; it needs its own URL rather than the dashboard's,
  // since that reopens whatever phase the dashboard happens to be on, not the chart.
  const openFullPage = () => {
    const url = new URL('/dashboard/chart', window.location.origin)
    url.searchParams.set('instrument', instrument)
    url.searchParams.set('tf', timeframe)
    window.open(url.toString(), '_blank', 'noopener')
  }

  const frameBlock = <div className={`chart-frame ${fullscreen ? 'is-fullscreen' : ''} ${layout === 'full' ? 'is-fullpage' : ''}`} ref={frameRef}>
    <div className="chart-canvas" ref={containerRef} />

    <div className={`chart-legend-stack ${state.legendCollapsed ? 'is-collapsed' : ''}`}>
      <div className="chart-legend-head">
        <span>Legend · {state.active.length}</span>
        <button type="button" onClick={() => update({ legendCollapsed: !state.legendCollapsed })} title={state.legendCollapsed ? 'Show legend' : 'Hide legend'} aria-expanded={!state.legendCollapsed}>{state.legendCollapsed ? '▸' : '▾'}</button>
      </div>
      {!state.legendCollapsed && state.active.map((id) => {
        const def = byId(id); if (!def) return null
        const off = state.hidden.includes(id)
        return <div key={id} className={`chart-legend-row ${off ? 'is-off' : ''}`} tabIndex={0}>
          <i className={`chart-legend-swatch swatch-${def.swatch}`} style={{ color: def.color, background: def.swatch === 'zone' || def.swatch === 'bar' ? def.color : undefined }} aria-hidden="true" />
          <span className="chart-legend-name">{def.name}</span>
          <span className="chart-legend-vals">{def.unavailable ? def.unavailable : results[id]?.summary ?? ''}</span>
          <span className="chart-legend-acts">
            <button type="button" onClick={() => toggleHidden(id)} title={off ? 'Show' : 'Hide'} aria-pressed={!off}>{off ? '◌' : '◉'}</button>
            <button type="button" onClick={() => setDrawerId(id)} title="Settings">⚙</button>
            <button type="button" onClick={() => removeIndicator(id)} title="Remove">×</button>
          </span>
        </div>
      })}
    </div>

    <div className="chart-corner">
      <button type="button" onClick={showToday} title="Back to today">⟲ Today</button>
      {layout === 'embedded' && !fullscreen && (
        <button type="button" onClick={openFullPage} title="Open chart in a new tab" aria-label="Open chart in a new tab">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
          </svg>
        </button>
      )}
      <button type="button" className="chart-fullscreen" onClick={toggleFullscreen} aria-pressed={fullscreen} title={fullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen'}>{fullscreen ? 'Exit' : 'Fullscreen'}</button>
    </div>

    {drawerDef && <aside className="chart-drawer" aria-label={`${drawerDef.name} settings`}>
      <div className="chart-drawer-head"><b>{drawerDef.name}</b><button type="button" onClick={() => setDrawerId(null)} aria-label="Close">×</button></div>
      <div className="chart-drawer-body">
        <p className="chart-drawer-desc">{drawerDef.description}</p>
        {drawerDef.fields.map((f) => <SettingControl key={f.key} field={f} value={(state.settings[drawerDef.id] ?? drawerDef.defaults)[f.key]} onChange={(v) => setSetting(drawerDef.id, f.key, v)} />)}
        {drawerDef.fields.length === 0 && <p className="chart-drawer-desc">No settings. This indicator is fixed by definition.</p>}
      </div>
      <div className="chart-drawer-foot">
        <button type="button" onClick={() => resetSettings(drawerDef.id)}>Reset</button>
        <button type="button" className="is-danger" onClick={() => removeIndicator(drawerDef.id)}>Remove</button>
      </div>
    </aside>}

    {(isLoading || error || bars.length === 0) && <div className="chart-overlay">
      {isLoading ? <Skeleton width={480} height={180} />
        : error ? <EmptyState label="Chart" headline="Candles could not be loaded" reason="The request to Supabase failed. Reopening this screen retries." />
        : <EmptyState label="Chart" headline={isToday ? 'No live candles recorded yet' : 'No candles on record'} reason={isToday ? 'Live one-minute candles appear once the market sync writes the first bar.' : 'The selected history is not present in the candle table.'} />}
    </div>}
  </div>

  const dialogBlock = dialogOpen && <>
    <div className="chart-scrim" onClick={() => setDialogOpen(false)} />
    <div className="chart-dialog" role="dialog" aria-label="Indicators">
      <div className="chart-dialog-head">
        <h3>Indicators</h3>
        <input type="search" placeholder="Search indicators…" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
        <button type="button" onClick={() => setDialogOpen(false)} aria-label="Close">×</button>
      </div>
      <div className="chart-dialog-list">
        {catalogue.map((d) => {
          const added = state.active.includes(d.id)
          return <div key={d.id} className="chart-dialog-item">
            <i className={`chart-legend-swatch swatch-${d.swatch}`} style={{ color: d.color, background: d.swatch === 'zone' || d.swatch === 'bar' ? d.color : undefined }} aria-hidden="true" />
            <div className="chart-dialog-text"><b>{d.name}<span className="chart-dialog-cat">{d.category}</span></b><small>{d.unavailable ? <em>{d.unavailable}</em> : d.description}</small></div>
            <button type="button" className={`chart-dialog-add ${added ? 'is-added' : ''}`} disabled={Boolean(d.unavailable)} onClick={() => addIndicator(d.id)}>{d.unavailable ? 'Soon' : added ? 'Added ✓' : 'Add'}</button>
          </div>
        })}
        {catalogue.length === 0 && <div className="chart-dialog-item"><span /><div className="chart-dialog-text"><b>No match</b><small>Try another word</small></div></div>}
      </div>
    </div>
  </>

  if (layout === 'full') {
    return <div className="chart-fullpage">
      <nav className="chart-navbar">
        <a className="chart-navbar-back" href="/dashboard?phase=chart">← Dashboard</a>
        <div className="chart-navbar-brand">MarketCue<small>Chart</small></div>
        <div className="chart-navbar-scroll">{instrumentSwitch}{timeframeSwitch}{indicatorsButton}{templateMenu}</div>
        <span className="chart-navbar-status"><i />{isToday ? 'Live' : tradeDate}</span>
        {lastPriceChip}
      </nav>
      <div className="chart-fullpage-stage">{frameBlock}</div>
      {dialogBlock}
    </div>
  }

  return <section className="phase-view chart-view">
    <div className="review-section-head">
      <div>
        <p className="eyebrow">Price action · {isToday ? 'LIVE FROM KITE' : `HISTORY THROUGH ${tradeDate}`}</p>
        <h2>Chart</h2>
      </div>
      <PhaseAside capturedAt={lastCandleAt} />
    </div>

    <div className="chart-controls">
      {instrumentSwitch}
      {timeframeSwitch}
      {indicatorsButton}
      {templateMenu}
      {lastPriceChip}
    </div>

    {frameBlock}
    {dialogBlock}

    {read && <p className="chart-read">{read}</p>}

    <p className="chart-note">
      One-minute index spot candles from Zerodha Kite Connect, aggregated in the browser to the selected timeframe from the 09:15 IST open.
      Today is fitted on load; drag left for earlier sessions, up to 30. The current session arrives live through Supabase Realtime.
      OI walls and pivots are the same figures the Verdict screen reads; intraday and chart levels are computed from the candles.
    </p>

    <Disclaimer source="Zerodha Kite Connect" capturedAt={lastCandleAt ? fmt.timeIST(lastCandleAt) : null} />
  </section>
}

function SettingControl({ field, value, onChange }: { field: SettingField; value: unknown; onChange: (v: unknown) => void }) {
  if (field.type === 'toggle') {
    return <label className={`chart-field chart-field-toggle ${field.unavailable ? 'is-unavailable' : ''}`}>
      <span className="chart-field-label" style={{ color: field.color }}>{field.label}{field.unavailable && <small>{field.unavailable}</small>}</span>
      <input type="checkbox" role="switch" className="chart-menu-switch" checked={Boolean(value) && !field.unavailable} disabled={Boolean(field.unavailable)} onChange={(e) => onChange(e.target.checked)} />
    </label>
  }
  if (field.type === 'range') {
    const n = Number(value)
    return <div className="chart-field">
      <span className="chart-field-label">{field.label}{field.unit && <small>{field.unit}</small>}</span>
      <span className="chart-field-range"><input type="range" min={field.min} max={field.max} step={field.step} value={Number.isFinite(n) ? n : field.min} onChange={(e) => onChange(Number(e.target.value))} /><output>{Number.isFinite(n) ? n : field.min}</output></span>
    </div>
  }
  if (field.type === 'multi') {
    const arr = Array.isArray(value) ? (value as string[]) : []
    return <div className="chart-field">
      <span className="chart-field-label">{field.label}</span>
      <span className="chart-chips">{field.options.map((o) => (
        <label key={o.value} style={{ color: o.color }}><input type="checkbox" checked={arr.includes(o.value)} onChange={(e) => onChange(e.target.checked ? [...arr, o.value] : arr.filter((v) => v !== o.value))} />{o.label}</label>
      ))}</span>
    </div>
  }
  return <div className="chart-field">
    <span className="chart-field-label">{field.label}</span>
    <span className="chart-chips">{field.options.map((o) => (
      <label key={String(o.value)}><input type="radio" name={`f-${field.key}`} checked={value === o.value} onChange={() => onChange(o.value)} />{o.label}</label>
    ))}</span>
  </div>
}
