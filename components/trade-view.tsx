'use client'

import { useMemo, useState } from 'react'
import useSWR from 'swr'
import { CheckCircle2, ArrowDown, RotateCcw } from 'lucide-react'
import { calculateVerdict } from '@/app/page'
import { createClient } from '@/lib/supabase/client'

type Row = Record<string, string | number | boolean | null>
type Instrument = 'NIFTY' | 'SENSEX'
type Trade = Row & { id: string; trade_date: string; instrument: Instrument; outcome: 'open' | 'target' | 'stop' }
type Leg = Row & { auto_trade_id: string; leg_key: string; side: 'Buy' | 'Sell'; strike: number | null; premium: number | null }

function todayIST() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

function formatTime(value: unknown) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true }).format(new Date(String(value)))
}

function statusLabel(outcome: Trade['outcome']) {
  return outcome === 'target' ? 'Target Hit' : outcome === 'stop' ? 'Stop-loss Hit' : 'Open'
}

function statusTone(outcome: Trade['outcome']) {
  return outcome === 'target' ? 'success' : outcome === 'stop' ? 'danger' : 'warning'
}

function TradeCard({ instrument, trade, legs, rationale, mutate }: { instrument: Instrument; trade?: Trade; legs: Leg[]; rationale?: Row; mutate: () => void }) {
  const [saving, setSaving] = useState(false)
  const supabase = useMemo(() => createClient(), [])
  const isOpen = trade?.outcome === 'open'
  const netPremium = trade?.net_premium != null ? Number(trade.net_premium) : legs.reduce((sum, leg) => sum + (Number(leg.premium) || 0) * (leg.side === 'Sell' ? 1 : -1), 0)
  const isCredit = trade?.is_credit === true || netPremium >= 0
  const record = async (outcome: 'target' | 'stop') => { if (!trade) return; setSaving(true); const { error } = await supabase.from('auto_trades').update({ outcome, outcome_at: new Date().toISOString() }).eq('id', trade.id); setSaving(false); if (!error) mutate() }
  const undo = async () => { if (!trade) return; setSaving(true); const { error } = await supabase.from('auto_trades').update({ outcome: 'open', outcome_at: null }).eq('id', trade.id); setSaving(false); if (!error) mutate() }

  if (!trade) return <article className="verdict-instrument">
    <div className="verdict-instrument-head"><h3>{instrument}</h3></div>
    <p className="history-empty">Not filled yet — the scheduled trade hasn&apos;t created an auto-trade row for today.</p>
  </article>

  return <article className="verdict-instrument">
    <div className="verdict-instrument-head">
      <h3>{instrument}</h3>
      <span className={`trade-status sync-${statusTone(trade.outcome)}`}>{statusLabel(trade.outcome)}</span>
    </div>
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
    </div>
    {isOpen ? (
      <div className="trade-actions">
        <button type="button" className="action-button" onClick={() => record('target')} disabled={saving}><CheckCircle2 size={14} /> Mark Target Hit</button>
        <button type="button" className="action-button" onClick={() => record('stop')} disabled={saving}><ArrowDown size={14} /> Mark Stop-loss Hit</button>
      </div>
    ) : (
      <div className="trade-confirmation">
        <span className={`sync-${statusTone(trade.outcome)}`}>✓ {statusLabel(trade.outcome)} — recorded at {formatTime(trade.outcome_at)}</span>
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
  const summary = useMemo(() => { const closed = trades.filter((trade) => trade.outcome !== 'open'); const targets = closed.filter((trade) => trade.outcome === 'target').length; const stops = closed.filter((trade) => trade.outcome === 'stop').length; return { total: closed.length, targets, stops, winRate: closed.length ? (targets / closed.length) * 100 : 0 } }, [trades])
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
      </div>
      {rows.length === 0 ? <p className="history-empty">No past trades recorded yet.</p> : <div className="history-list">
        <div className="history-row history-head trade-log-row" aria-hidden="true"><span>Date</span><span>Instrument</span><span>Strategy</span><span>Net Premium</span><span>Outcome</span></div>
        {rows.map((trade) => <article className="history-row trade-log-row" key={String(trade.id)}>
          <span>{trade.trade_date}</span>
          <span>{trade.instrument}</span>
          <span>{String(trade.strategy)}</span>
          <span>₹{Math.abs(Number(trade.net_premium) || 0).toFixed(1)} {trade.is_credit ? 'received' : 'paid'}</span>
          <span className={`trade-status sync-${statusTone(trade.outcome)}`}>{trade.outcome === 'open' ? 'Open' : statusLabel(trade.outcome)}</span>
        </article>)}
      </div>}
    </section>
  </section>
}
