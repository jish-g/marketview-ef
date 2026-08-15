'use client'

import { useEffect, useMemo, useState } from 'react'
import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'
import { Activity, AlertTriangle, ArrowDown, ArrowUp, BarChart3, BookOpen, CheckCircle2, ChevronRight, Clock3, Gauge, Info, Layers3, Menu, Moon, RefreshCw, Sun } from 'lucide-react'
type Row = Record<string, string | number | null>
type Phase = 'premarket' | 'open' | 'verdict' | 'mid' | 'post' | 'rules' | 'history'
const phases = [
  { id: 'premarket' as Phase, label: 'Pre-market', subtitle: 'Overnight setup', icon: Clock3 },
  { id: 'open' as Phase, label: 'Market open', subtitle: 'Opening auction', icon: Activity },
  { id: 'verdict' as Phase, label: 'Verdict', subtitle: 'Strategy selection', icon: CheckCircle2 },
  { id: 'mid' as Phase, label: 'Mid-market', subtitle: 'Intraday read', icon: Gauge },
  { id: 'post' as Phase, label: 'Post-market', subtitle: 'Review & learn', icon: Layers3 },
  { id: 'rules' as Phase, label: 'Rules engine', subtitle: 'Interpretation guide', icon: BookOpen },
  { id: 'history' as Phase, label: 'History', subtitle: 'Prior snapshots', icon: BarChart3 },
]
const phaseFields: Record<Phase, { label: string; key: string; pct?: boolean }[]> = {
  premarket: [
    ['Event today', 'event_today'], ['India VIX', 'india_vix'], ['GIFT Nifty gap', 'gift_nifty_gap_pct', true], ['Expiry', 'days_to_expiry_nifty'], ['Expiry', 'days_to_expiry_sensex'], ['5D average move', 'avg_move_5d_nifty'], ['5D average move', 'avg_move_5d_sensex'], ['Prior day', 'prev_day_change_pct_nifty', true], ['Prior day', 'prev_day_change_pct_sensex', true], ['Chart Support (1D Pivot)', 'chart_support_nifty'], ['Chart Resistance (1D Pivot)', 'chart_resistance_nifty'], ['Chart Support (1D Pivot)', 'chart_support_sensex'], ['Chart Resistance (1D Pivot)', 'chart_resistance_sensex'], ['OI support', 'oi_support_nifty'], ['OI resistance', 'oi_resistance_nifty'], ['OI support', 'oi_support_sensex'], ['OI resistance', 'oi_resistance_sensex'],
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
  gap_points_nifty: 19.4, gap_points_sensex: 109.08, atm_iv_nifty: 25.8, atm_iv_sensex: 28.4, atm_straddle_price_nifty: 279.55,
  atm_straddle_price_sensex: 563, atm_straddle_delta_nifty: 0.02, atm_straddle_delta_sensex: 0.06, atm_straddle_theta_nifty: -22,
  atm_straddle_theta_sensex: -222, pcr_nifty: 0.86, pcr_sensex: 0.75, max_pain_nifty: 24500, max_pain_sensex: 78200,
  mid_market_status: 'Holding above opening range', mid_nifty_change_pct: 0.62, mid_sensex_change_pct: 0.48,
  mid_advance_decline_ratio: '31 advances / 19 declines', mid_pcr_nifty: 0.91, mid_india_vix: 11.7, mid_market_notes: 'Breadth remains constructive; watch 24,600 resistance.',
  mid_atm_iv_nifty: 27.1, mid_atm_iv_sensex: 30.2, mid_straddle_nifty: 298.4, mid_straddle_sensex: 589.5, mid_bias: 'Constructive but selective', mid_strategy: 'Prefer defined-risk longs while Nifty holds 24,400.',
  post_market_status: 'Closed positive', post_close_nifty: 24582.4, post_close_sensex: 78422.1, post_change_pct_nifty: 0.45, post_target_hit_nifty: true, post_sl_hit_nifty: false, post_target_hit_sensex: false, post_sl_hit_sensex: false, fii_dii_net_flow: 'FII −₹420 cr · DII +₹680 cr',
  post_change_pct_sensex: 0.34, post_advance_decline_ratio: '34 advances / 16 declines', post_market_notes: 'Support held and volatility compressed into the close.'
}

function value(row: Row | null, key: string, pct = false) { const v = row?.[key]; if (v === null || v === undefined || v === '') return '—'; const numeric = Number(v); const display = String(v); if (pct) return `${numeric > 0 ? '+' : ''}${display}%`; if (/days_to_expiry/.test(key)) return `${display} day${numeric === 1 ? '' : 's'}`; if (/points|support|resistance|prev_close|opening|straddle|max_pain|avg_move|theta|close/.test(key)) return display; return display }
function tone(row: Row | null, key: string) { const n = Number(row?.[key]); return Number.isNaN(n) || n === 0 ? '' : n > 0 ? 'positive' : 'negative' }
function gapBandLabel(gapPct: number) { if (gapPct > 0.75) return 'Strong Gap Up'; if (gapPct >= 0.25) return 'Normal Gap Up'; if (gapPct >= -0.25) return 'Flat'; if (gapPct >= -0.75) return 'Normal Gap Down'; return 'Strong Gap Down' }
function highImpactEvent(eventToday: string | null | undefined) { const text = String(eventToday ?? ''); if (!text.includes('(High')) return null; const match = text.match(/^(.*?)\s*\(High,\s*([^)]+)\)/); if (!match) return null; return { name: match[1].trim(), time: match[2].trim() } }

function RulesView() {
  const sections = [
    { title: 'Gap %', subtitle: 'Overnight move → opening bias', rows: [['> 0.75%', 'Strong gap up', 'Expect wider opening range'], ['0.25%–0.75%', 'Normal gap up', 'Trade with confirmation'], ['−0.25%–0.25%', 'Flat', 'Wait for direction'], ['−0.75%–−0.25%', 'Normal gap down', 'Trade with confirmation'], ['< −0.75%', 'Strong gap down', 'Expect wider opening range']] },
    { title: 'VIX level', subtitle: 'Volatility → strike selection', rows: [['Below 11', 'Theta-heavy', 'ATM only on strong momentum'], ['11–14', 'Normal', 'ATM / ITM by setup'], ['14–18', 'Elevated', 'Prefer 1-strike ITM'], ['18–22', 'High crush risk', '2-strike ITM or skip'], ['Above 22', 'Avoid fresh buys', 'Wait for normalization']] },
    { title: 'PCR', subtitle: 'Positioning → directional context', rows: [['> 1.3', 'Oversold / bullish', 'Look for upside confirmation'], ['0.8–1.3', 'Neutral', 'Use levels and breadth'], ['< 0.8', 'Overbought / bearish', 'Look for downside confirmation']] },
    { title: 'Max pain', subtitle: 'Spot vs strike → expiry pull', rows: [['Above by > 0.3%', 'Downward pull', 'Mean reversion risk'], ['Within ±0.3%', 'Pinning likely', 'Expect range behavior'], ['Below by > 0.3%', 'Upward pull', 'Mean reversion risk']] },
    { title: 'Open interest', subtitle: 'OI change → level quality', rows: [['Support + Addition', 'Support strengthening', 'Breakdown less likely'], ['Support + Unwinding', 'Support weakening', 'Breakdown risk'], ['Resistance + Addition', 'Resistance strengthening', 'Breakout less likely'], ['Resistance + Unwinding', 'Resistance weakening', 'Breakout risk']] },
    { title: 'DTE', subtitle: 'Expiry distance → gamma risk', rows: [['≤ 1', 'High gamma risk', 'Prefer spreads'], ['2–4', 'Normal', 'Standard setup'], ['> 4', 'Lower gamma risk', 'Naked options viable with conviction']] },
  ]
  return <section className="phase-view rules-view"><div className="phase-intro rules-header"><div><p className="eyebrow">Quick reference · condition → reading → action</p><h2>Rules engine</h2></div><a className="detailed-read-link" href="/rules">Detailed read <ChevronRight size={15} /></a></div><div className="rule-grid">{sections.map((section) => <article className="rule-table" key={section.title}><div className="rule-table-head"><div><strong>{section.title}</strong><span>{section.subtitle}</span></div><BookOpen size={16} /></div><div className="rule-table-labels"><span>Condition</span><span>Reading</span><span>Action</span></div>{section.rows.map(([condition, reading, action]) => <div className="rule-table-row" key={`${condition}-${reading}`}><b>{condition}</b><span>{reading}</span><span>{action}</span></div>)}</article>)}</div><div className="strategy-strip"><strong>Strategy overrides</strong><span>High-impact event → caution</span><span>DTE ≤ 1 → force spread / iron condor</span><span>Trend + high IV → debit spread</span><span>Range + high IV → credit spread</span></div></section>
}

function HistoryView({ rows }: { rows: Row[] | null | undefined }) {
  return <section className="phase-view"><div className="phase-intro"><div><p className="eyebrow">Prior sessions</p><h2>History</h2></div></div>{rows && rows.length > 0 && <div className="history-row history-head" aria-hidden="true"><span>Date</span><span>Gap read</span><span>Gap %</span><span>VIX</span><span>Close %</span><span /></div>}<div className="history-list">{!rows ? <p className="history-empty">Loading history…</p> : rows.length === 0 ? <p className="history-empty">No history rows available yet.</p> : rows.map((item) => { const gapRaw = item.gift_nifty_gap_pct; const gapNum = Number(gapRaw); const hasGap = gapRaw !== null && gapRaw !== undefined && gapRaw !== '' && !Number.isNaN(gapNum); return <article className="history-row" key={String(item.trade_date)}><div><strong>{item.trade_date}</strong><span>{item.day_name ?? '—'}</span></div><b>{hasGap ? gapBandLabel(gapNum) : '—'}</b><span className={tone(item, 'gift_nifty_gap_pct')}>{value(item, 'gift_nifty_gap_pct', true)}</span><span>VIX {value(item, 'india_vix')}</span><span className={tone(item, 'day_change_pct_nifty')}>Close {value(item, 'day_change_pct_nifty', true)}</span><ChevronRight size={16} /></article> })}</div></section>
}

type Instrument = 'NIFTY' | 'SENSEX'
type Strike = 'ATM' | 'ITM1' | 'ITM2'
const strikeDefaults: Record<Strike, number> = { ATM: 0.5, ITM1: 0.62, ITM2: 0.72 }
type StrategyChoice = 'Naked Call' | 'Naked Put' | 'Debit Spread' | 'Credit Spread' | 'Iron Condor'
const strategyChoices: StrategyChoice[] = ['Naked Call', 'Naked Put', 'Debit Spread', 'Credit Spread', 'Iron Condor']
function normalizeStrategy(strategy: string): StrategyChoice { if (strategy === 'Debit Call Spread' || strategy === 'Debit Put Spread') return 'Debit Spread'; if (strategy === 'Naked Call') return 'Naked Call'; if (strategy === 'Naked Put') return 'Naked Put'; if (strategy === 'Credit Spread') return 'Credit Spread'; return 'Iron Condor' }
function deltaForOffset(offset: number): number { const steps = [0.5, 0.7, 0.85, 0.95]; const step = steps[Math.min(Math.abs(offset), 3)]; if (offset === 0) return step; return offset > 0 ? step : Number((1 - step).toFixed(2)) }
type LegDef = { key: string; label: string; side: 'Buy' | 'Sell'; wing: number }
function legsForStrategy(strategy: StrategyChoice, bias: string): LegDef[] {
  if (strategy === 'Naked Call') return [{ key: 'p', label: 'Buy Call', side: 'Buy', wing: 0 }]
  if (strategy === 'Naked Put') return [{ key: 'p', label: 'Buy Put', side: 'Buy', wing: 0 }]
  if (strategy === 'Debit Spread') {
    const bearish = bias === 'Bearish'
    return [
      { key: 'lg', label: bearish ? 'Buy Put (ATM)' : 'Buy Call (ATM)', side: 'Buy', wing: 0 },
      { key: 's', label: bearish ? 'Sell Put (hedge)' : 'Sell Call (hedge)', side: 'Sell', wing: bearish ? -1 : 1 },
    ]
  }
  if (strategy === 'Credit Spread') return [
    { key: 's', label: 'Sell Call (ATM)', side: 'Sell', wing: 0 },
    { key: 'lg', label: 'Buy Call (hedge)', side: 'Buy', wing: 1 },
  ]
  return [
    { key: 'sc', label: 'Sell Call', side: 'Sell', wing: 1 },
    { key: 'lc', label: 'Buy Call (hedge)', side: 'Buy', wing: 2 },
    { key: 'sp', label: 'Sell Put', side: 'Sell', wing: -1 },
    { key: 'lp', label: 'Buy Put (hedge)', side: 'Buy', wing: -2 },
  ]
}
function num(row: Row, key: string) { const n = Number(row[key]); return Number.isFinite(n) ? n : 0 }
function strategyPhrase(strategy: string, bias: string) { const map: Record<string, string> = { 'No Trade': 'No Trade (event day)', 'Iron Condor': 'Iron Condor (range-bound, IV fair)', 'Credit Spread': 'Sell Credit Spread (range-bound, IV rich)', 'Debit Call Spread': 'Buy Call Spread (bullish, IV rich — avoid naked options)', 'Debit Put Spread': 'Buy Put Spread (bearish, IV rich — avoid naked options)', 'Naked Call': 'Buy Naked Call (bullish, IV fair)', 'Naked Put': 'Buy Naked Put (bearish, IV fair)' }; return map[strategy] ?? `${bias} setup pending calculation` }
function advanceDeclineRatio(row: Row) { const raw = String(row.advance_decline_ratio ?? ''); const parts = raw.match(/[\d.]+/g); if (!parts || parts.length < 2) return null; const [a, d] = parts.map(Number); return d > 0 ? a / d : null }
function breadthDirection(raw: string | number | null | undefined) { const text = String(raw ?? ''); const parts = text.match(/[\d.]+/g); if (!parts || parts.length < 2) return null; const [advances, declines] = parts.map(Number); if (advances > declines) return { label: 'Bullish breadth', arrow: '▲', tone: 'positive' }; if (declines > advances) return { label: 'Bearish breadth', arrow: '▼', tone: 'negative' }; return null }
const midRemapKeys: Record<string, string> = { atm_iv_nifty_mid: 'atm_iv_nifty', atm_iv_sensex_mid: 'atm_iv_sensex', pcr_nifty_mid: 'pcr_nifty', pcr_sensex_mid: 'pcr_sensex', max_pain_nifty_mid: 'max_pain_nifty', max_pain_sensex_mid: 'max_pain_sensex', atm_straddle_price_nifty_mid: 'atm_straddle_price_nifty', atm_straddle_price_sensex_mid: 'atm_straddle_price_sensex', atm_straddle_delta_nifty_mid: 'atm_straddle_delta_nifty', atm_straddle_delta_sensex_mid: 'atm_straddle_delta_sensex', atm_straddle_theta_nifty_mid: 'atm_straddle_theta_nifty', atm_straddle_theta_sensex_mid: 'atm_straddle_theta_sensex', advance_decline_ratio_mid: 'advance_decline_ratio' }
function buildMidRow(row: Row, mid: Row): Row { const overlay: Row = {}; for (const [midKey, targetKey] of Object.entries(midRemapKeys)) { if (mid[midKey] !== null && mid[midKey] !== undefined) overlay[targetKey] = mid[midKey] }; return { ...row, ...overlay, spot_nifty: mid.spot_nifty ?? null, spot_sensex: mid.spot_sensex ?? null, intraday_change_pct_nifty: mid.intraday_change_pct_nifty ?? null, intraday_change_pct_sensex: mid.intraday_change_pct_sensex ?? null } }
function resolveAtmSpot(row: Row, instrument: Instrument): number { const suffix = instrument === 'NIFTY' ? 'nifty' : 'sensex'; const direct = num(row, `spot_${suffix}`); if (direct) return direct; const prev = num(row, `prev_close_${suffix}`); const gapPoints = num(row, `gap_points_${suffix}`); if (prev && gapPoints) return prev + gapPoints; return prev }
function calculateVerdict(row: Row, instrument: Instrument) { const n = instrument === 'NIFTY'; const suffix = n ? 'nifty' : 'sensex'; const prev = num(row, `prev_close_${suffix}`); const open = n ? num(row, 'nifty_opening_points') : 0; const gapPct = n ? num(row, 'gift_nifty_gap_pct') : num(row, 'gap_points_sensex') / prev * 100; const predicted = num(row, 'gift_nifty_gap_pct') / 100 * num(row, 'prev_close_nifty'); const difference = open - predicted; const pcr = num(row, `pcr_${suffix}`); const iv = num(row, `atm_iv_${suffix}`); const vix = num(row, 'india_vix'); const support = num(row, `oi_support_${suffix}`); const resistance = num(row, `oi_resistance_${suffix}`); const maxPain = num(row, `max_pain_${suffix}`); const oiChangeSupport = String(row[`oi_change_support_${suffix}`] ?? ''); const oiChangeResistance = String(row[`oi_change_resistance_${suffix}`] ?? ''); const adRatio = advanceDeclineRatio(row); let bullVotes = 0; let bearVotes = 0; const giftGap = num(row, 'gift_nifty_gap_pct'); if (giftGap > 0) bullVotes++; if (giftGap < 0) bearVotes++; if (pcr > 1.3) bullVotes++; if (pcr < 0.8) bearVotes++; if (oiChangeSupport === 'Addition') bullVotes++; if (oiChangeSupport === 'Unwinding') bearVotes++; if (oiChangeResistance === 'Unwinding') bullVotes++; if (oiChangeResistance === 'Addition') bearVotes++; if (adRatio !== null && adRatio > 1.5) bullVotes++; if (adRatio !== null && adRatio < 0.7) bearVotes++; const bias = bullVotes > bearVotes ? 'Bullish' : bearVotes > bullVotes ? 'Bearish' : 'Neutral'; const ivRead = iv - vix > 2 ? 'IV rich' : 'IV fair'; const range = Math.abs(gapPct) <= 0.75; const strategy = range && ivRead === 'IV fair' ? 'Iron Condor' : !range && ivRead === 'IV rich' ? (bias === 'Bullish' ? 'Debit Call Spread' : bias === 'Bearish' ? 'Debit Put Spread' : 'Iron Condor') : range && ivRead === 'IV rich' ? 'Credit Spread' : bias === 'Bullish' ? 'Naked Call' : bias === 'Bearish' ? 'Naked Put' : 'Iron Condor'; const straddle = num(row, `atm_straddle_price_${suffix}`); const dte = num(row, `days_to_expiry_${suffix}`); const avgMove5d = num(row, `avg_move_5d_${suffix}`); const estimateA = straddle / Math.sqrt(Math.max(dte, 1)); const estimateB = avgMove5d; const conservative = Math.min(estimateA, estimateB); const aggressive = Math.max(estimateA, estimateB); const target = conservative * 0.6; const stop = conservative * 0.3; const aggressiveTarget = aggressive * 0.6; const aggressiveStop = aggressive * 0.3; const strike: Strike = vix < 11 ? 'ATM' : vix <= 14 ? 'ITM1' : 'ITM2'; return { gapPct, prev, open, predicted, difference, pcr, iv, vix, support, resistance, maxPain, bias, ivRead, strategy, straddle, conservative, aggressive, target, stop, aggressiveTarget, aggressiveStop, strike, dte, oiSupport: oiChangeSupport || '—', oiResistance: oiChangeResistance || '—', chartSupport: num(row, `chart_support_${suffix}`), chartResistance: num(row, `chart_resistance_${suffix}`) } }
function VerdictInstrument({ row, instrument }: { row: Row; instrument: Instrument }) {
  const calc = useMemo(() => calculateVerdict(row, instrument), [row, instrument])
  const autoStrategy = normalizeStrategy(calc.strategy)
  const [strategy, setStrategy] = useState<StrategyChoice>(autoStrategy)
  useEffect(() => { setStrategy(autoStrategy) }, [autoStrategy])
  const strikeStep = instrument === 'NIFTY' ? 50 : 100
  const autoAtm = useMemo(() => { const raw = resolveAtmSpot(row, instrument); return raw ? Math.round(raw / strikeStep) * strikeStep : raw }, [row, instrument, strikeStep])
  const [atmSpot, setAtmSpot] = useState(String(autoAtm || ''))
  useEffect(() => { setAtmSpot(String(autoAtm || '')) }, [autoAtm])
  const [offset, setOffset] = useState('0')
  const [delta, setDelta] = useState(String(deltaForOffset(0)))
  const offsetNumber = Number(offset) || 0
  const onOffsetChange = (v: string) => { setOffset(v); const n = Number(v) || 0; setDelta(String(deltaForOffset(n))) }
  const [lots, setLots] = useState('1')
  const lotSize = instrument === 'NIFTY' ? 65 : 20
  const qty = (Number(lots) || 0) * lotSize
  const hedgeWidth = instrument === 'NIFTY' ? 200 : 400
  const legs = useMemo(() => legsForStrategy(strategy, calc.bias), [strategy, calc.bias])
  const effectiveWidth = strategy === 'Naked Call' || strategy === 'Naked Put' ? 0 : hedgeWidth
  const atmNumber = Number(atmSpot) || 0
  const [legPremiums, setLegPremiums] = useState<Record<string, string>>({})
  useEffect(() => { setLegPremiums({}) }, [strategy, instrument])
  const [strikeOverrides, setStrikeOverrides] = useState<Record<string, string>>({})
  useEffect(() => { setStrikeOverrides({}) }, [strategy, instrument, atmNumber, offsetNumber])
  const legRows = legs.map((leg) => { const computed = atmNumber + leg.wing * effectiveWidth + offsetNumber * effectiveWidth; const override = strikeOverrides[leg.key]; return { ...leg, strike: override !== undefined && override !== '' ? Number(override) : computed, displayStrike: override !== undefined ? override : String(computed) } })
  const netPremium = legRows.reduce((sum, leg) => { const p = Number(legPremiums[leg.key]) || 0; return sum + (leg.side === 'Sell' ? p : -p) }, 0)
  const hasAnyPremium = legRows.some((leg) => legPremiums[leg.key] !== undefined && legPremiums[leg.key] !== '')
  const effectiveDelta = Number(delta) || 0
  const estTarget = calc.target * effectiveDelta
  const estStop = calc.stop * effectiveDelta
  const estAggressiveTarget = calc.aggressiveTarget * effectiveDelta
  const estAggressiveStop = calc.aggressiveStop * effectiveDelta
  const isNetSeller = strategy === 'Credit Spread' || strategy === 'Iron Condor'
  const actualConservativeTarget = hasAnyPremium ? (isNetSeller ? Math.max(0, netPremium * 0.4) : netPremium + calc.target * effectiveDelta) : null
  const actualConservativeStop = hasAnyPremium ? (isNetSeller ? netPremium * 1.5 : Math.max(0, netPremium - calc.stop * effectiveDelta)) : null
  const actualAggressiveTarget = hasAnyPremium ? (isNetSeller ? Math.max(0, netPremium * 0.4) : netPremium + calc.aggressiveTarget * effectiveDelta) : null
  const actualAggressiveStop = hasAnyPremium ? (isNetSeller ? netPremium * 1.5 : Math.max(0, netPremium - calc.aggressiveStop * effectiveDelta)) : null
  const isSpreadShape = strategy === 'Debit Spread' || strategy === 'Credit Spread'
  const maxProfit = isSpreadShape ? (strategy === 'Credit Spread' ? Math.abs(netPremium * qty) : hedgeWidth * qty - Math.abs(netPremium * qty)) : null
  const bookProfit = maxProfit !== null ? maxProfit * 0.6 : null
  const bookStop = strategy === 'Credit Spread' ? Math.abs(netPremium * qty) * 0.5 : strategy === 'Debit Spread' ? Math.abs(netPremium * qty) * 0.4 : null
  const sync = Math.abs(calc.difference) <= 5 ? ['In Sync', 'success', 'Prediction is tracking the actual open.'] : Math.abs(calc.difference) <= 15 ? ['Minor Divergence', 'warning', 'Prediction is slightly away from the actual open.'] : ['Diverging', 'danger', 'Prediction is materially away from the actual open.']
  const summary = `${row.trade_date} · ${row.day_name}: ${instrument} opened ${calc.gapPct >= 0 ? '+' : ''}${calc.gapPct.toFixed(2)}% gap (${calc.open.toFixed(1)}). ${calc.bias} bias with India VIX ${calc.vix.toFixed(1)} (${calc.vix < 11 ? 'low volatility — momentum only' : calc.vix <= 14 ? 'normal volatility — ATM / ITM by setup' : 'elevated volatility — prefer defined risk'}), ${calc.dte <= 7 ? 'Weekly' : 'Monthly'} expiry in ${calc.dte} days, ${calc.iv} versus VIX, PCR ${calc.pcr.toFixed(2)}, OI support ${calc.support.toFixed(0)} (${calc.oiSupport}) / resistance ${calc.resistance.toFixed(0)} (${calc.oiResistance}), chart ${calc.chartSupport.toFixed(0)}–${calc.chartResistance.toFixed(0)}, max pain ${calc.maxPain.toFixed(0)}.`
  return <article className="verdict-instrument">
    <div className="verdict-instrument-head">
      <h3>{instrument}<button type="button" className="semantic-info verdict-info" aria-label={`${instrument} verdict details`}><Info size={14} aria-hidden="true" /><span className="semantic-tooltip" role="tooltip">{summary}</span></button></h3>
    </div>
    <div className="sync-strip"><span>Predicted <b>{calc.predicted.toFixed(1)}</b></span><span>Actual <b>{calc.open.toFixed(1)}</b></span><span>Difference <b>{calc.difference >= 0 ? '+' : ''}{calc.difference.toFixed(1)}</b></span><strong className={`sync-${sync[1]}`}>{sync[0]}</strong><small>{sync[2]}</small></div>
    <div className="verdict-card verdict-editable">
      <div className="verdict-controls verdict-controls-wide">
        <select value={strategy} onChange={(e) => setStrategy(e.target.value as StrategyChoice)} aria-label={`${instrument} strategy override`}>
          {strategyChoices.map((choice) => <option key={choice} value={choice}>{choice}</option>)}
        </select>
      </div>
      {autoStrategy !== strategy && <small className="strategy-suggestion">System suggested: {autoStrategy}</small>}
    </div>
    <div className="verdict-card verdict-editable">
      <div className="verdict-controls verdict-controls-triple">
        <label>ATM spot<input type="number" step={strikeStep} value={atmSpot} onChange={(e) => setAtmSpot(e.target.value)} aria-label={`${instrument} ATM spot`} /></label>
        <label>Strikes from ATM<input type="number" step="1" value={offset} onChange={(e) => onOffsetChange(e.target.value)} aria-label={`${instrument} strikes from ATM`} /></label>
        <label>Delta<input type="number" min="0" max="1" step="0.01" value={delta} onChange={(e) => setDelta(e.target.value)} aria-label={`${instrument} effective delta`} /></label>
      </div>
      <small>Delta auto-fills from the strike-offset step table; editing a leg&apos;s strike below will not resync it — only changing &quot;Strikes from ATM&quot; does.</small>
    </div>
    <div className="verdict-grid">
      <div className="verdict-card verdict-tracks">
        <div className="track-columns">
          <div className="track-column">
            <div className="track-header"><i></i><span>Conservative</span></div>
            <strong className="track-move">{calc.conservative.toFixed(1)} pts</strong>
            <div className="track-row"><span>↑ Target (est.)</span><b className="target-value">{calc.target.toFixed(1)} pts</b><em>₹{estTarget.toFixed(1)}</em></div>
            <div className="track-row"><span>↓ Stop-loss (est.)</span><b className="stop-value">{calc.stop.toFixed(1)} pts</b><em>₹{estStop.toFixed(1)}</em></div>
          </div>
          <div className="track-column">
            <div className="track-header"><i></i><span>Aggressive</span></div>
            <strong className="track-move">{calc.aggressive.toFixed(1)} pts</strong>
            <div className="track-row"><span>↑ Target (est.)</span><b className="target-value">{calc.aggressiveTarget.toFixed(1)} pts</b><em>₹{estAggressiveTarget.toFixed(1)}</em></div>
            <div className="track-row"><span>↓ Stop-loss (est.)</span><b className="stop-value">{calc.aggressiveStop.toFixed(1)} pts</b><em>₹{estAggressiveStop.toFixed(1)}</em></div>
          </div>
        </div>
      </div>
      <div className="verdict-card verdict-editable">
        <div className="verdict-controls">
          <label>Lots<input type="number" min="0" step="1" value={lots} onChange={(e) => setLots(e.target.value)} aria-label={`${instrument} lots`} /></label>
          <label>Qty<input type="text" value={qty} readOnly aria-label={`${instrument} computed quantity`} /></label>
        </div>
        <small>{lotSize} per lot for {instrument}</small>
      </div>
    </div>
    <div className="position-calculator">
      <div className="position-head">
        <div><p className="eyebrow">Trade entry</p><strong>{strategy}</strong></div>
        <span>Live calculation</span>
      </div>
      <div className="leg-list">
        {legRows.map((leg) => <div className="leg-row" key={leg.key}>
          <span className={`leg-badge leg-${leg.side.toLowerCase()}`}>{leg.side}</span>
          <span className="leg-label">{leg.label}</span>
          <label>Strike<input type="number" step={strikeStep} value={leg.displayStrike} onChange={(e) => setStrikeOverrides((p) => ({ ...p, [leg.key]: e.target.value }))} aria-label={`${instrument} ${leg.label} strike`} /></label>
          <label>Premium<input type="number" min="0" value={legPremiums[leg.key] ?? ''} onChange={(e) => setLegPremiums((p) => ({ ...p, [leg.key]: e.target.value }))} placeholder="Enter fill" aria-label={`${instrument} ${leg.label} premium`} /></label>
        </div>)}
      </div>
      <div className="position-outputs">
        <span>Net Premium ({isNetSeller ? 'received' : 'paid'}) <b>{hasAnyPremium ? `₹${netPremium.toFixed(1)}` : 'Not entered yet'}</b></span>
        {bookProfit !== null && <span>Book Profit <b>₹{bookProfit.toFixed(0)}</b></span>}
        {bookStop !== null && <span>Book Stop <b>₹{bookStop.toFixed(0)}</b></span>}
      </div>
      {hasAnyPremium && <div className="verdict-card verdict-tracks actual-tracks">
        <div className="track-columns">
          <div className="track-column">
            <div className="track-header"><i></i><span>Conservative</span></div>
            <div className="track-row actual-target"><span>↑ Target (actual)</span><em>₹{actualConservativeTarget?.toFixed(1)}</em></div>
            <div className="track-row actual-stop"><span>↓ Stop-loss (actual)</span><em>₹{actualConservativeStop?.toFixed(1)}</em></div>
            <div className="track-row actual-target"><span>↑ Target × Qty</span><em>₹{((actualConservativeTarget ?? 0) * qty).toFixed(0)}</em></div>
            <div className="track-row actual-stop"><span>↓ Stop-loss × Qty</span><em>₹{((actualConservativeStop ?? 0) * qty).toFixed(0)}</em></div>
          </div>
          <div className="track-column">
            <div className="track-header"><i></i><span>Aggressive</span></div>
            <div className="track-row actual-target"><span>↑ Target (actual)</span><em>₹{actualAggressiveTarget?.toFixed(1)}</em></div>
            <div className="track-row actual-stop"><span>↓ Stop-loss (actual)</span><em>₹{actualAggressiveStop?.toFixed(1)}</em></div>
            <div className="track-row actual-target"><span>↑ Target × Qty</span><em>₹{((actualAggressiveTarget ?? 0) * qty).toFixed(0)}</em></div>
            <div className="track-row actual-stop"><span>↓ Stop-loss × Qty</span><em>₹{((actualAggressiveStop ?? 0) * qty).toFixed(0)}</em></div>
          </div>
        </div>
      </div>}
      {!hasAnyPremium && <p className="structure-line">Enter fill premiums above to compute actual target / stop-loss and book levels.</p>}
    </div>
    <div className="verdict-rationale"><span>Rationale</span><p>{calc.bias} bias from gap direction, PCR positioning, max pain pull, and OI level action; {calc.ivRead} conditions favor {calc.strategy.toLowerCase()}.</p></div>
  </article>
}
function VerdictView({ row }: { row: Row }) { const eventFlag = useMemo(() => highImpactEvent(row.event_today as string | null), [row.event_today]); return <section className="phase-view verdict-view"><div className="review-section-head"><div><p className="eyebrow">After Market Open</p><h2>Verdict</h2></div><span>Calculated strategy</span></div>{eventFlag && <div className="event-caution"><AlertTriangle size={16} /><span><strong>{eventFlag.name}</strong> — high impact event at {eventFlag.time}. Trade with caution.</span></div>}<div className="verdict-instruments"><VerdictInstrument row={row} instrument="NIFTY" /><VerdictInstrument row={row} instrument="SENSEX" /></div></section> }
function OutcomeBadge({ label, target, sl }: { label: string; target?: boolean; sl?: boolean }) { const text = target === true ? 'Target hit' : sl === true ? 'SL hit' : target === false && sl === false ? 'Neither' : 'Not yet available'; const cls = target === true ? 'outcome-hit' : sl === true ? 'outcome-stop' : 'outcome-neutral'; return <div className={`outcome-badge ${cls}`}><span>{label}</span><strong>{text}</strong></div> }
function MidVerdictInstrument({ mid, instrument }: { mid: Row; instrument: Instrument }) { const calc = useMemo(() => calculateVerdict(mid, instrument), [mid, instrument]); const suffix = instrument === 'NIFTY' ? 'nifty' : 'sensex'; const spotKey = `spot_${suffix}`; const changeKey = `intraday_change_pct_${suffix}`; const effectiveDelta = strikeDefaults[calc.strike]; const nakedTarget = calc.target * effectiveDelta; const nakedStop = calc.stop * effectiveDelta; return <article className="verdict-instrument"><div className="verdict-instrument-head"><h3>{instrument}</h3><span>{calc.bias} · {calc.strategy}</span></div><div className="sync-strip"><span>Spot <b>{value(mid, spotKey)}</b></span><span>Intraday change <b className={tone(mid, changeKey)}>{value(mid, changeKey, true)}</b></span></div><div className="verdict-banner"><div><p className="eyebrow">Midday strategy read</p><strong>{strategyPhrase(calc.strategy, calc.bias)}</strong></div></div><div className="verdict-grid"><div className="verdict-card verdict-tracks"><div className="track-columns"><div className="track-column"><div className="track-header"><i></i><span>Conservative</span></div><strong className="track-move">{calc.conservative.toFixed(1)} pts</strong><div className="track-row"><span>↑ Target</span><b className="target-value">{calc.target.toFixed(1)} pts</b><em>₹{(calc.target * effectiveDelta).toFixed(1)}</em></div><div className="track-row"><span>↓ Stop-loss</span><b className="stop-value">{calc.stop.toFixed(1)} pts</b><em>₹{(calc.stop * effectiveDelta).toFixed(1)}</em></div></div><div className="track-column"><div className="track-header"><i></i><span>Aggressive</span></div><strong className="track-move">{calc.aggressive.toFixed(1)} pts</strong><div className="track-row"><span>↑ Target</span><b className="target-value">{calc.aggressiveTarget.toFixed(1)} pts</b><em>₹{(calc.aggressiveTarget * effectiveDelta).toFixed(1)}</em></div><div className="track-row"><span>↓ Stop-loss</span><b className="stop-value">{calc.aggressiveStop.toFixed(1)} pts</b><em>₹{(calc.aggressiveStop * effectiveDelta).toFixed(1)}</em></div></div></div></div></div></article> }
function MidMarketView({ row, midSnapshot }: { row: Row; midSnapshot: Row | null | undefined }) {
  if (midSnapshot === undefined) return <section className="phase-view special-view"><div className="review-section-head"><div><p className="eyebrow">Open → Mid snapshot</p><h2>Mid-market</h2></div><span>Independent midday read</span></div><p className="history-empty">Loading mid-market data…</p></section>
  if (!midSnapshot) return <section className="phase-view special-view"><div className="review-section-head"><div><p className="eyebrow">Open → Mid snapshot</p><h2>Mid-market</h2></div><span>Independent midday read</span></div><p className="history-empty">Mid-market data not available yet — updates at 12:45 PM IST.</p></section>
  const mid = buildMidRow(row, midSnapshot)
  return <section className="phase-view special-view verdict-view"><div className="review-section-head"><div><p className="eyebrow">Open → Mid snapshot</p><h2>Mid-market</h2></div><span>Independent midday read</span></div><div className="verdict-instruments"><MidVerdictInstrument mid={mid} instrument="NIFTY" /><MidVerdictInstrument mid={mid} instrument="SENSEX" /></div></section>
}
function PostInstrumentCard({ row, postSummary, instrument }: { row: Row; postSummary: Row; instrument: Instrument }) {
  const suffix = instrument === 'NIFTY' ? 'nifty' : 'sensex'
  const calc = useMemo(() => calculateVerdict(row, instrument), [row, instrument])
  const high = num(postSummary, `day_high_${suffix}`)
  const low = num(postSummary, `day_low_${suffix}`)
  const range = high - low
  const label = range >= calc.target ? 'Target likely hit' : range < calc.stop ? 'SL likely hit' : 'Neither / mid-range'
  const cls = label === 'Target likely hit' ? 'outcome-hit' : label === 'SL likely hit' ? 'outcome-stop' : 'outcome-neutral'
  return <article className="verdict-instrument"><div className="verdict-instrument-head"><h3>{instrument}</h3></div><div className="close-grid"><div className="close-card"><span>Close</span><strong>{value(postSummary, `close_${suffix}`)}</strong><b className={tone(postSummary, `day_change_pct_${suffix}`)}>{value(postSummary, `day_change_pct_${suffix}`, true)}</b></div><div className="close-card"><span>Day High / Low</span><strong>{value(postSummary, `day_high_${suffix}`)} / {value(postSummary, `day_low_${suffix}`)}</strong></div></div><div className={`outcome-badge ${cls}`}><span>Target / SL estimate</span><strong>{label}</strong><small>(range-based estimate)</small></div></article>
}
function PostMarketView({ row, postSummary }: { row: Row; postSummary: Row | null | undefined }) {
  if (postSummary === undefined) return <section className="phase-view special-view"><div className="review-section-head"><div><p className="eyebrow">Post market review</p><h2>Close the loop</h2></div><span>Instrument outcomes</span></div><p className="history-empty">Loading post-market data…</p></section>
  if (!postSummary) return <section className="phase-view special-view"><div className="review-section-head"><div><p className="eyebrow">Post market review</p><h2>Close the loop</h2></div><span>Instrument outcomes</span></div><p className="history-empty">Post-market data not available yet — updates at 8:00 PM IST.</p></section>
  const fii = postSummary.fii_net_cash_cr
  const dii = postSummary.dii_net_cash_cr
  const asOf = postSummary.fii_dii_data_date
  return <section className="phase-view special-view verdict-view"><div className="review-section-head"><div><p className="eyebrow">Post market review</p><h2>Close the loop</h2></div><span>Instrument outcomes</span></div><div className="verdict-instruments"><PostInstrumentCard row={row} postSummary={postSummary} instrument="NIFTY" /><PostInstrumentCard row={row} postSummary={postSummary} instrument="SENSEX" /></div><div className="flow-card"><span>FII / DII net cash flow</span><strong>{fii != null && dii != null ? `FII: ₹${fii} Cr, DII: ₹${dii} Cr (as of ${asOf ?? row.trade_date})` : 'Not available'}</strong></div></section>
}

function PhaseView({ phase, row }: { phase: Phase; row: Row | null }) {
  const fields = phaseFields[phase]
  const phaseHeadings: Record<'premarket' | 'open', [string, string]> = { premarket: ['Overnight → Open setup', 'Build the market thesis'], open: ['Market Open snapshot', 'Read the opening auction'] }
  const commonKeys = ['event_today', 'india_vix', 'india_vix_change_pct', 'gift_nifty_gap_pct', 'advance_decline_ratio', 'mid_market_status', 'mid_advance_decline_ratio', 'mid_india_vix', 'mid_market_notes', 'post_market_status', 'post_advance_decline_ratio', 'post_market_notes']
  const common = fields.filter((f) => commonKeys.includes(f.key))
  const indexFields = fields.filter((f) => !commonKeys.includes(f.key))
  const nifty = indexFields.filter((f) => f.key.toLowerCase().includes('nifty') || f.key.includes('pcr_nifty') || f.key.includes('max_pain_nifty'))
  const sensex = indexFields.filter((f) => f.key.toLowerCase().includes('sensex') || f.key.includes('pcr_sensex') || f.key.includes('max_pain_sensex'))
  const marketOpenBias = (key: string) => { const gap = Number(row?.[key]); return gap > 0 ? 'Bullish' : gap < 0 ? 'Bearish' : 'Neutral' }
  const renderGroup = (title: string, group: typeof fields) => { const isIndex = title === 'Nifty' || title === 'Sensex'; const bias = title === 'Nifty' ? marketOpenBias('gap_points_nifty') : marketOpenBias('gap_points_sensex'); return <section className={`metric-group ${title === 'Common market data' ? 'common-group' : ''}`}><div className="group-heading">{title !== 'Common market data' && <h3>{title}{phase === 'open' && isIndex && <em className={`market-open-bias ${bias.toLowerCase()}`}> ({bias})</em>} {isIndex && <button type="button" className="semantic-info" aria-label={`${title} market color and OI action guidance`}><Info size={14} aria-hidden="true" /><span className="semantic-tooltip" role="tooltip"><b className="key-positive">Green</b> bullish / positive · <b className="key-negative">Red</b> bearish / negative · OI Addition = building interest · OI Unwinding = reducing interest</span></button>}</h3>}</div><div className="field-grid">{group.map((f) => { const isVix = f.key === 'india_vix'; const isOiAction = f.key.startsWith('oi_change_'); const actionTone = isOiAction ? (String(row?.[f.key] ?? '').toLowerCase() === 'addition' ? 'positive' : String(row?.[f.key] ?? '').toLowerCase().includes('unwinding') ? 'negative' : '') : ''; const relatedAction = f.key === 'oi_support_nifty' ? row?.oi_change_support_nifty : f.key === 'oi_support_sensex' ? row?.oi_change_support_sensex : f.key === 'oi_resistance_nifty' ? row?.oi_change_resistance_nifty : f.key === 'oi_resistance_sensex' ? row?.oi_change_resistance_sensex : null; const breadth = f.key === 'advance_decline_ratio' ? breadthDirection(row?.[f.key]) : null; const isNiftyGap = f.key === 'gap_points_nifty'; const predictedGap = isNiftyGap ? (num(row ?? {}, 'gift_nifty_gap_pct') / 100) * num(row ?? {}, 'prev_close_nifty') : null; return <div className={`field-card ${row?.[f.key] == null ? 'is-empty' : ''}`} key={f.key}><span>{f.label}</span><strong className={tone(row, f.key)}>{value(row, f.key, f.pct)}{isVix && row?.india_vix_change_pct != null && <em className={`vix-change ${tone(row, 'india_vix_change_pct')}`}> ({value(row, 'india_vix_change_pct', true)})</em>}{relatedAction != null && <em className={`oi-action ${String(relatedAction).toLowerCase() === 'addition' ? 'positive' : String(relatedAction).toLowerCase().includes('unwinding') ? 'negative' : ''}`}> ({String(relatedAction)})</em>}{breadth && <em className={`breadth-flag ${breadth.tone}`}> {breadth.arrow} {breadth.label}</em>}{isNiftyGap && predictedGap != null && row?.[f.key] != null && <em className="predicted-gap"> (Predicted: {predictedGap.toFixed(1)}, Difference: {(predictedGap - Number(row[f.key])).toFixed(1)})</em>}</strong>{isOiAction && <small className={`oi-action ${actionTone}`}>{String(row?.[f.key] ?? '—')}</small>}</div> })}</div></section> }
  const [eyebrow, heading] = phaseHeadings[phase as 'premarket' | 'open']
  return <section className="phase-view"><div className="review-section-head"><div><p className="eyebrow">{eyebrow}</p><h2>{heading}</h2></div><span>Session snapshot</span></div><div className="metric-groups">{renderGroup('Common market data', common)}{renderGroup('Nifty', nifty)}{renderGroup('Sensex', sensex)}</div></section>
}
export default function Dashboard() {
  const [phase, setPhase] = useState<Phase>('premarket'); const [dark, setDark] = useState(false); const [navOpen, setNavOpen] = useState(true); const [liveDate, setLiveDate] = useState(''); const [liveDay, setLiveDay] = useState(''); const [liveTime, setLiveTime] = useState('')
  const supabase = useMemo(() => createClient(), [])
  const { data: liveRow } = useSWR<Row | null>('premarket-dashboard', async () => { const { data, error } = await supabase.from('premarket_dashboard').select('*').order('trade_date', { ascending: false }).limit(1).maybeSingle(); if (error) throw error; return data as Row | null }, { revalidateOnFocus: false })
  const { data: historyRows } = useSWR<Row[] | null>('premarket-dashboard-history', async () => {
    const { data: dashboardRows, error } = await supabase.from('premarket_dashboard').select('*').order('trade_date', { ascending: false }).limit(15)
    if (error) throw error
    const rows = (dashboardRows ?? []) as Row[]
    const tradeDates = rows.map((r) => r.trade_date).filter((d): d is string => typeof d === 'string')
    if (tradeDates.length === 0) return rows
    const { data: postRows, error: postError } = await supabase.from('postmarket_summary').select('trade_date, day_change_pct_nifty').in('trade_date', tradeDates)
    if (postError) throw postError
    const closeByDate = new Map((postRows ?? []).map((p: Row) => [p.trade_date, p.day_change_pct_nifty]))
    return rows.map((r) => ({ ...r, day_change_pct_nifty: closeByDate.get(r.trade_date) ?? null }))
  }, { revalidateOnFocus: false })
  const row = liveRow ? Object.fromEntries(Object.keys(visualRow).map((key) => [key, liveRow[key] ?? visualRow[key]])) as Row : visualRow
  const { data: midSnapshot } = useSWR<Row | null>(row.trade_date ? ['midmarket-snapshot', row.trade_date] : null, async () => { const { data, error } = await supabase.from('midmarket_snapshot').select('*').eq('trade_date', row.trade_date).order('trade_date', { ascending: false }).limit(1).maybeSingle(); if (error) throw error; return data as Row | null }, { revalidateOnFocus: false })
  const { data: postSummary } = useSWR<Row | null>(row.trade_date ? ['postmarket-summary', row.trade_date] : null, async () => { const { data, error } = await supabase.from('postmarket_summary').select('*').eq('trade_date', row.trade_date).order('trade_date', { ascending: false }).limit(1).maybeSingle(); if (error) throw error; return data as Row | null }, { revalidateOnFocus: false })
  useEffect(() => { document.documentElement.classList.toggle('dark', dark) }, [dark])
  useEffect(() => { const updateClock = () => { const now = new Date(); const options = { timeZone: 'Asia/Kolkata' } as const; setLiveDate(new Intl.DateTimeFormat('en-IN', { ...options, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)); setLiveDay(new Intl.DateTimeFormat('en-IN', { ...options, weekday: 'long' }).format(now)); setLiveTime(new Intl.DateTimeFormat('en-IN', { ...options, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }).format(now)) }; updateClock(); const timer = window.setInterval(updateClock, 1000); return () => window.clearInterval(timer) }, [])
  return <main className="app-shell"><header className="topbar"><button className="icon-button mobile-menu" onClick={() => setNavOpen(!navOpen)} aria-label="Toggle navigation"><Menu size={18} /></button><div className="brand-mark"><div className="brand-symbol"><BarChart3 size={16} /></div><div><strong>MARKETVIEW</strong><span>TRADE ANALYSIS PLATFORM</span></div></div><span className="topbar-date">{liveDate || row?.trade_date || 'No current row'} · {liveDay || row?.day_name || 'Session date'} · {liveTime || '—'} IST</span><div className="topbar-meta"><button className="icon-button" onClick={() => location.reload()} aria-label="Refresh dashboard"><RefreshCw size={16} /></button><button className="icon-button" onClick={() => setDark(!dark)} aria-label="Toggle theme">{dark ? <Sun size={16} /> : <Moon size={16} />}</button></div></header><div className="workspace"><aside className={`sidebar ${navOpen ? '' : 'closed'}`}><div className="side-label">SESSION MAP</div>{phases.map(({ id, label, subtitle, icon: Icon }) => <button key={id} className={`phase-nav ${phase === id ? 'active' : ''}`} onClick={() => setPhase(id)}><Icon size={17} /><span><strong>{label}</strong><small>{subtitle}</small></span><ChevronRight size={14} /></button>)}<div className="side-rule" /></aside><div className="content">{phase === 'rules' ? <RulesView /> : phase === 'history' ? <HistoryView rows={historyRows} /> : phase === 'verdict' ? <VerdictView row={row} /> : phase === 'mid' ? <MidMarketView row={row} midSnapshot={midSnapshot} /> : phase === 'post' ? <PostMarketView row={row} postSummary={postSummary} /> : <PhaseView phase={phase} row={row} />}<footer className="data-footer"><span><CheckCircle2 size={14} /> {liveRow ? 'Live Supabase data' : 'Visual preview data'}</span><span>Snapshot: {row.trade_date}</span></footer></div></div></main>
}
