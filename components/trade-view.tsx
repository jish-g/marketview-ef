'use client'

import { useMemo, useState } from 'react'
import useSWR from 'swr'
import { CheckCircle2, ArrowDown, RotateCcw } from 'lucide-react'
import { calculateVerdict } from '@/app/dashboard/page'
import { createClient } from '@/lib/supabase/client'

type Row = Record<string, string | number | boolean | null>
type Instrument = 'NIFTY' | 'SENSEX'
type TradeState = 'running' | 'locked_conservative' | 'closed'
type ExitReason = 'stop_conservative' | 'target_conservative' | 'target_aggressive' | 'eod_unresolved' | 'eod_at_or_above_conservative'
type Trade = Row & {
  id: string
  trade_date: string
  instrument: Instrument
  outcome: 'open' | 'target' | 'stop'
  state: TradeState | null
  exit_reason: ExitReason | null
  exit_time: string | null
  exit_premium: number | null
  ambiguous_resolution: boolean | null
  entry_delayed: boolean | null
}
type Leg = Row & { auto_trade_id: string; leg_key: string; side: 'Buy' | 'Sell'; strike: number | null; premium: number | null }

function todayIST() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

function formatTime(value: unknown) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true }).format(new Date(String(value)))
}

// exit_reason carries the detailed automated-poll outcome; falls back to the plain
// outcome field for any trade closed before this column existed (or via manual override).
function exitReasonLabel(reason: ExitReason | null | undefined) {
  switch (reason) {
    case 'stop_conservative': return 'Stop-loss hit (conservative)'
    case 'target_conservative': return 'Target hit (conservative, locked)'
    case 'target_aggressive': return 'Target hit (aggressive)'
    case 'eod_unresolved': return 'Closed at market close — neither hit'
    case 'eod_at_or_above_conservative': return 'Closed at market close — above conservative target'
    default: return null
  }
}

function statusLabel(trade: Pick<Trade, 'outcome' | 'exit_reason'>) {
  const detailed = exitReasonLabel(trade.exit_reason)
  if (detailed) return detailed
  return trade.outcome === 'target' ? 'Target Hit' : trade.outcome === 'stop' ? 'Stop-loss Hit' : 'Open'
}

function statusTone(trade: Pick<Trade, 'outcome' | 'exit_reason'>) {
  if (trade.exit_reason === 'stop_conservative') return 'danger'
  if (trade.exit_reason === 'target_conservative' || trade.exit_reason === 'target_aggressive' || trade.exit_reason === 'eod_at_or_above_conservative') return 'success'
  if (trade.exit_reason === 'eod_unresolved') return 'warning'
  return trade.outcome === 'target' ? 'success' : trade.outcome === 'stop' ? 'danger' : 'warning'
}

// Live-state label for a trade that's still open in the automated poller, shown instead of
// a bare "Open" so it's clear the system is actively tracking it, not waiting on a manual click.
function stateLabel(state: TradeState | null | undefined) {
  if (state === 'locked_conservative') return 'Tracking — conservative target locked, watching for aggressive'
  if (state === 'running') return 'Tracking — watching for target/stop'
  return 'Open'
}

function TradeCard({ instrument, trade, legs, rationale, mutate }: { instrument: Instrument; trade?: Trade; legs: Leg[]; rationale?: Row; mutate: () => void }) {
  const [saving, setSaving] = useState(false)
  const [overriding, setOverriding] = useState(false)
  const supabase = useMemo(() => createClient(), [])
  const isOpen = trade?.outcome === 'open'
  const netPremium = trade?.net_premium != null ? Number(trade.net_premium) : legs.reduce((sum, leg) => sum + (Number(leg.premium) || 0) * (leg.side === 'Sell' ? 1 : -1), 0)
  const isCredit = trade?.is_credit === true || netPremium >= 0
  // Manual override stays available as a fallback (e.g. the poller missed a cycle, or a
  // correction is needed) but entry and exit are now fully automated by the 5-minute poll —
  // see market-data-sync's `entry`/`poll` phases. Using it also sets exit_reason to null so
  // the manual outcome/timestamp take over as the source of truth for this trade.
  const record = async (outcome: 'target' | 'stop') => { if (!trade) return; setSaving(true); const { error } = await supabase.from('auto_trades').update({ outcome, outcome_at: new Date().toISOString(), state: 'closed', exit_reason: null }).eq('id', trade.id); setSaving(false); if (!error) { setOverriding(false); mutate() } }
  const undo = async () => { if (!trade) return; setSaving(true); const { error } = await supabase.from('auto_trades').update({ outcome: 'open', outcome_at: null, state: 'running', exit_reason: null }).eq('id', trade.id); setSaving(false); if (!error) mutate() }

  if (!trade) return <article className="verdict-instrument">
    <div className="verdict-instrument-head"><h3>{instrument}</h3></div>
    <p className="history-empty">Not filled yet — the scheduled trade hasn&apos;t created an auto-trade row for today.</p>
  </article>

  return <article className="verdict-instrument">
    <div className="verdict-instrument-head">
      <h3>{instrument}</h3>
      <span className={`trade-status sync-${statusTone(trade)}`}>{isOpen ? stateLabel(trade.state) : statusLabel(trade)}</span>
    </div>
    {(trade.ambiguous_resolution || trade.entry_delayed) && <p className="history-empty">
      {trade.entry_delayed && 'Entry premium was captured on a later poll, not exactly at 09:30. '}
      {trade.ambiguous_resolution && 'A single 5-minute check saw multiple levels crossed at once — resolved to the safer outcome.'}
    </p>}
    <div className="verdict-card verdict-strategy-summary">
      <div className="verdict-strategy-box"><span className="eyebrow">Strategy</span><strong>{String(trade.strategy)}</strong></div>
      <div className="day-summary"><span className="eyebrow">Rationale</span><p>{rationale ? `${String(rationale.bias ?? 'Neutral')} bias, India VIX ${Number(rationale.vix ?? 0).toFixed(1)}, ${String(rationale.iv ?? 'current IV')} conditions, PCR ${Number(rationale.pcr ?? 0).toFixed(2)}.` : 'System-generated strategy from the latest market snapshot.'}</p></div>
    </div>
    <div className="position-calculator">
      <div className="position-head"><div><p className="eyebrow">Filled legs</p><strong>{trade.trade_date}</strong></div><span>Auto-filled record</span></div>
      <div className="leg-list">
        {legs.length === 0 ? <p className="history-empty">No leg fills recorded.</p> : legs.map((leg) => <div className="leg-row" key={String(leg.id ?? leg.leg_key)}>
          <span className={`leg-badge leg-${leg.side.toLowerCase()}`}>{leg.side}</span>
          <span className="leg-label">{String(leg.leg_key)}</span>
          <b className="trade-strike">{leg.strike ?? '—'}</b>
          <span className="trade-premium">₹{leg.premium != null ? Number(leg.premium).toFixed(1) : '—'}</span>
        </div>)}
      </div>
      <div className="position-outputs"><span>Net Premium ({isCredit ? 'received' : 'paid'}) <b>₹{Math.abs(netPremium).toFixed(1)}</b></span></div>
      {trade.target_price_cons != null && <div className="position-outputs"><span>Target (cons.) <b>{Number(trade.target_price_cons).toFixed(2)}</b></span><span>Stop (cons.) <b>{Number(trade.stop_price_cons ?? 0).toFixed(2)}</b></span>{trade.target_price_aggr != null && <span>Target (agg.) <b>{Number(trade.target_price_aggr).toFixed(2)}</b></span>}</div>}
    </div>
    {isOpen ? (
      overriding ? (
        <div className="trade-actions">
          <button type="button" className="action-button action-button-success" onClick={() => record('target')} disabled={saving}><CheckCircle2 size={14} /> Mark Target Hit</button>
          <button type="button" className="action-button action-button-danger" onClick={() => record('stop')} disabled={saving}><ArrowDown size={14} /> Mark Stop-loss Hit</button>
          <button type="button" className="action-button" onClick={() => setOverriding(false)} disabled={saving}>Cancel</button>
        </div>
      ) : (
        <div className="trade-confirmation">
          <span className="sync-warning">{stateLabel(trade.state)} — checked automatically every 5 min</span>
          <button type="button" className="action-button" onClick={() => setOverriding(true)}>Manual override</button>
        </div>
      )
    ) : (
      <div className="trade-confirmation">
        <span className={`sync-${statusTone(trade)}`}>✓ {statusLabel(trade)}{trade.exit_time || trade.outcome_at ? ` — ${formatTime(trade.exit_time ?? trade.outcome_at)}` : ''}{trade.exit_premium != null ? ` at ${Number(trade.exit_premium).toFixed(2)}` : ''}</span>
        <button type="button" className="action-button" onClick={undo} disabled={saving}><RotateCcw size={13} /> Undo</button>
      </div>
    )}
  </article>
}

export function TradeView() {
  const supabase = useMemo(() => createClient(), [])
  const tradeDate = todayIST()
  const { data, error, mutate } = useSWR(['trade-page', tradeDate], async () => {
    const [{ data: trades, error: tradeError }, { data: legs, error: legError }, { data: snapshot }] = await Promise.all([
      supabase.from('auto_trades').select('*').order('trade_date', { ascending: false }),
      supabase.from('auto_trade_legs').select('*'),
      supabase.from('premarket_dashboard').select('*').eq('trade_date', tradeDate).maybeSingle(),
    ])
    if (tradeError) throw tradeError
    if (legError) throw legError
    return { trades: (trades ?? []) as Trade[], legs: (legs ?? []) as Leg[], snapshot: snapshot as Row | null }
  }, { revalidateOnFocus: false })
  const trades = data?.trades ?? []
  const todayTrades = trades.filter((trade) => trade.trade_date === tradeDate)
  const summary = useMemo(() => {
    // Use state === 'closed' (not the legacy outcome !== 'open' check) since
    // eod_unresolved trades are fully resolved but keep outcome: 'open' for
    // backward-compat with rows written before the state machine existed.
    const closed = trades.filter((trade) => trade.state === 'closed' || (trade.state == null && trade.outcome !== 'open'))
    const isWin = (trade: Trade) => trade.exit_reason === 'target_conservative' || trade.exit_reason === 'target_aggressive' || trade.exit_reason === 'eod_at_or_above_conservative' || (trade.exit_reason == null && trade.outcome === 'target')
    const isLoss = (trade: Trade) => trade.exit_reason === 'stop_conservative' || (trade.exit_reason == null && trade.outcome === 'stop')
    const targets = closed.filter(isWin).length
    const stops = closed.filter(isLoss).length
    const pnl = closed.reduce((sum, trade) => {
      const netPremium = Number(trade.net_premium) || 0
      const qty = Number(trade.qty) || 0
      if (isWin(trade)) return sum + netPremium * qty * 0.6
      if (isLoss(trade)) return sum - netPremium * qty * 0.4
      return sum
    }, 0)
    return { total: closed.length, targets, stops, winRate: closed.length ? (targets / closed.length) * 100 : 0, pnl }
  }, [trades])
  const getTrade = (instrument: Instrument) => todayTrades.find((trade) => trade.instrument === instrument)
  const rationale = (instrument: Instrument) => data?.snapshot ? calculateVerdict(data.snapshot, instrument) as Row : undefined
  const rows = [...trades].sort((a, b) => `${b.trade_date}-${b.instrument}`.localeCompare(`${a.trade_date}-${a.instrument}`))

  return <section className="phase-view trade-page">
    <div className="review-section-head"><div><p className="eyebrow">Execution desk</p><h2>Trade</h2></div><span>{tradeDate}</span></div>
    {error && <p className="history-empty">Unable to load trade data right now.</p>}
    <div className="trade-grid">
      {(['NIFTY', 'SENSEX'] as Instrument[]).map((instrument) => { const trade = getTrade(instrument); return <TradeCard key={instrument} instrument={instrument} trade={trade} legs={data?.legs.filter((leg) => leg.auto_trade_id === trade?.id) ?? []} rationale={rationale(instrument)} mutate={() => { void mutate() }} /> })}
    </div>
    <section className="trade-log">
      <div className="review-section-head"><div><p className="eyebrow">All recorded outcomes</p><h2>Trade Log</h2></div></div>
      <div className="trade-summary-tiles">
        <div className="field-card"><span>Total trades</span><strong>{summary.total}</strong></div>
        <div className="field-card"><span>Target hit count</span><strong>{summary.targets}</strong></div>
        <div className="field-card"><span>Stop-loss hit count</span><strong>{summary.stops}</strong></div>
        <div className="field-card"><span>Win rate %</span><strong>{summary.winRate.toFixed(0)}%</strong></div>
        <div className="field-card"><span>Total P&amp;L</span><strong><em className={`breadth-flag ${summary.pnl >= 0 ? 'positive' : 'negative'}`}>{summary.pnl >= 0 ? '+' : '−'}₹{Math.abs(summary.pnl).toFixed(0)}</em></strong></div>
      </div>
      {rows.length === 0 ? <p className="history-empty">No past trades recorded yet.</p> : <div className="history-list">
        <div className="history-row history-head trade-log-row" aria-hidden="true"><span>Date</span><span>Instrument</span><span>Strategy</span><span>Net Premium</span><span>Outcome</span></div>
        {rows.map((trade) => <article className="history-row trade-log-row" key={String(trade.id)}>
          <span>{trade.trade_date}</span>
          <span>{trade.instrument}</span>
          <span>{String(trade.strategy)}</span>
          <span>₹{Math.abs(Number(trade.net_premium) || 0).toFixed(1)} {trade.is_credit ? 'received' : 'paid'}</span>
          <span className={`trade-status sync-${statusTone(trade)}`}>{trade.outcome === 'open' ? 'Open' : statusLabel(trade)}</span>
        </article>)}
      </div>}
    </section>
  </section>
}
