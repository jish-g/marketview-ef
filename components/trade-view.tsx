'use client'

import { useMemo, useState } from 'react'
import { PhaseAside, Progress, Disclaimer } from '@/components/ui/ds'
import { fmt } from '@/lib/format'
import useSWR from 'swr'
import { CheckCircle2, ArrowDown, RotateCcw } from 'lucide-react'
import { calculateVerdict } from '@/app/dashboard/page'
import { createClient } from '@/lib/supabase/client'
import { GexView } from '@/components/gex-view'

type Row = Record<string, string | number | boolean | null>
type Instrument = 'NIFTY' | 'SENSEX'
type TradeState = 'running' | 'locked_conservative' | 'closed'
type ExitReason = 'stop_conservative' | 'target_conservative' | 'target_aggressive' | 'eod_unresolved' | 'eod_at_or_above_conservative'
type TradeSource = 'system' | 'manual'
type Trade = Row & {
  id: string
  trade_date: string
  instrument: Instrument
  outcome: 'open' | 'target' | 'stop'
  state: TradeState | null
  source: TradeSource | null
  exit_reason: ExitReason | null
  exit_time: string | null
  exit_premium: number | null
  entry_premium: number | null
  qty: number | null
  strategy: string | null
  ambiguous_resolution: boolean | null
  entry_delayed: boolean | null
  last_checked_at: string | null
}

// Real signed P&L for a closed trade, in rupees, using the actual entry/exit premium
// and lot size rather than assuming a fixed capture ratio. Credit-spread and Iron
// Condor trades are net sellers — for them premium falling is the profit direction,
// so the sign flips relative to a net buyer (Naked Call/Put, Debit Spread), where
// premium rising is profit. This mirrors the exact touch-direction logic the poll
// phase already uses server-side (market-data-sync, phase "poll").
function tradePnl(trade: Trade): number | null {
  if (trade.entry_premium == null || trade.exit_premium == null) return null
  const qty = Number(trade.qty) || 0
  const isNetSeller = trade.strategy === 'Credit Spread' || trade.strategy === 'Iron Condor'
  const directionSign = isNetSeller ? -1 : 1
  return (Number(trade.exit_premium) - Number(trade.entry_premium)) * directionSign * qty
}
type Leg = Row & { auto_trade_id: string; leg_key: string; side: 'Buy' | 'Sell'; strike: number | null; premium: number | null }

function todayIST() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

function formatTime(value: unknown) {
  return fmt.timeIST(value as string | null) ?? 'Not recorded'
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

// Leg keys are internal shorthand written by the Edge Function (market-data-sync,
// legsForStrategyV): "p" for a naked buy, "s"/"lg" for the primary/hedge leg of a
// debit or credit spread, and "lc"/"sc"/"sp"/"lp" for the four Iron Condor legs
// (long call, short call, short put, long put). Never show these raw codes — map
// them to the same plain-English labels the Verdict page uses.
function legKeyLabel(legKey: string, side: 'Buy' | 'Sell', strategy: string | null | undefined) {
  // Naked Call/Put, Debit Spread, and Credit Spread don't record call-vs-put on the
  // trade row itself (that's only resolved server-side at entry time), so those keys
  // stay generic here rather than guessing wrong — the strike shown alongside each
  // row disambiguates. Iron Condor's four keys are unambiguous (lc/sc/sp/lq always
  // mean the same leg), so those get the specific Call/Put label.
  if (strategy === 'Naked Call') return 'Call (naked)'
  if (strategy === 'Naked Put') return 'Put (naked)'
  const map: Record<string, string> = {
    p: 'Option (naked)',
    s: side === 'Sell' ? 'Primary (sold)' : 'Primary (bought)',
    lg: side === 'Buy' ? 'Hedge (bought)' : 'Hedge (sold)',
    lc: 'Call (hedge)',
    sc: 'Call (sold)',
    sp: 'Put (sold)',
    lp: 'Put (hedge)',
  }
  return map[legKey] ?? `${side === 'Buy' ? 'Bought' : 'Sold'} leg`
}

// Small badge distinguishing a system-picked trade (the 09:30 automatic entry) from a
// manually-logged one (via the Verdict page's Update Premium / Trade buttons). Defaults to
// 'system' for older rows written before the source column existed.
function sourceLabel(source: TradeSource | null | undefined) {
  return source === 'manual' ? 'Manual' : 'System'
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
      <h3>{instrument} <span className={`source-badge source-${trade.source ?? 'system'}`}>{sourceLabel(trade.source)}</span></h3>
      <span className={`trade-status sync-${statusTone(trade)}`}>{isOpen ? stateLabel(trade.state) : statusLabel(trade)}</span>
    </div>
    {(trade.ambiguous_resolution || trade.entry_delayed) && <p className="history-empty">
      {trade.entry_delayed && 'Entry premium was captured on a later poll, not exactly at 09:30. '}
      {trade.ambiguous_resolution && 'A single 5-minute check saw multiple levels crossed at once — resolved to the safer outcome.'}
    </p>}
    <div className="verdict-card verdict-strategy-summary">
      <div className="verdict-strategy-box"><span className="eyebrow">Strategy</span><strong>{String(trade.strategy)}</strong></div>
      <div className="day-summary"><span className="eyebrow">Rationale</span><p>{rationale ? `${String(rationale.bias ?? 'Neutral')} bias, India VIX ${fmt.ratio(Number(rationale.vix ?? 0))}, ${String(rationale.iv ?? 'current IV')} conditions, PCR ${fmt.ratio(Number(rationale.pcr ?? 0))}.` : 'System-generated strategy from the latest market snapshot.'}</p></div>
    </div>
    <div className="position-calculator">
      <div className="position-head"><div><p className="eyebrow">Filled legs</p><strong>{trade.trade_date}</strong></div><span>Auto-filled record</span></div>
      <div className="leg-list">
        {legs.length === 0 ? <p className="history-empty">No leg fills recorded.</p> : legs.map((leg) => <div className="leg-row" key={String(leg.id ?? leg.leg_key)}>
          <span className={`leg-badge leg-${leg.side.toLowerCase()}`}>{leg.side}</span>
          <span className="leg-label">{legKeyLabel(String(leg.leg_key), leg.side, trade.strategy)}</span>
          <b className="trade-strike">{leg.strike != null ? fmt.strike(leg.strike) : 'Not set'}</b>
          <span className="trade-premium">{leg.premium != null ? fmt.rupees(leg.premium) : 'Not filled'}</span>
        </div>)}
      </div>
      <div className="position-outputs"><span>Net Premium ({isCredit ? 'received' : 'paid'}) <b>{fmt.rupees(Math.abs(netPremium))}</b></span></div>
      {trade.target_price_cons != null && <div className="position-outputs"><span>Target (cons.) <b>{fmt.rupees(Number(trade.target_price_cons))}</b></span><span>Stop (cons.) <b>{fmt.rupees(Number(trade.stop_price_cons ?? 0))}</b></span>{trade.target_price_aggr != null && <span>Target (agg.) <b>{fmt.rupees(Number(trade.target_price_aggr))}</b></span>}</div>}
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
        <span className={`sync-${statusTone(trade)}`}>✓ {statusLabel(trade)}{trade.exit_time || trade.outcome_at ? ` — ${formatTime(trade.exit_time ?? trade.outcome_at)}` : ''}{trade.exit_premium != null ? ` at ${fmt.rupees(trade.exit_premium)}` : ''}</span>
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

    // Real P&L per trade (entry vs exit premium, sign-adjusted for net sellers, times
    // lot size) rather than a fixed 0.6/0.4-of-premium guess keyed on target/stop hit.
    // This also correctly captures eod_unresolved trades, which never hit a target or
    // stop line but still close with a real gain or loss on the day.
    const pnlByTrade = closed.map((trade) => tradePnl(trade)).filter((v): v is number => v != null)
    const pnl = pnlByTrade.reduce((sum, v) => sum + v, 0)

    // Bucket by actual sign of realized P&L, not by which line was hit — an
    // eod_unresolved trade that happens to close up counts as a profit here, and one
    // that closes down counts as a loss, exactly per your instruction that EOD trades
    // aren't necessarily clean target/stop hits but still have a real result.
    const profits = pnlByTrade.filter((v) => v > 0)
    const losses = pnlByTrade.filter((v) => v < 0)
    const avgProfit = profits.length ? profits.reduce((s, v) => s + v, 0) / profits.length : 0
    const avgLoss = losses.length ? losses.reduce((s, v) => s + v, 0) / losses.length : 0
    const riskReward = avgLoss !== 0 ? avgProfit / Math.abs(avgLoss) : null

    const eodUnresolvedCount = closed.filter((trade) => trade.exit_reason === 'eod_unresolved').length

    return { total: closed.length, targets, stops, winRate: closed.length ? (targets / closed.length) * 100 : 0, pnl, avgProfit, avgLoss, riskReward, eodUnresolvedCount }
  }, [trades])
  // System and manual trades can both exist for the same instrument/day now (a manual trade
  // is always logged alongside the system's own pick, never in place of it), so this filters
  // the whole page's view rather than picking a single trade per instrument.
  const [sourceFilter, setSourceFilter] = useState<'all' | TradeSource>('all')
  const matchesFilter = (trade: Trade) => sourceFilter === 'all' || (trade.source ?? 'system') === sourceFilter
  const openPositions = todayTrades.filter((trade) => trade.outcome === 'open' && matchesFilter(trade))
  const getTradesForInstrument = (instrument: Instrument) => todayTrades.filter((trade) => trade.instrument === instrument && matchesFilter(trade))
  const rationale = (instrument: Instrument) => data?.snapshot ? calculateVerdict(data.snapshot, instrument) as Row : undefined
  const rows = [...trades].filter(matchesFilter).sort((a, b) => `${b.trade_date}-${b.instrument}`.localeCompare(`${a.trade_date}-${a.instrument}`))

  return <section className="phase-view trade-page">
    <div className="review-section-head"><div><p className="eyebrow">Execution desk</p><h2>Trade</h2></div><PhaseAside capturedAt={tradeDate} source="manual" /></div>
    {error && <p className="history-empty">Unable to load trade data right now.</p>}
    <div className="source-toggle" role="group" aria-label="Filter by trade source">
      <button type="button" className={sourceFilter === 'all' ? 'is-active' : ''} aria-pressed={sourceFilter === 'all'} onClick={() => setSourceFilter('all')}>All trades</button>
      <button type="button" className={sourceFilter === 'system' ? 'is-active' : ''} aria-pressed={sourceFilter === 'system'} onClick={() => setSourceFilter('system')}>System</button>
      <button type="button" className={sourceFilter === 'manual' ? 'is-active' : ''} aria-pressed={sourceFilter === 'manual'} onClick={() => setSourceFilter('manual')}>Manual</button>
    </div>
    <div className="trade-grid">
      {(['NIFTY', 'SENSEX'] as Instrument[]).flatMap((instrument) => {
        const instrumentTrades = getTradesForInstrument(instrument)
        if (instrumentTrades.length === 0) return [<TradeCard key={instrument} instrument={instrument} legs={[]} rationale={rationale(instrument)} mutate={() => { void mutate() }} />]
        return instrumentTrades.map((trade) => <TradeCard key={String(trade.id)} instrument={instrument} trade={trade} legs={data?.legs.filter((leg) => leg.auto_trade_id === trade.id) ?? []} rationale={rationale(instrument)} mutate={() => { void mutate() }} />)
      })}
    </div>
    <section className="trade-log">
      <div className="review-section-head"><div><p className="eyebrow">All recorded outcomes</p><h2>Trade Log</h2></div></div>
      <div className="trade-summary-tiles">
        <div className="field-card"><span>Total trades</span><strong>{summary.total}</strong></div>
        <div className="field-card"><span>Target hit count</span><strong>{summary.targets}</strong></div>
        <div className="field-card"><span>Stop-loss hit count</span><strong>{summary.stops}</strong></div>
        <div className="field-card"><span>Win rate %</span><strong>{summary.winRate.toFixed(0)}%</strong></div>
        <div className="field-card"><span>Total P&amp;L</span><strong><em className={`trade-figure ${summary.pnl >= 0 ? 'positive' : 'negative'}`}>{fmt.pnl(summary.pnl)}</em></strong></div>
        <div className="field-card field-card-accent"><span>Open positions</span><strong>{openPositions.length}</strong></div>
      </div>
      <div className="trade-summary-tiles">
        <div className="field-card"><span>Average profit</span><strong><em className="trade-figure positive">{summary.avgProfit > 0 ? fmt.pnl(summary.avgProfit) : 'Not available'}</em></strong></div>
        <div className="field-card"><span>Average loss</span><strong><em className="trade-figure negative">{summary.avgLoss < 0 ? fmt.pnl(summary.avgLoss) : 'Not available'}</em></strong></div>
        <div className="field-card"><span>Avg risk-reward</span><strong>{summary.riskReward != null ? `1 : ${fmt.ratio(summary.riskReward)}` : 'Not available'}</strong></div>
      </div>
      {summary.eodUnresolvedCount > 0 && <p className="history-empty">{summary.eodUnresolvedCount} trade{summary.eodUnresolvedCount === 1 ? '' : 's'} closed at market close without hitting a target or stop — counted above by actual profit or loss, not as a clean hit.</p>}
      {openPositions.length > 0 && <div className="trade-open-positions">
        <p className="eyebrow">Open positions</p>
        <div className="trade-open-grid">
          {openPositions.map((trade) => {
            const entry = trade.entry_premium != null ? Number(trade.entry_premium) : null
            const current = Number(trade.net_premium) || 0
            const isNetSeller = trade.strategy === 'Credit Spread' || trade.strategy === 'Iron Condor'
            const targetCons = trade.target_price_cons != null ? Number(trade.target_price_cons) : null
            const stopCons = trade.stop_price_cons != null ? Number(trade.stop_price_cons) : null
            const distance = targetCons != null ? Math.abs(current - targetCons) : null
            let progressPct = 50
            if (targetCons != null && stopCons != null && targetCons !== stopCons) {
              progressPct = Math.max(0, Math.min(100, ((current - stopCons) / (targetCons - stopCons)) * 100))
            }
            return <div className="trade-open-card" key={String(trade.id)}>
              <div className="trade-open-head">
                <div><b>{trade.instrument}</b> <span className={`source-badge source-${trade.source ?? 'system'}`}>{sourceLabel(trade.source)}</span><span>{String(trade.strategy)}</span></div>
                <span className={`trade-status sync-${trade.state === 'locked_conservative' ? 'warning' : 'accent'}`}>{stateLabel(trade.state)}</span>
              </div>
              <div className="trade-open-figures">
                <div><span>Entry premium</span><b>{fmt.rupees(entry)}</b></div>
                <div><span>Current premium</span><b>{fmt.rupees(current)}</b></div>
                {distance != null && <div><span>Distance to target</span><b>{`${fmt.rupees(distance)} away`}</b></div>}
              </div>
              <Progress value={progressPct} label="Progress to target" />
              <div className="trade-open-levels"><span>Stop {fmt.rupees(stopCons)}</span><span>Target (cons.) {fmt.rupees(targetCons)}</span></div>
              <p className="trade-open-checked">Last checked {trade.last_checked_at ? formatTime(trade.last_checked_at) : 'Not available'} — rechecks every 5 min</p>
            </div>
          })}
        </div>
      </div>}
      {rows.length === 0 ? <p className="history-empty">No past trades recorded yet.</p> : <div className="trade-log-scroll"><table className="trade-log-table">
        <caption>Every recorded trade, newest first{sourceFilter === 'all' ? '' : ` · ${sourceFilter === 'manual' ? 'manual' : 'system'} trades only`}</caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Instrument</th>
            <th scope="col">Strategy</th>
            <th scope="col" className="num">Net premium</th>
            <th scope="col">Outcome</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((trade) => <tr key={String(trade.id)}>
            <td>{trade.trade_date}</td>
            <td>{trade.instrument} <span className={`source-badge source-${trade.source ?? 'system'}`}>{sourceLabel(trade.source)}</span></td>
            <td>{String(trade.strategy)}</td>
            <td className="num">{fmt.rupees(Math.abs(Number(trade.net_premium) || 0))} {trade.is_credit ? 'received' : 'paid'}</td>
            <td><span className={`trade-status sync-${statusTone(trade)}`}>{trade.outcome === 'open' ? stateLabel(trade.state) : statusLabel(trade)}</span></td>
          </tr>)}
        </tbody>
      </table></div>}
    </section>
    <Disclaimer capturedAt={fmt.timeIST(new Date())} />
    <GexView />
  </section>
}
