'use client'

import { useEffect, useState } from 'react'
import { Activity, BarChart3, BookOpen, CheckCircle2, ChevronRight, Clock3, Gauge, Layers3, Menu, Moon, RefreshCw, Sun } from 'lucide-react'
type Row = Record<string, string | number | null>
type Phase = 'premarket' | 'open' | 'mid' | 'post' | 'rules' | 'history'
const phases = [
  { id: 'premarket' as Phase, label: 'Pre-market', subtitle: 'Overnight setup', icon: Clock3 },
  { id: 'open' as Phase, label: 'Market open', subtitle: 'Opening auction', icon: Activity },
  { id: 'mid' as Phase, label: 'Mid-market', subtitle: 'Intraday read', icon: Gauge },
  { id: 'post' as Phase, label: 'Post-market', subtitle: 'Review & learn', icon: Layers3 },
  { id: 'rules' as Phase, label: 'Rules engine', subtitle: 'Interpretation guide', icon: BookOpen },
  { id: 'history' as Phase, label: 'History', subtitle: 'Prior snapshots', icon: BarChart3 },
]
const phaseFields: Record<Phase, { label: string; key: string; pct?: boolean }[]> = {
  premarket: [
    ['India VIX', 'india_vix'], ['VIX change', 'india_vix_change_pct', true], ['GIFT Nifty gap', 'gift_nifty_gap_pct', true], ['Nifty expiry', 'days_to_expiry_nifty'], ['Sensex expiry', 'days_to_expiry_sensex'], ['Nifty 5D average move', 'avg_move_5d_nifty'], ['Sensex 5D average move', 'avg_move_5d_sensex'], ['Nifty prior day', 'prev_day_change_pct_nifty', true], ['Sensex prior day', 'prev_day_change_pct_sensex', true], ['Nifty chart support', 'chart_support_nifty'], ['Nifty chart resistance', 'chart_resistance_nifty'], ['Sensex chart support', 'chart_support_sensex'], ['Sensex chart resistance', 'chart_resistance_sensex'], ['Nifty OI support', 'oi_support_nifty'], ['Nifty OI resistance', 'oi_resistance_nifty'], ['Sensex OI support', 'oi_support_sensex'], ['Sensex OI resistance', 'oi_resistance_sensex'], ['Support OI action', 'oi_change_support_nifty'], ['Resistance OI action', 'oi_change_resistance_nifty'],
  ].map(([label, key, pct]) => ({ label, key, pct: Boolean(pct) })),
  open: [
    ['Nifty opening points', 'nifty_opening_points'], ['Advance / decline', 'advance_decline_ratio'], ['Nifty previous close', 'prev_close_nifty'], ['Sensex previous close', 'prev_close_sensex'], ['Nifty gap points', 'gap_points_nifty'], ['Sensex gap points', 'gap_points_sensex'], ['Nifty ATM IV', 'atm_iv_nifty', true], ['Sensex ATM IV', 'atm_iv_sensex', true], ['Nifty ATM straddle', 'atm_straddle_price_nifty'], ['Sensex ATM straddle', 'atm_straddle_price_sensex'], ['Nifty straddle delta', 'atm_straddle_delta_nifty'], ['Sensex straddle delta', 'atm_straddle_delta_sensex'], ['Nifty straddle theta', 'atm_straddle_theta_nifty'], ['Sensex straddle theta', 'atm_straddle_theta_sensex'], ['Nifty PCR', 'pcr_nifty'], ['Sensex PCR', 'pcr_sensex'], ['Nifty max pain', 'max_pain_nifty'], ['Sensex max pain', 'max_pain_sensex'],
  ].map(([label, key, pct]) => ({ label, key, pct: Boolean(pct) })),
  mid: [
    ['Mid-market status', 'mid_market_status'], ['Nifty intraday change', 'mid_nifty_change_pct', true], ['Sensex intraday change', 'mid_sensex_change_pct', true], ['Mid-market breadth', 'mid_advance_decline_ratio'], ['Mid-market PCR', 'mid_pcr_nifty'], ['Mid-market VIX', 'mid_india_vix'], ['Mid-market note', 'mid_market_notes'],
  ].map(([label, key, pct]) => ({ label, key, pct: Boolean(pct) })),
  post: [
    ['Post-market status', 'post_market_status'], ['Nifty close', 'post_close_nifty'], ['Sensex close', 'post_close_sensex'], ['Nifty closing change', 'post_change_pct_nifty', true], ['Sensex closing change', 'post_change_pct_sensex', true], ['Final breadth', 'post_advance_decline_ratio'], ['Post-market note', 'post_market_notes'], 
  ].map(([label, key, pct]) => ({ label, key, pct: Boolean(pct) })),
}
const visualRow: Row = {
  trade_date: '2026-08-12', day_name: 'Wednesday', event_today: 'US CPI at 6:00 PM IST',
  india_vix: 11.9, india_vix_change_pct: -2.3, gift_nifty_gap_pct: 0.79, days_to_expiry_nifty: 8, days_to_expiry_sensex: 8,
  avg_move_5d_nifty: 132.4, avg_move_5d_sensex: 418.6, prev_day_change_pct_nifty: 0.34, prev_day_change_pct_sensex: 0.28,
  chart_support_nifty: 24320, chart_support_sensex: 77600, chart_resistance_nifty: 24680, chart_resistance_sensex: 78800,
  oi_support_nifty: 24400, oi_support_sensex: 78000, oi_change_support_nifty: 'Addition', oi_change_support_sensex: 'Addition',
  oi_resistance_nifty: 24600, oi_resistance_sensex: 78800, oi_change_resistance_nifty: 'Unwinding', oi_change_resistance_sensex: 'Unwinding',
  nifty_opening_points: 0.75, advance_decline_ratio: '38 advances / 12 declines', prev_close_nifty: 24471.7, prev_close_sensex: 78154.25,
  gap_points_nifty: 19.4, gap_points_sensex: 109.08, atm_iv_nifty: 11, atm_iv_sensex: 15.4, atm_straddle_price_nifty: 279.55,
  atm_straddle_price_sensex: 563, atm_straddle_delta_nifty: 0.02, atm_straddle_delta_sensex: 0.06, atm_straddle_theta_nifty: -22,
  atm_straddle_theta_sensex: -222, pcr_nifty: 0.86, pcr_sensex: 0.75, max_pain_nifty: 24500, max_pain_sensex: 78200,
  mid_market_status: 'Holding above opening range', mid_nifty_change_pct: 0.62, mid_sensex_change_pct: 0.48,
  mid_advance_decline_ratio: '31 advances / 19 declines', mid_pcr_nifty: 0.91, mid_india_vix: 11.7, mid_market_notes: 'Breadth remains constructive; watch 24,600 resistance.',
  post_market_status: 'Closed positive', post_close_nifty: 24582.4, post_close_sensex: 78422.1, post_change_pct_nifty: 0.45,
  post_change_pct_sensex: 0.34, post_advance_decline_ratio: '34 advances / 16 declines', post_market_notes: 'Support held and volatility compressed into the close.'
}

function value(row: Row | null, key: string, pct = false) { const v = row?.[key]; if (v === null || v === undefined || v === '') return '—'; return `${pct && Number(v) > 0 ? '+' : ''}${v}${pct ? '%' : ''}` }
function tone(row: Row | null, key: string) { const n = Number(row?.[key]); return Number.isNaN(n) || n === 0 ? '' : n > 0 ? 'positive' : 'negative' }
const historyRows = [
  { date: '2026-08-12', label: 'Wednesday', read: 'Constructive open', move: '+0.45%', vix: '11.9' },
  { date: '2026-08-11', label: 'Tuesday', read: 'Range expansion', move: '-0.28%', vix: '12.4' },
  { date: '2026-08-08', label: 'Friday', read: 'Support held', move: '+0.62%', vix: '12.1' },
]

function RulesView() {
  const rules = [
    ['Breadth confirms price', 'A positive index move is stronger when advances outnumber declines. Weak breadth turns a gap into a fragile signal.'],
    ['VIX sets the range', 'Rising volatility implies wider expected movement. Reduce conviction when price direction and volatility disagree.'],
    ['PCR needs context', 'PCR below 1 can signal call-side pressure; compare it with price, max pain, and OI levels before acting.'],
    ['Levels create invalidation', 'Treat chart and OI support/resistance as zones. A clean break changes the thesis; a rejection supports mean reversion.'],
  ]
  return <section className="phase-view"><div className="phase-intro"><div><p className="eyebrow">Interpretation framework</p><h2>Rules engine</h2><p>Use these rules to turn raw market fields into a structured read, not a prediction.</p></div></div><div className="rule-grid">{rules.map(([title, copy]) => <article className="rule-card" key={title}><BookOpen size={18} /><div><strong>{title}</strong><p>{copy}</p></div></article>)}</div></section>
}

function HistoryView() {
  return <section className="phase-view"><div className="phase-intro"><div><p className="eyebrow">Prior sessions</p><h2>History</h2><p>Compare prior snapshots to understand how the platform&apos;s read changes across sessions.</p></div></div><div className="history-list">{historyRows.map((item) => <article className="history-row" key={item.date}><div><strong>{item.date}</strong><span>{item.label}</span></div><b>{item.read}</b><span className={item.move.startsWith('+') ? 'positive' : 'negative'}>{item.move}</span><span>VIX {item.vix}</span><ChevronRight size={16} /></article>)}</div></section>
}

function PhaseView({ phase, row }: { phase: Phase; row: Row | null }) {
  const fields = phaseFields[phase]; const available = fields.filter((f) => row?.[f.key] != null && row?.[f.key] !== '').length
  const intros: Record<Phase, [string, string]> = { premarket: ['Build a market thesis before the bell', 'Use volatility, overnight pricing and positioning to define scenarios and invalidation levels.'], open: ['Read the opening auction, not just the gap', 'Opening breadth, implied volatility and the straddle tell you whether price discovery is orderly or unstable.'], mid: ['Track whether the opening thesis is holding', 'Compare intraday breadth, volatility and price with the morning hypothesis. Missing values mean the external source has not supplied this phase.'], post: ['Close the loop on the session', 'Turn the day into a repeatable review: what worked, what failed and what to carry forward.'] }
  return <section className="phase-view"><div className="phase-context"><span>{available}/{fields.length} fields</span><span>{Math.round(available / fields.length * 100)}% coverage</span><span>{intros[phase][0]}</span></div><div className="interpretation"><BookOpen size={18} /><div><strong>How to interpret this phase</strong><p>{phase === 'premarket' ? 'A rising VIX with a negative overnight gap argues for wider ranges. OI additions at support or resistance help define where price may stall.' : phase === 'open' ? 'A gap matters when breadth confirms it. Read PCR and ATM IV together; price up with weak breadth is a fragile signal.' : phase === 'mid' ? 'Look for confirmation or divergence from the morning thesis. Treat unavailable fields as unavailable, not as zero.' : 'Separate process from outcome. Record the close and breadth before evaluating the trade idea.'}</p></div></div><div className="field-grid">{fields.map((f) => <div className={`field-card ${row?.[f.key] == null ? 'is-empty' : ''}`} key={f.key}><span>{f.label}</span><strong className={tone(row, f.key)}>{value(row, f.key, f.pct)}</strong></div>)}</div></section>
}
export default function Dashboard() {
  const [phase, setPhase] = useState<Phase>('premarket'); const [dark, setDark] = useState(false); const [navOpen, setNavOpen] = useState(true); const row = visualRow
  useEffect(() => { document.documentElement.classList.toggle('dark', dark) }, [dark])
  return <main className="app-shell"><header className="topbar"><button className="icon-button mobile-menu" onClick={() => setNavOpen(!navOpen)} aria-label="Toggle navigation"><Menu size={18} /></button><div className="brand-mark"><div className="brand-symbol"><BarChart3 size={16} /></div><div><strong>MARKETVIEW</strong><span>TRADE ANALYSIS PLATFORM</span></div></div><div className="topbar-meta"><span className="live-dot" /> MARKET SESSION <button className="icon-button" onClick={() => setDark(!dark)} aria-label="Toggle theme">{dark ? <Sun size={16} /> : <Moon size={16} />}</button></div></header><div className="workspace"><aside className={`sidebar ${navOpen ? '' : 'closed'}`}><div className="side-label">SESSION MAP</div>{phases.map(({ id, label, subtitle, icon: Icon }) => <button key={id} className={`phase-nav ${phase === id ? 'active' : ''}`} onClick={() => setPhase(id)}><Icon size={17} /><span><strong>{label}</strong><small>{subtitle}</small></span><ChevronRight size={14} /></button>)}<div className="side-rule" /></aside><div className="content"><div className="content-head"><div><p className="eyebrow">{row?.trade_date ?? 'No current row'} · {row?.day_name ?? 'Session date'}</p></div><div className="head-actions"><button className="action-button" onClick={() => location.reload()}><RefreshCw size={15} /> Refresh</button></div></div>{phase === 'rules' ? <RulesView /> : phase === 'history' ? <HistoryView /> : <PhaseView phase={phase} row={row} />}<footer className="data-footer"><span><CheckCircle2 size={14} /> Visual preview data</span><span>Snapshot: {row.trade_date}</span></footer></div></div></main>
}
