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
    ['India VIX', 'india_vix'], ['VIX change', 'india_vix_change_pct', true], ['GIFT Nifty gap', 'gift_nifty_gap_pct', true], ['Expiry', 'days_to_expiry_nifty'], ['Expiry', 'days_to_expiry_sensex'], ['5D average move', 'avg_move_5d_nifty'], ['5D average move', 'avg_move_5d_sensex'], ['Prior day', 'prev_day_change_pct_nifty', true], ['Prior day', 'prev_day_change_pct_sensex', true], ['Chart support', 'chart_support_nifty'], ['Chart resistance', 'chart_resistance_nifty'], ['Chart support', 'chart_support_sensex'], ['Chart resistance', 'chart_resistance_sensex'], ['OI support', 'oi_support_nifty'], ['OI resistance', 'oi_resistance_nifty'], ['OI support', 'oi_support_sensex'], ['OI resistance', 'oi_resistance_sensex'], ['Support OI action', 'oi_change_support_nifty'], ['Resistance OI action', 'oi_change_resistance_nifty'],
  ].map(([label, key, pct]) => ({ label, key, pct: Boolean(pct) })),
  open: [
    ['Opening points', 'nifty_opening_points'], ['Advance / decline', 'advance_decline_ratio'], ['Previous close', 'prev_close_nifty'], ['Previous close', 'prev_close_sensex'], ['Gap points', 'gap_points_nifty'], ['Gap points', 'gap_points_sensex'], ['ATM IV', 'atm_iv_nifty', true], ['ATM IV', 'atm_iv_sensex', true], ['Straddle', 'atm_straddle_price_nifty'], ['Straddle', 'atm_straddle_price_sensex'], ['Delta', 'atm_straddle_delta_nifty'], ['Delta', 'atm_straddle_delta_sensex'], ['Theta', 'atm_straddle_theta_nifty'], ['Theta', 'atm_straddle_theta_sensex'], ['PCR', 'pcr_nifty'], ['PCR', 'pcr_sensex'], ['Max pain', 'max_pain_nifty'], ['Max pain', 'max_pain_sensex'],
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
  const sections = [
    { title: 'Gap %', subtitle: 'Overnight move → opening bias', rows: [['> 0.75%', 'Strong gap up', 'Expect wider opening range'], ['0.25%–0.75%', 'Normal gap up', 'Trade with confirmation'], ['−0.25%–0.25%', 'Flat', 'Wait for direction'], ['−0.75%–−0.25%', 'Normal gap down', 'Trade with confirmation'], ['< −0.75%', 'Strong gap down', 'Expect wider opening range']] },
    { title: 'VIX level', subtitle: 'Volatility → strike selection', rows: [['Below 11', 'Theta-heavy', 'ATM only on strong momentum'], ['11–14', 'Normal', 'ATM / ITM by setup'], ['14–18', 'Elevated', 'Prefer 1-strike ITM'], ['18–22', 'High crush risk', '2-strike ITM or skip'], ['Above 22', 'Avoid fresh buys', 'Wait for normalization']] },
    { title: 'PCR', subtitle: 'Positioning → directional context', rows: [['> 1.3', 'Oversold / bullish', 'Look for upside confirmation'], ['0.8–1.3', 'Neutral', 'Use levels and breadth'], ['< 0.8', 'Overbought / bearish', 'Look for downside confirmation']] },
    { title: 'Max pain', subtitle: 'Spot vs strike → expiry pull', rows: [['Above by > 0.3%', 'Downward pull', 'Mean reversion risk'], ['Within ±0.3%', 'Pinning likely', 'Expect range behavior'], ['Below by > 0.3%', 'Upward pull', 'Mean reversion risk']] },
    { title: 'Open interest', subtitle: 'OI change → level quality', rows: [['Support + Addition', 'Support strengthening', 'Breakdown less likely'], ['Support + Unwinding', 'Support weakening', 'Breakdown risk'], ['Resistance + Addition', 'Resistance strengthening', 'Breakout less likely'], ['Resistance + Unwinding', 'Resistance weakening', 'Breakout risk']] },
    { title: 'DTE', subtitle: 'Expiry distance → gamma risk', rows: [['≤ 1', 'High gamma risk', 'Prefer spreads'], ['2–4', 'Normal', 'Standard setup'], ['> 4', 'Lower gamma risk', 'Naked options viable with conviction']] },
  ]
  return <section className="phase-view rules-view"><div className="phase-intro"><div><p className="eyebrow">Quick reference · condition → reading → action</p><h2>Rules engine</h2><p>Use the source rules as a fast decision aid. They frame bias and risk; they do not predict the market.</p></div></div><div className="rule-grid">{sections.map((section) => <article className="rule-table" key={section.title}><div className="rule-table-head"><div><strong>{section.title}</strong><span>{section.subtitle}</span></div><BookOpen size={16} /></div><div className="rule-table-labels"><span>Condition</span><span>Reading</span><span>Action</span></div>{section.rows.map(([condition, reading, action]) => <div className="rule-table-row" key={`${condition}-${reading}`}><b>{condition}</b><span>{reading}</span><span>{action}</span></div>)}</article>)}</div><div className="strategy-strip"><strong>Strategy overrides</strong><span>High-impact event → caution</span><span>DTE ≤ 1 → force spread / iron condor</span><span>Trend + high IV → debit spread</span><span>Range + high IV → credit spread</span></div><a className="detailed-read-link" href="/rules">Open detailed read <ChevronRight size={15} /></a></section>
}

function HistoryView() {
  return <section className="phase-view"><div className="phase-intro"><div><p className="eyebrow">Prior sessions</p><h2>History</h2><p>Compare prior snapshots to understand how the platform&apos;s read changes across sessions.</p></div></div><div className="history-list">{historyRows.map((item) => <article className="history-row" key={item.date}><div><strong>{item.date}</strong><span>{item.label}</span></div><b>{item.read}</b><span className={item.move.startsWith('+') ? 'positive' : 'negative'}>{item.move}</span><span>VIX {item.vix}</span><ChevronRight size={16} /></article>)}</div></section>
}

function PhaseView({ phase, row }: { phase: Phase; row: Row | null }) {
  const fields = phaseFields[phase]; const available = fields.filter((f) => row?.[f.key] != null && row?.[f.key] !== '').length
  const intros: Record<Phase, [string, string]> = { premarket: ['Build a market thesis before the bell', 'Use volatility, overnight pricing and positioning to define scenarios and invalidation levels.'], open: ['Read the opening auction, not just the gap', 'Opening breadth, implied volatility and the straddle tell you whether price discovery is orderly or unstable.'], mid: ['Track whether the opening thesis is holding', 'Compare intraday breadth, volatility and price with the morning hypothesis. Missing values mean the external source has not supplied this phase.'], post: ['Close the loop on the session', 'Turn the day into a repeatable review: what worked, what failed and what to carry forward.'] }
  const commonKeys = ['india_vix', 'india_vix_change_pct', 'gift_nifty_gap_pct', 'advance_decline_ratio', 'mid_market_status', 'mid_advance_decline_ratio', 'mid_india_vix', 'mid_market_notes', 'post_market_status', 'post_advance_decline_ratio', 'post_market_notes']
  const common = fields.filter((f) => commonKeys.includes(f.key))
  const nifty = fields.filter((f) => f.key.toLowerCase().includes('nifty') || f.key.includes('pcr_nifty') || f.key.includes('max_pain_nifty'))
  const sensex = fields.filter((f) => f.key.toLowerCase().includes('sensex') || f.key.includes('pcr_sensex') || f.key.includes('max_pain_sensex'))
  const renderGroup = (title: string, group: typeof fields) => <section className={`metric-group ${title === 'Common market data' ? 'common-group' : ''}`}><div className="group-heading">{title !== 'Common market data' && <h3>{title}</h3>}<span>{group.filter((f) => row?.[f.key] != null && row?.[f.key] !== '').length}/{group.length}</span></div><div className="field-grid">{group.map((f) => <div className={`field-card ${row?.[f.key] == null ? 'is-empty' : ''}`} key={f.key}><span>{f.label}</span><strong className={tone(row, f.key)}>{value(row, f.key, f.pct)}</strong></div>)}</div></section>
  return <section className="phase-view"><div className="phase-context"><span>{available}/{fields.length} fields</span><span>{Math.round(available / fields.length * 100)}% coverage</span><span>{intros[phase][0]}</span></div><div className="metric-groups">{renderGroup('Common market data', common)}{renderGroup('Nifty', nifty)}{renderGroup('Sensex', sensex)}</div></section>
}
export default function Dashboard() {
  const [phase, setPhase] = useState<Phase>('premarket'); const [dark, setDark] = useState(false); const [navOpen, setNavOpen] = useState(true); const row = visualRow
  useEffect(() => { document.documentElement.classList.toggle('dark', dark) }, [dark])
  return <main className="app-shell"><header className="topbar"><button className="icon-button mobile-menu" onClick={() => setNavOpen(!navOpen)} aria-label="Toggle navigation"><Menu size={18} /></button><div className="brand-mark"><div className="brand-symbol"><BarChart3 size={16} /></div><div><strong>MARKETVIEW</strong><span>TRADE ANALYSIS PLATFORM</span></div></div><div className="topbar-meta"><button className="icon-button" onClick={() => setDark(!dark)} aria-label="Toggle theme">{dark ? <Sun size={16} /> : <Moon size={16} />}</button></div></header><div className="workspace"><aside className={`sidebar ${navOpen ? '' : 'closed'}`}><div className="side-label">SESSION MAP</div>{phases.map(({ id, label, subtitle, icon: Icon }) => <button key={id} className={`phase-nav ${phase === id ? 'active' : ''}`} onClick={() => setPhase(id)}><Icon size={17} /><span><strong>{label}</strong><small>{subtitle}</small></span><ChevronRight size={14} /></button>)}<button className="phase-nav refresh-nav" onClick={() => location.reload()}><RefreshCw size={17} /><span><strong>Refresh</strong><small>Reload preview</small></span></button><div className="side-rule" /></aside><div className="content"><div className="content-head"><div><p className="eyebrow">{row?.trade_date ?? 'No current row'} · {row?.day_name ?? 'Session date'}</p></div>{phase !== 'rules' && phase !== 'history' && <div className="interpretation-rail"><BookOpen size={15} /><span><strong>Read</strong> {phase === 'premarket' ? 'common volatility first, then compare Nifty and Sensex levels.' : phase === 'open' ? 'breadth first, then compare each index response.' : phase === 'mid' ? 'the shared context, then check index confirmation.' : 'the shared outcome, then compare index closes.'}</span></div>}</div>{phase === 'rules' ? <RulesView /> : phase === 'history' ? <HistoryView /> : <PhaseView phase={phase} row={row} />}<footer className="data-footer"><span><CheckCircle2 size={14} /> Visual preview data</span><span>Snapshot: {row.trade_date}</span></footer></div></div></main>
}
