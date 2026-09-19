'use client'

import { useMemo, useState } from 'react'
import useSWR from 'swr'
import { Banner, Disclaimer, EmptyState } from '@/components/ui/ds'
import { createClient } from '@/lib/supabase/client'
import { useChartColors } from '@/hooks/use-chart-colors'
import { PALETTE } from '@/lib/chart/palette'
import { fmt } from '@/lib/format'
import type { Instrument } from '@/lib/chart/types'
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

// Reads oi_snapshot_log's 1-min PCR/max-pain/OI-support-resistance history for today, for the
// selected instrument. This is the real swap the earlier sample-data version (PR #177) was built
// to make: same shapes, same components, now sourced from the live pipeline instead of
// MOCK_SESSIONS. The "Session read" narrative paragraphs from that version are deliberately
// dropped, not replaced with new placeholder copy -- that prose was written to match specific
// fabricated numbers, and fabricated narrative next to real figures would misrepresent live
// data. It comes back once the actual narrative backend (a separate LLM call over these figures)
// ships; until then the chart and event list speak for themselves.

type ChangeAction = 'Addition' | 'Unwinding' | 'Flat'

type SnapshotPoint = {
  time: string // HH:mm IST
  pcr: number | null
  maxPain: number | null
  support: number | null
  resistance: number | null
  supportChange: ChangeAction
  resistanceChange: ChangeAction
}

function todayIST() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

function timeIST(iso: string) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso))
}

function asChange(v: string | null): ChangeAction {
  return v === 'Addition' || v === 'Unwinding' ? v : 'Flat'
}

function actionTone(action: ChangeAction): 'up' | 'down' | 'flat' {
  if (action === 'Addition') return 'up'
  if (action === 'Unwinding') return 'down'
  return 'flat'
}

function buildEvents(points: SnapshotPoint[]) {
  const out: { time: string; level: string; strike: string; change: ChangeAction }[] = []
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1], cur = points[i]
    if (cur.support !== prev.support) out.push({ time: cur.time, level: 'Support', strike: `${fmt.strike(prev.support)} → ${fmt.strike(cur.support)}`, change: cur.supportChange })
    if (cur.resistance !== prev.resistance) out.push({ time: cur.time, level: 'Resistance', strike: `${fmt.strike(prev.resistance)} → ${fmt.strike(cur.resistance)}`, change: cur.resistanceChange })
  }
  out.reverse()
  if (points.length) out.push({ time: points[0].time, level: 'Session open', strike: `S ${fmt.strike(points[0].support)} · R ${fmt.strike(points[0].resistance)}`, change: 'Flat' })
  return out
}

function ChangeTag({ change }: { change: ChangeAction }) {
  if (change === 'Flat') return <span className="oi-change-tag oi-change-tag--flat">Flat</span>
  const tone = actionTone(change)
  return <span className={`oi-change-tag oi-change-tag--${tone}`}><i aria-hidden="true">{tone === 'up' ? '▲' : '▼'}</i>{change}</span>
}

export function OiHistoryView() {
  const [instrument, setInstrument] = useState<Instrument>('NIFTY')
  const colors = useChartColors()
  const supabase = createClient()
  const tradeDate = todayIST()

  const { data, isLoading } = useSWR(
    ['oi-snapshot-log', instrument, tradeDate],
    async () => {
      const { data: rows, error } = await supabase.from('oi_snapshot_log')
        .select('captured_at, pcr, max_pain, oi_support, oi_resistance, oi_support_change, oi_resistance_change')
        .eq('instrument', instrument).eq('trade_date', tradeDate)
        .order('captured_at', { ascending: true })
      if (error) throw error
      return (rows ?? []).map((r): SnapshotPoint => ({
        time: timeIST(r.captured_at as string),
        pcr: r.pcr != null ? Number(r.pcr) : null,
        maxPain: r.max_pain != null ? Number(r.max_pain) : null,
        support: r.oi_support != null ? Number(r.oi_support) : null,
        resistance: r.oi_resistance != null ? Number(r.oi_resistance) : null,
        supportChange: asChange(r.oi_support_change as string | null),
        resistanceChange: asChange(r.oi_resistance_change as string | null),
      }))
    },
    { revalidateOnFocus: false, refreshInterval: 60_000 },
  )

  const points = data ?? []
  const first = points[0]
  const latest = points[points.length - 1]
  const events = useMemo(() => buildEvents(points), [points])

  const pcrDelta = first && latest && first.pcr != null && latest.pcr != null ? latest.pcr - first.pcr : null
  const maxPainMoved = first && latest ? latest.maxPain !== first.maxPain : false
  const supportEvent = [...events].reverse().find((e) => e.level === 'Support')
  const resistanceEvent = [...events].reverse().find((e) => e.level === 'Resistance')

  const instrumentSwitch = (
    <div className="chart-switch" role="group" aria-label="Instrument">
      {(['NIFTY', 'SENSEX'] as Instrument[]).map((i) => (
        <button key={i} type="button" className={instrument === i ? 'is-active' : ''} aria-pressed={instrument === i} onClick={() => setInstrument(i)}>
          {i === 'NIFTY' ? 'Nifty 50' : 'Sensex'}
        </button>
      ))}
    </div>
  )

  return (
    <section className="phase-view special-view oi-history-view">
      <div className="review-section-head">
        <div><p className="eyebrow">Options intelligence · session series</p><h2>OI History</h2></div>
        {instrumentSwitch}
      </div>

      <Banner tone="info" label="How to read this">
        PCR, max pain and OI support/resistance from <b>{instrument === 'NIFTY' ? 'Nifty 50' : 'Sensex'}</b>&rsquo;s option chain, logged every
        minute through the session (09:15–15:30 IST). This is descriptive positioning data — where OI is building or coming off a strike —
        not a price prediction or a trade signal.
      </Banner>

      {isLoading ? null : points.length === 0 ? (
        <div className="oi-card">
          <EmptyState
            label="OI History"
            headline="No snapshots for today yet"
            reason="oi-snapshot-log logs every minute during market hours (09:15–15:30 IST) — check back once the session is live."
          />
        </div>
      ) : (
        <>
          <div className="oi-card">
            <div className="oi-tile-grid">
              <div className="oi-tile">
                <span className="oi-tile-label">PCR</span>
                <strong className="oi-tile-value">{fmt.ratio(latest.pcr)}</strong>
                <span className={`oi-tile-sub ${pcrDelta == null || pcrDelta === 0 ? '' : pcrDelta > 0 ? 'positive' : 'negative'}`}>
                  {pcrDelta == null ? '–' : pcrDelta === 0 ? 'Flat since open' : `${pcrDelta > 0 ? '+' : '−'}${Math.abs(pcrDelta).toFixed(2)} since open`}
                </span>
              </div>
              <div className="oi-tile">
                <span className="oi-tile-label">Max pain</span>
                <strong className="oi-tile-value">{fmt.strike(latest.maxPain)}</strong>
                <span className="oi-tile-sub">{maxPainMoved ? `Was ${fmt.strike(first.maxPain)} at open` : 'Unchanged since open'}</span>
              </div>
              <div className="oi-tile">
                <span className="oi-tile-label">OI support</span>
                <strong className="oi-tile-value">{fmt.strike(latest.support)}</strong>
                <span className={`oi-tile-sub ${actionTone(supportEvent?.change ?? 'Flat') === 'flat' ? '' : actionTone(supportEvent?.change ?? 'Flat') === 'up' ? 'positive' : 'negative'}`}>
                  {supportEvent ? `${supportEvent.change} · ${supportEvent.time}` : 'Flat since open'}
                </span>
              </div>
              <div className="oi-tile">
                <span className="oi-tile-label">OI resistance</span>
                <strong className="oi-tile-value">{fmt.strike(latest.resistance)}</strong>
                <span className={`oi-tile-sub ${actionTone(resistanceEvent?.change ?? 'Flat') === 'flat' ? '' : actionTone(resistanceEvent?.change ?? 'Flat') === 'up' ? 'positive' : 'negative'}`}>
                  {resistanceEvent ? `${resistanceEvent.change} · ${resistanceEvent.time}` : 'Flat since open'}
                </span>
              </div>
            </div>
          </div>

          <div className="oi-card">
            <div className="oi-card-head"><h3>PCR &amp; max pain — full session</h3><span className="oi-group-range">09:15 – 15:30 IST</span></div>
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={points} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
                <XAxis dataKey="time" stroke={colors.faint} fontSize={10} tickLine={false} axisLine={{ stroke: colors.rule }} interval="preserveStartEnd" />
                <YAxis yAxisId="pcr" stroke={colors.faint} fontSize={10} tickLine={false} axisLine={false} width={32} domain={['dataMin - 0.08', 'dataMax + 0.08']} />
                <YAxis yAxisId="mp" orientation="right" stroke={colors.faint} fontSize={10} tickLine={false} axisLine={false} width={54} domain={['dataMin - 60', 'dataMax + 60']} />
                <Tooltip contentStyle={{ background: colors.surface, border: `1px solid ${colors.rule}`, borderRadius: 8, fontSize: 12 }} labelStyle={{ color: colors.faint }} />
                <Line yAxisId="pcr" type="monotone" dataKey="pcr" name="PCR" stroke={colors.caution} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls />
                <Line yAxisId="mp" type="stepAfter" dataKey="maxPain" name="Max pain" stroke={PALETTE.violet} strokeWidth={1.5} strokeDasharray="4 3" dot={false} isAnimationActive={false} connectNulls />
              </LineChart>
            </ResponsiveContainer>
            <div className="oi-legend">
              <span><i className="oi-swatch" style={{ background: colors.caution }} />PCR</span>
              <span><i className="oi-swatch oi-swatch--dashed" style={{ borderColor: PALETTE.violet }} />Max pain</span>
            </div>
          </div>

          <div className="oi-card">
            <div className="oi-card-head"><h3>OI support / resistance — full session</h3><span className="oi-group-range">strike, ₹</span></div>
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={points} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
                <XAxis dataKey="time" stroke={colors.faint} fontSize={10} tickLine={false} axisLine={{ stroke: colors.rule }} interval="preserveStartEnd" />
                <YAxis stroke={colors.faint} fontSize={10} tickLine={false} axisLine={false} width={54} domain={['dataMin - 80', 'dataMax + 80']} />
                <Tooltip contentStyle={{ background: colors.surface, border: `1px solid ${colors.rule}`, borderRadius: 8, fontSize: 12 }} labelStyle={{ color: colors.faint }} />
                <Line type="stepAfter" dataKey="resistance" name="OI resistance" stroke={colors.down} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls />
                <Line type="stepAfter" dataKey="support" name="OI support" stroke={colors.up} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls />
              </LineChart>
            </ResponsiveContainer>
            <div className="oi-legend">
              <span><i className="oi-swatch" style={{ background: colors.up }} />OI support</span>
              <span><i className="oi-swatch" style={{ background: colors.down }} />OI resistance</span>
              <span><i className="oi-swatch oi-swatch--tri-up" />Addition</span>
              <span><i className="oi-swatch oi-swatch--tri-down" />Unwinding</span>
            </div>
          </div>

          <div className="oi-card">
            <div className="oi-card-head"><h3>Support / resistance events</h3><span className="oi-group-range">{events.length} today</span></div>
            <div className="oi-event-list">
              {events.map((e, i) => (
                <div className="oi-event-row" key={i}>
                  <span className="oi-event-time">{e.time}<small>IST</small></span>
                  <span>
                    <span className="oi-event-head"><b>{e.level}</b> <span className="ds-num">{e.strike}</span></span>
                    <ChangeTag change={e.change} />
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      <Disclaimer source="Upstox option chain (oi_snapshot_log)" capturedAt={latest ? `${latest.time} IST` : undefined} />
    </section>
  )
}
