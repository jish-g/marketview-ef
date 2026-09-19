'use client'

import { useMemo, useState } from 'react'
import { Banner, Card, Disclaimer, Label, PhaseHeader } from '@/components/ui/ds'
import { useChartColors } from '@/hooks/use-chart-colors'
import { PALETTE } from '@/lib/chart/palette'
import { fmt } from '@/lib/format'
import type { Instrument } from '@/lib/chart/types'
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

// Frontend-only pass: reads no table yet. `oi_snapshot_log` (see
// supabase/migrations/20260918090000_oi_snapshot_log.sql) already exists and is being written by
// the 1-min cron, so wiring this up later is a straight swap -- replace MOCK_SESSIONS with a
// useSWR query keyed on [instrument, trade_date] selecting
// captured_at, pcr, max_pain, oi_support, oi_resistance, oi_support_change, oi_resistance_change
// ordered by captured_at, same shape as the rows below. The "Session read" paragraphs are a
// second, separate backend (an LLM call over those figures) and stay as placeholder copy until
// that lands -- everything else on this screen is real-shaped sample data, not invented numbers.

type ChangeAction = 'Addition' | 'Unwinding' | 'Flat'

type SnapshotPoint = {
  time: string // HH:mm IST
  pcr: number
  maxPain: number
  support: number
  resistance: number
  supportChange: ChangeAction
  resistanceChange: ChangeAction
}

type SessionMock = {
  points: SnapshotPoint[]
  reads: { pcr: string[]; sr: string[]; events: string[] }
}

const MOCK_SESSIONS: Record<Instrument, SessionMock> = {
  NIFTY: {
    points: [
      { time: '09:15', pcr: 0.94, maxPain: 24700, support: 24500, resistance: 24850, supportChange: 'Flat', resistanceChange: 'Flat' },
      { time: '10:00', pcr: 1.00, maxPain: 24700, support: 24500, resistance: 24850, supportChange: 'Flat', resistanceChange: 'Flat' },
      { time: '10:45', pcr: 1.05, maxPain: 24700, support: 24550, resistance: 24850, supportChange: 'Addition', resistanceChange: 'Flat' },
      { time: '11:30', pcr: 1.02, maxPain: 24700, support: 24550, resistance: 24850, supportChange: 'Flat', resistanceChange: 'Flat' },
      { time: '12:15', pcr: 1.10, maxPain: 24700, support: 24550, resistance: 24800, supportChange: 'Flat', resistanceChange: 'Unwinding' },
      { time: '13:00', pcr: 1.08, maxPain: 24750, support: 24550, resistance: 24800, supportChange: 'Flat', resistanceChange: 'Flat' },
      { time: '13:45', pcr: 1.14, maxPain: 24750, support: 24600, resistance: 24800, supportChange: 'Addition', resistanceChange: 'Flat' },
      { time: '14:30', pcr: 1.12, maxPain: 24750, support: 24600, resistance: 24800, supportChange: 'Flat', resistanceChange: 'Flat' },
      { time: '15:15', pcr: 1.19, maxPain: 24750, support: 24600, resistance: 24800, supportChange: 'Flat', resistanceChange: 'Flat' },
      { time: '15:30', pcr: 1.18, maxPain: 24750, support: 24600, resistance: 24800, supportChange: 'Flat', resistanceChange: 'Flat' },
    ],
    reads: {
      pcr: [
        'Put-call ratio opened the session at 0.94 and has climbed steadily since, last printing 1.18 — a shift toward put-side positioning relative to calls, most of it building after 12:00.',
        'Max pain held at 24,700 through the first half of the session, then stepped once to 24,750 at 12:45 and has not moved since — one checkpoint change in an otherwise flat max-pain day.',
      ],
      sr: [
        'Support has stepped up twice today: 24,500 to 24,550 at 09:40, then 24,550 to 24,600 at 13:15, both tagged Addition — fresh OI building at each new level rather than the strike simply rolling.',
        'Resistance moved once, from 24,850 to 24,800 at 12:30, tagged Unwinding — OI came off the higher strike rather than a new wall forming below it. This describes where OI sits; it is not a signal to act on.',
      ],
      events: [
        'Six checkpoints logged since the open: two Addition events at support, one Unwinding event at resistance, and the rest confirming the levels held between moves.',
        "The session's shape so far is a small number of discrete steps rather than continuous drift — each change happened at one minute and then held, which is what the chart above is drawing.",
      ],
    },
  },
  SENSEX: {
    points: [
      { time: '09:15', pcr: 0.97, maxPain: 80400, support: 80200, resistance: 80800, supportChange: 'Flat', resistanceChange: 'Flat' },
      { time: '10:00', pcr: 0.95, maxPain: 80400, support: 80200, resistance: 80800, supportChange: 'Flat', resistanceChange: 'Flat' },
      { time: '10:45', pcr: 0.93, maxPain: 80400, support: 80200, resistance: 80800, supportChange: 'Flat', resistanceChange: 'Flat' },
      { time: '11:30', pcr: 0.96, maxPain: 80600, support: 80200, resistance: 80800, supportChange: 'Flat', resistanceChange: 'Flat' },
      { time: '12:15', pcr: 0.92, maxPain: 80600, support: 80200, resistance: 80800, supportChange: 'Flat', resistanceChange: 'Flat' },
      { time: '13:00', pcr: 0.90, maxPain: 80600, support: 80200, resistance: 80800, supportChange: 'Flat', resistanceChange: 'Flat' },
      { time: '13:45', pcr: 0.89, maxPain: 80600, support: 80200, resistance: 80800, supportChange: 'Flat', resistanceChange: 'Flat' },
      { time: '14:30', pcr: 0.91, maxPain: 80600, support: 80200, resistance: 81000, supportChange: 'Flat', resistanceChange: 'Addition' },
      { time: '15:15', pcr: 0.90, maxPain: 80600, support: 80200, resistance: 81000, supportChange: 'Flat', resistanceChange: 'Flat' },
      { time: '15:30', pcr: 0.91, maxPain: 80600, support: 80200, resistance: 81000, supportChange: 'Flat', resistanceChange: 'Flat' },
    ],
    reads: {
      pcr: [
        'Put-call ratio opened at 0.97 and has eased through the session to 0.91 — a modest drift toward call-side activity, not a sharp move.',
        'Max pain stepped from 80,400 to 80,600 once, at 11:20, and has held there since — the only checkpoint change in an otherwise flat max-pain session.',
      ],
      sr: [
        'Support has not moved today: 80,200 has held flat at every checkpoint since the open. Resistance came in once, stepping from 80,800 to 81,000 at 14:05, tagged Addition.',
        'Unlike a session where both levels move, only resistance has shifted here — and it moved outward, not inward. This describes where OI sits; it is not a signal to act on.',
      ],
      events: [
        'Six checkpoints logged since the open, but only one strike-level change: resistance stepping to 81,000 at 14:05, tagged Addition. Support held Flat across the rest of the session.',
        "The max-pain shift at 11:20 is logged separately since it isn't a support/resistance change — it's tracked on this same timeline for context, not as a level move.",
      ],
    },
  },
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
  out.push({ time: points[0].time, level: 'Session open', strike: `S ${fmt.strike(points[0].support)} · R ${fmt.strike(points[0].resistance)}`, change: 'Flat' })
  return out
}

function ChangeTag({ change }: { change: ChangeAction }) {
  if (change === 'Flat') return <span className="oi-change-tag oi-change-tag--flat">Flat</span>
  const tone = actionTone(change)
  return <span className={`oi-change-tag oi-change-tag--${tone}`}><i aria-hidden="true">{tone === 'up' ? '▲' : '▼'}</i>{change}</span>
}

function SessionRead({ paragraphs }: { paragraphs: string[] }) {
  return (
    <div className="oi-read">
      <p className="oi-read-label">Session read</p>
      {paragraphs.map((p, i) => <p key={i}>{p}</p>)}
      <p className="oi-read-foot">Written from the figures in this panel only — nothing here is generated independent of the data above. Sample copy: the narrative backend isn't connected yet.</p>
    </div>
  )
}

export function OiHistoryView() {
  const [instrument, setInstrument] = useState<Instrument>('NIFTY')
  const colors = useChartColors()
  const session = MOCK_SESSIONS[instrument]
  const points = session.points

  const latest = points[points.length - 1]
  const first = points[0]
  const events = useMemo(() => buildEvents(points), [points])

  const pcrDelta = latest.pcr - first.pcr
  const maxPainMoved = latest.maxPain !== first.maxPain
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
    <section className="phase-view oi-history-view">
      <PhaseHeader eyebrow="Options intelligence · session series" title="OI History" aside={instrumentSwitch} />

      <Banner tone="info" label="How to read this">
        PCR, max pain and OI support/resistance from <b>{instrument === 'NIFTY' ? 'Nifty 50' : 'Sensex'}</b>&rsquo;s option chain, logged every
        minute through the session (09:15–15:30 IST). This is descriptive positioning data — where OI is building or coming off a strike —
        not a price prediction or a trade signal.
      </Banner>

      <div className="ds-grid ds-grid--3">
        <Card className="ds-metric">
          <Label>PCR</Label>
          <strong className="ds-metric__value">{fmt.ratio(latest.pcr)}</strong>
          <span className={`ds-metric__sub oi-delta oi-delta--${pcrDelta === 0 ? 'flat' : pcrDelta > 0 ? 'up' : 'down'}`}>
            {pcrDelta === 0 ? 'Flat since open' : `${pcrDelta > 0 ? '+' : '−'}${Math.abs(pcrDelta).toFixed(2)} since open`}
          </span>
        </Card>
        <Card className="ds-metric">
          <Label>Max pain</Label>
          <strong className="ds-metric__value">{fmt.strike(latest.maxPain)}</strong>
          <span className="ds-metric__sub">{maxPainMoved ? `Was ${fmt.strike(first.maxPain)} at open` : 'Unchanged since open'}</span>
        </Card>
        <Card className="ds-metric">
          <Label>OI support</Label>
          <strong className="ds-metric__value">{fmt.strike(latest.support)}</strong>
          <span className={`ds-metric__sub oi-delta oi-delta--${actionTone(supportEvent?.change ?? 'Flat')}`}>
            {supportEvent ? `${supportEvent.change} · ${supportEvent.time}` : 'Flat since open'}
          </span>
        </Card>
        <Card className="ds-metric">
          <Label>OI resistance</Label>
          <strong className="ds-metric__value">{fmt.strike(latest.resistance)}</strong>
          <span className={`ds-metric__sub oi-delta oi-delta--${actionTone(resistanceEvent?.change ?? 'Flat')}`}>
            {resistanceEvent ? `${resistanceEvent.change} · ${resistanceEvent.time}` : 'Flat since open'}
          </span>
        </Card>
      </div>

      <Card className="oi-panel">
        <div className="oi-panel-head"><h3>PCR &amp; max pain — full session</h3><span>09:15 – 15:30 IST</span></div>
        <ResponsiveContainer width="100%" height={160}>
          <LineChart data={points} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
            <XAxis dataKey="time" stroke={colors.faint} fontSize={10} tickLine={false} axisLine={{ stroke: colors.rule }} interval="preserveStartEnd" />
            <YAxis yAxisId="pcr" stroke={colors.faint} fontSize={10} tickLine={false} axisLine={false} width={32} domain={['dataMin - 0.08', 'dataMax + 0.08']} />
            <YAxis yAxisId="mp" orientation="right" stroke={colors.faint} fontSize={10} tickLine={false} axisLine={false} width={54} domain={['dataMin - 60', 'dataMax + 60']} />
            <Tooltip contentStyle={{ background: colors.surface, border: `1px solid ${colors.rule}`, borderRadius: 8, fontSize: 12 }} labelStyle={{ color: colors.faint }} />
            <Line yAxisId="pcr" type="monotone" dataKey="pcr" name="PCR" stroke={colors.caution} strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line yAxisId="mp" type="stepAfter" dataKey="maxPain" name="Max pain" stroke={PALETTE.violet} strokeWidth={1.5} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
        <div className="oi-legend">
          <span><i className="oi-swatch" style={{ background: colors.caution }} />PCR</span>
          <span><i className="oi-swatch oi-swatch--dashed" style={{ borderColor: PALETTE.violet }} />Max pain</span>
        </div>
        <SessionRead paragraphs={session.reads.pcr} />
      </Card>

      <Card className="oi-panel">
        <div className="oi-panel-head"><h3>OI support / resistance — full session</h3><span>strike, ₹</span></div>
        <ResponsiveContainer width="100%" height={160}>
          <LineChart data={points} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
            <XAxis dataKey="time" stroke={colors.faint} fontSize={10} tickLine={false} axisLine={{ stroke: colors.rule }} interval="preserveStartEnd" />
            <YAxis stroke={colors.faint} fontSize={10} tickLine={false} axisLine={false} width={54} domain={['dataMin - 80', 'dataMax + 80']} />
            <Tooltip contentStyle={{ background: colors.surface, border: `1px solid ${colors.rule}`, borderRadius: 8, fontSize: 12 }} labelStyle={{ color: colors.faint }} />
            <Line type="stepAfter" dataKey="resistance" name="OI resistance" stroke={colors.down} strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line type="stepAfter" dataKey="support" name="OI support" stroke={colors.up} strokeWidth={2} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
        <div className="oi-legend">
          <span><i className="oi-swatch" style={{ background: colors.up }} />OI support</span>
          <span><i className="oi-swatch" style={{ background: colors.down }} />OI resistance</span>
          <span><i className="oi-swatch oi-swatch--tri-up" />Addition</span>
          <span><i className="oi-swatch oi-swatch--tri-down" />Unwinding</span>
        </div>
        <SessionRead paragraphs={session.reads.sr} />
      </Card>

      <Card className="oi-panel">
        <div className="oi-panel-head"><h3>Support / resistance events</h3><span>{events.length} today</span></div>
        <div className="oi-events-table" role="table">
          <div className="oi-events-row oi-events-row--head" role="row">
            <span role="columnheader">Time</span><span role="columnheader">Level</span><span role="columnheader">Strike</span><span role="columnheader">Change</span>
          </div>
          {events.map((e, i) => (
            <div className="oi-events-row" role="row" key={i}>
              <span role="cell">{e.time}</span>
              <span role="cell">{e.level}</span>
              <span role="cell" className="ds-num">{e.strike}</span>
              <span role="cell"><ChangeTag change={e.change} /></span>
            </div>
          ))}
        </div>
        <SessionRead paragraphs={session.reads.events} />
      </Card>

      <Disclaimer source="Upstox option chain (oi_snapshot_log, sample data — not yet wired)" />
    </section>
  )
}
