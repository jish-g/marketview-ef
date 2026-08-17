'use client'

import { useMemo, useState } from 'react'
import useSWR from 'swr'
import { ArrowDown, ArrowUp, CheckCircle2, RotateCcw } from 'lucide-react'
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

function TradeCard({ instrument, trade, legs, rationale, mutate }: { instrument: Instrument; trade?: Trade; legs: Leg[]; rationale?: Row; mutate: () => void }) {
  const [saving, setSaving] = useState(false)
  const supabase = useMemo(() => createClient(), [])
  const isOpen = trade?.outcome === 'open'
  const netPremium = trade?.net_premium != null ? Number(trade.net_premium) : legs.reduce((sum, leg) => sum + (Number(leg.premium) || 0) * (leg.side === 'Sell' ? 1 : -1), 0)
  const isCredit = trade?.is_credit === true || netPremium >= 0
  const record = async (outcome: 'target' | 'stop') => { if (!trade) return; setSaving(true); const { error } = await supabase.from('auto_trades').update({ outcome, outcome_at: new Date().toISOString() }).eq('id', trade.id); setSaving(false); if (!error) mutate() }
  const undo = async () => { if (!trade) return; setSaving(true); const { error } = await supabase.from('auto_trades').update({ outcome: 'open', outcome_at: null }).eq('id', trade.id); setSaving(false); if (!error) mutate() }

  if (!trade) return <article className="trade-card trade-card-empty"><div><p className="eyebrow">{instrument}</p><h3>Not filled yet</h3><p>The scheduled trade has not created an auto-trade row for today.</p></div></article>

  return <article className="trade-card">
    <div className="trade-card-head"><div><p className="eyebrow">{instrument} · {trade.trade_date}</p><h3>{trade.strategy}</h3><p className="trade-rationale">{rationale ? `${String(rationale.bias ?? 'Neutral')} bias from the current market read; ${String(rationale.ivRead ?? 'current IV')} conditions support this setup.` : 'System-generated strategy from the latest market snapshot.'}</p></div><span className={`trade-status status-${trade.outcome}`}>{statusLabel(trade.outcome)}</span></div>
    <div className="trade-legs">{legs.length === 0 ? <p className="history-empty">No leg fills recorded.</p> : legs.map((leg) => <div className="trade-leg" key={String(leg.id ?? leg.leg_key)}><span className={`leg-badge ${leg.side === 'Buy' ? 'leg-buy' : 'leg-sell'}`}>{leg.side}</span><strong>{leg.strike ?? '—'}</strong><span className="trade-premium">₹{leg.premium != null ? Number(leg.premium).toFixed(1) : '—'}</span></div>)}</div>
    <div className="trade-net"><span>Net Premium ({isCredit ? 'received' : 'paid'})</span><strong>₹{Math.abs(netPremium).toFixed(1)}</strong></div>
    {isOpen ? <div className="trade-actions"><button type="button" onClick={() => record('target')} disabled={saving}><CheckCircle2 size={15} /> Mark Target Hit</button><button type="button" onClick={() => record('stop')} disabled={saving}><ArrowDown size={15} /> Mark Stop-loss Hit</button></div> : <div className="trade-confirmation"><span>{trade.outcome === 'target' ? '✓ Target Hit' : '✓ Stop-loss Hit'} — recorded at {formatTime(trade.outcome_at)}</span><button type="button" onClick={undo} disabled={saving}><RotateCcw size={13} /> Undo</button></div>}
  </article>
}

export default function TradePage() {
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

  return <main className="trade-page phase-view"><div className="review-section-head"><div><p className="eyebrow">Execution desk</p><h2>Trade</h2><p className="trade-subtitle">Today&apos;s system-filled positions and outcome tracking.</p></div><span>{tradeDate}</span></div>{error && <p className="history-empty">Unable to load trade data right now.</p>}<div className="trade-grid">{(['NIFTY', 'SENSEX'] as Instrument[]).map((instrument) => { const trade = getTrade(instrument); return <TradeCard key={instrument} instrument={instrument} trade={trade} legs={data?.legs.filter((leg) => leg.auto_trade_id === trade?.id) ?? []} rationale={rationale(instrument)} mutate={() => { void mutate() }} /> })}</div><section className="trade-log"><div className="review-section-head"><div><p className="eyebrow">All recorded outcomes</p><h2>Trade Log</h2></div></div><div className="trade-summary-tiles"><div><span>Total trades</span><strong>{summary.total}</strong></div><div><span>Target hit count</span><strong>{summary.targets}</strong></div><div><span>Stop-loss hit count</span><strong>{summary.stops}</strong></div><div><span>Win rate %</span><strong>{summary.winRate.toFixed(0)}%</strong></div></div><div className="trade-log-table-wrap"><table className="trade-log-table"><thead><tr><th>Date</th><th>Instrument</th><th>Strategy</th><th>Net Premium</th><th>Outcome</th></tr></thead><tbody>{rows.map((trade) => <tr key={String(trade.id)}><td>{trade.trade_date}</td><td>{trade.instrument}</td><td>{trade.strategy}</td><td>₹{Math.abs(Number(trade.net_premium) || 0).toFixed(1)} {trade.is_credit ? 'received' : 'paid'}</td><td><span className={`trade-status status-${trade.outcome}`}>{trade.outcome === 'open' ? '— Open' : statusLabel(trade.outcome)}</span></td></tr>)}</tbody></table>{rows.length === 0 && <p className="history-empty">No past trades recorded yet.</p>}</div></section></main>
}
