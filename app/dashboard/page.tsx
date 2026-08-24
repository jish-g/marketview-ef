'use client'

import { useEffect, useMemo, useState } from 'react'
import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'
import { TradeView } from '@/components/trade-view'
import { Activity, AlertTriangle, ArrowDown, ArrowUp, BarChart3, BookOpen, CheckCircle2, ChevronRight, Clock3, Gauge, Info, Layers3, Menu, Moon, RefreshCw, Sun } from 'lucide-react'
type Row = Record<string, string | number | boolean | null>
type Phase = 'premarket' | 'open' | 'verdict' | 'mid' | 'post' | 'rules' | 'history' | 'trade'
const phases = [
  { id: 'premarket' as Phase, label: 'Pre-market', subtitle: 'Overnight setup', icon: Clock3 },
  { id: 'open' as Phase, label: 'Market open', subtitle: 'Opening auction', icon: Activity },
  { id: 'verdict' as Phase, label: 'Verdict', subtitle: 'Strategy selection', icon: CheckCircle2 },
  { id: 'mid' as Phase, label: 'Mid-market', subtitle: 'Intraday read', icon: Gauge },
  { id: 'trade' as Phase, label: 'Trade', subtitle: 'Live positions', icon: ArrowUp },
  { id: 'post' as Phase, label: 'Post-market', subtitle: 'Review & learn', icon: Layers3 },
  { id: 'rules' as Phase, label: 'Rules engine', subtitle: 'Interpretation guide', icon: BookOpen },
  { id: 'history' as Phase, label: 'History', subtitle: 'Prior snapshots', icon: BarChart3 },
]
const phaseFields: Partial<Record<Phase, { label: string; key: string; pct?: boolean }[]>> & Pick<Record<Phase, { label: string; key: string; pct?: boolean }[]>, 'premarket' | 'open' | 'mid' | 'post'> = {
  premarket: ([
    ['Event today', 'event_today'], ['India VIX', 'india_vix'], ['GIFT Nifty gap', 'gift_nifty_gap_pct', true], ['Expiry', 'days_to_expiry_nifty'], ['Expiry', 'days_to_expiry_sensex'], ['5D average move', 'avg_move_5d_nifty'], ['5D average move', 'avg_move_5d_sensex'], ['Prior day', 'prev_day_change_pct_nifty', true], ['Prior day', 'prev_day_change_pct_sensex', true], ['Chart Support (1D Pivot)', 'chart_support_nifty'], ['Chart Resistance (1D Pivot)', 'chart_resistance_nifty'], ['Chart Support (1D Pivot)', 'chart_support_sensex'], ['Chart Resistance (1D Pivot)', 'chart_resistance_sensex'], ['OI support', 'oi_support_nifty'], ['OI resistance', 'oi_resistance_nifty'], ['OI support', 'oi_support_sensex'], ['OI resistance', 'oi_resistance_sensex'],
  ] as const).map(([label, key, pct]) => ({ label, key, pct: Boolean(pct) })),
  open: ([
    ['Opening points', 'nifty_opening_points'], ['Advance / decline', 'advance_decline_ratio'], ['Previous close', 'prev_close_nifty'], ['Previous close', 'prev_close_sensex'], ['Gap points', 'gap_points_nifty'], ['Gap points', 'gap_points_sensex'], ['ATM IV', 'atm_iv_nifty', true], ['ATM IV', 'atm_iv_sensex', true], ['Straddle', 'atm_straddle_price_nifty'], ['Straddle', 'atm_straddle_price_sensex'], ['Delta', 'atm_straddle_delta_nifty'], ['Delta', 'atm_straddle_delta_sensex'], ['Theta', 'atm_straddle_theta_nifty'], ['Theta', 'atm_straddle_theta_sensex'], ['PCR', 'pcr_nifty'], ['PCR', 'pcr_sensex'], ['Max pain', 'max_pain_nifty'], ['Max pain', 'max_pain_sensex'],
  ] as const).map(([label, key, pct]) => ({ label, key, pct: Boolean(pct) })),
  mid: ([
    ['Mid-market status', 'mid_market_status'], ['Nifty intraday change', 'mid_nifty_change_pct', true], ['Sensex intraday change', 'mid_sensex_change_pct', true], ['Mid-market breadth', 'mid_advance_decline_ratio'], ['Mid-market PCR', 'mid_pcr_nifty'], ['Mid-market VIX', 'mid_india_vix'], ['Mid-market note', 'mid_market_notes'],
  ] as const).map(([label, key, pct]) => ({ label, key, pct: Boolean(pct) })),
  post: ([
    ['Post-market status', 'post_market_status'], ['Nifty close', 'post_close_nifty'], ['Sensex close', 'post_close_sensex'], ['Nifty closing change', 'post_change_pct_nifty', true], ['Sensex closing change', 'post_change_pct_sensex', true], ['Final breadth', 'post_advance_decline_ratio'], ['Post-market note', 'post_market_notes'], 
  ] as const).map(([label, key, pct]) => ({ label, key, pct: Boolean(pct) })),
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
  // Stage 1 — Market Bias: weighted Gap/OI/PCR/Max Pain signal, replacing the old flat gap/VIX/PCR/max-pain/OI/DTE
  // rule cards and the 5-signal majority-vote bias (which included advance/decline ratio) with the framework
  // actually implemented in computeMarketBias/computeOptionReadiness/computeStrategyRecommendation.
  const stage1 = [
    { title: 'Gap %', subtitle: 'Overnight move · weight 45% (DTE > 3) / 25% (DTE ≤ 3)', rows: [['> 0.75%', 'Strong gap up', 'Score +2'], ['0.25% – 0.75%', 'Normal gap up', 'Score +1'], ['−0.25% to 0.25%', 'Flat', 'Score 0'], ['−0.75% to −0.25%', 'Normal gap down', 'Score −1'], ['< −0.75%', 'Strong gap down', 'Score −2']] },
    { title: 'PCR', subtitle: 'Positioning · weight 20%', rows: [['> 1.30', 'Oversold / bullish', 'Score +2'], ['0.80 – 1.30', 'Neutral', 'Score 0'], ['< 0.80', 'Overbought / bearish', 'Score −2']] },
    { title: 'Max pain', subtitle: 'Spot vs strike · weight 10%', rows: [['Spot below by > 0.3%', 'Upward pull expected', 'Score +1'], ['Within ±0.3%', 'Pinning likely', 'Score 0'], ['Spot above by > 0.3%', 'Downward pull expected', 'Score −1']] },
    { title: 'OI structure', subtitle: 'Support/resistance change · weight 25% (DTE > 3) / 45% (DTE ≤ 3)', rows: [['Support: Addition', 'Support strengthening', '+1'], ['Support: Unwinding', 'Support weakening', '−1'], ['Resistance: Addition', 'Resistance strengthening', '−1'], ['Resistance: Unwinding', 'Resistance weakening', '+1']] },
  ]
  // Stage 2 — Option Readiness: combined VIX-level + IV-vs-VIX score plus a DTE component (replacing the old
  // fixed ±2-point IV/VIX threshold and the separate, uncombined VIX-level rule card).
  const stage2 = [
    { title: 'VIX score', subtitle: 'India VIX level', rows: [['11 – 14', 'Ideal, low-risk premium', 'Score +2'], ['Below 11', 'Thin, theta-heavy premium', 'Score +1'], ['14 – 18', 'Elevated premium', 'Score 0'], ['18 – 22', 'High, crush risk', 'Score −1'], ['Above 22', 'Blocks fresh buying only', 'Score −2']] },
    { title: 'IV vs VIX', subtitle: 'ATM IV relative to VIX', rows: [['IV < VIX × 0.9', 'Cheap', 'Score +2'], ['IV ≤ VIX × 1.1', 'Normal', 'Score +1'], ['IV > VIX × 1.1', 'Expensive', 'Score −1']] },
    { title: 'DTE score', subtitle: 'Days to expiry', rows: [['2 – 4', 'Ideal window', 'Score +2'], ['> 4', 'Lower gamma risk', 'Score +1'], ['≤ 1', 'High gamma risk', 'Score −1']] },
  ]
  // Stage 3 — Strategy Recommendation: Bias band × IV Condition × VIX × DTE, replacing the old Trend-vs-Range +
  // IV lookup with its DTE≤1-forces-spread and high-impact-event overrides (neither reflects live logic today).
  const stage3Rows: [string, string, string][] = [
    ['Bullish + Cheap IV + Good to Buy (normal VIX)', 'Strong conviction, attractively priced', 'Naked Call (→ Call Debit Spread if DTE ≤ 1)'],
    ['Bullish + Cheap/Normal IV', 'Directional edge, fairly priced', 'Call Debit Spread'],
    ['Bullish + Expensive IV, or high VIX', 'Bullish but premium too rich to buy', 'Put Credit Spread'],
    ['Bearish + Cheap IV + Good to Buy (normal VIX)', 'Strong conviction, attractively priced', 'Naked Put (→ Put Debit Spread if DTE ≤ 1)'],
    ['Bearish + Cheap/Normal IV', 'Directional edge, fairly priced', 'Put Debit Spread'],
    ['Bearish + Expensive IV, or high VIX', 'Bearish but premium too rich to buy', 'Call Credit Spread'],
    ['Neutral + Cheap IV', 'No edge to sell, no conviction to buy', 'No Trade / Wait'],
    ['Neutral + Normal IV', 'Fairly priced, no directional edge', 'No Trade / Wait'],
    ['Neutral + Expensive IV', 'Enough premium to justify selling', 'Iron Condor'],
    ['Neutral + High VIX', 'Elevated risk, defined-risk only', 'Iron Condor'],
  ]
  const formulas: [string, string, string][] = [
    ['GIFT Nifty predicted open', 'Predicted (points) = GIFT Nifty gap % ÷ 100 × NIFTY previous close', 'Difference = actual opening gap (points) − predicted. SENSEX has no equivalent leading indicator.'],
    ['Expected move (Conservative / Aggressive)', 'Option-implied = ATM straddle price ÷ √max(DTE, 1)', 'Historical = 5-day average daily range (High − Low). Conservative = smaller of the two; Aggressive = larger.'],
    ['Target / stop-loss', 'Buyer strategies (Naked Call/Put, Debit Spread): Target/Stop = expected move (points) × strike\u2019s effective delta', 'Net premium plays no role for buyers. Seller strategies (Credit Spread, Iron Condor): Conservative Target = Net Premium × 60%, Conservative Stop = Net Premium × 40%; Aggressive Target = Net Premium × 75%, Aggressive Stop = Net Premium × 25%.'],
    ['Book profit / book stop', 'Buyer strategies: Book Profit = Target (points) × Qty × 60%; Book Stop = Stop (points) × Qty × 40%', 'Seller strategies: Book Profit = Target × Qty; Book Stop = Stop × Qty — no extra split, since the 60/40–75/25 split already happened at the Target/Stop-loss level.'],
  ]
  return <section className="phase-view rules-view">
    <div className="phase-intro rules-header"><div><p className="eyebrow">Quick reference · bias score → readiness score → strategy</p><h2>Rules engine</h2></div><a className="detailed-read-link" href="/rules">Detailed read <ChevronRight size={15} /></a></div>

    <p className="eyebrow rules-stage-label">Stage 1 · Market bias</p>
    <div className="rule-grid">{stage1.map((section) => <article className="rule-table" key={section.title}><div className="rule-table-head"><div><strong>{section.title}</strong><span>{section.subtitle}</span></div><BookOpen size={16} /></div><div className="rule-table-labels"><span>Condition</span><span>Reading</span><span>Score</span></div>{section.rows.map(([condition, reading, action]) => <div className="rule-table-row" key={`${condition}-${reading}`}><b>{condition}</b><span>{reading}</span><span>{action}</span></div>)}</article>)}</div>
    <div className="strategy-strip"><strong>Final bias bands</strong><span>+1.25 to +2.00 Strong Bullish</span><span>+0.50 to +1.24 Bullish</span><span>−0.49 to +0.49 Neutral</span><span>−0.50 to −1.24 Bearish</span><span>−1.25 to −2.00 Strong Bearish</span></div>

    <p className="eyebrow rules-stage-label">Stage 2 · Option readiness</p>
    <div className="rule-grid">{stage2.map((section) => <article className="rule-table" key={section.title}><div className="rule-table-head"><div><strong>{section.title}</strong><span>{section.subtitle}</span></div><BookOpen size={16} /></div><div className="rule-table-labels"><span>Condition</span><span>Reading</span><span>Score</span></div>{section.rows.map(([condition, reading, action]) => <div className="rule-table-row" key={`${condition}-${reading}`}><b>{condition}</b><span>{reading}</span><span>{action}</span></div>)}</article>)}</div>
    <div className="strategy-strip"><strong>Readiness bands</strong><span>+4 to +6 Good to Buy</span><span>+1 to +3 Caution</span><span>≤ 0 Avoid — forces No Trade regardless of bias</span></div>

    <p className="eyebrow rules-stage-label">Stage 3 · Strategy recommendation</p>
    <article className="rule-table"><div className="rule-table-head"><div><strong>Bias + IV condition + VIX/DTE</strong><span>Matched against the Stage 1 and Stage 2 outputs</span></div><BookOpen size={16} /></div><div className="rule-table-labels"><span>Condition</span><span>Reading</span><span>Recommendation</span></div>{stage3Rows.map(([condition, reading, action]) => <div className="rule-table-row" key={condition}><b>{condition}</b><span>{reading}</span><span>{action}</span></div>)}</article>
    <div className="strategy-strip"><strong>Safety filters</strong><span>Readiness = Avoid → No Trade regardless of bias</span><span>VIX &gt; 22 blocks fresh premium-buying only — credit/selling strategies stay allowed</span><span>DTE ≤ 1 downgrades Naked Call/Put to the matching Debit Spread</span><span>Each &quot;No Trade&quot; shows its own specific reason (e.g. cheap IV vs. fairly-priced IV), not one generic message</span></div>

    <p className="eyebrow rules-stage-label">Predicted open, expected move &amp; targets</p>
    <div className="formula-grid">{formulas.map(([title, formula, note]) => <article className="formula-card" key={title}><p className="eyebrow">{title}</p><strong>{formula}</strong><span>{note}</span></article>)}</div>
  </section>
}

// Per-day extras History needs beyond the premarket_dashboard row itself, keyed by trade_date.
type HistoryExtras = { rows: Row[]; mid: Record<string, Row>; post: Record<string, Row>; trade: Record<string, Row> }

function historyOutcomeRead(trade: Row | undefined) {
  const outcome = trade?.outcome
  if (outcome === 'target') return { label: 'Target Hit', cls: 'outcome-hit' }
  if (outcome === 'stop') return { label: 'SL Hit', cls: 'outcome-stop' }
  if (outcome === 'open') return { label: 'Trade still open', cls: 'outcome-neutral' }
  return { label: 'No trade logged', cls: 'outcome-neutral' }
}

// One trading day told as a 4-beat story: Opening (real gap), Expected (fresh morning-call recompute),
// Through the day (fresh midday recompute vs. the morning call), Close (actual outcome). Beats 2 and 3 are
// recomputed here with the same computeMarketBias/computeOptionReadiness/computeStrategyRecommendation
// functions the Verdict and Mid-market pages use — never read from the stale stored bias/strategy columns.
function HistoryDayCard({ row, mid: midSnapshot, post, trade }: { row: Row; mid: Row | undefined; post: Row | undefined; trade: Row | undefined }) {
  const instrument: Instrument = 'NIFTY'

  // Beat 1 — Opening: NIFTY's own real opening gap (gap_points_nifty / prev_close_nifty), not GIFT Nifty's
  // predicted overnight gap.
  const prevClose = num(row, 'prev_close_nifty')
  const gapPoints = num(row, 'gap_points_nifty')
  const hasOpening = row.prev_close_nifty != null && row.gap_points_nifty != null
  const openGapPct = prevClose ? (gapPoints / prevClose) * 100 : 0

  // Beat 2 — Expected: the morning call, recomputed fresh from this row's own morning inputs.
  const morningCalc = useMemo(() => calculateVerdict(row, instrument), [row])
  const morningBias = useMemo(() => computeMarketBias(row, morningCalc, instrument), [row, morningCalc])
  const morningReadiness = useMemo(() => computeOptionReadiness(morningCalc), [morningCalc])
  const morningStrategy = useMemo(() => computeStrategyRecommendation(morningBias.label, morningReadiness.ivCondition, morningCalc.vix, morningCalc.dte), [morningBias, morningReadiness, morningCalc])

  // Beat 3 — Through the day: midday read, recomputed fresh the same way from midmarket_snapshot's raw
  // inputs merged over the morning row (buildMidRow), then compared against the Beat 2 result to decide
  // whether it actually shifted.
  const mid = useMemo(() => (midSnapshot ? buildMidRow(row, midSnapshot) : null), [row, midSnapshot])
  const midCalc = useMemo(() => (mid ? calculateVerdict(mid, instrument) : null), [mid])
  const midBias = useMemo(() => (mid && midCalc ? computeMarketBias(mid, midCalc, instrument) : null), [mid, midCalc])
  const midReadiness = useMemo(() => (midCalc ? computeOptionReadiness(midCalc) : null), [midCalc])
  const midStrategy = useMemo(() => (midBias && midReadiness && midCalc ? computeStrategyRecommendation(midBias.label, midReadiness.ivCondition, midCalc.vix, midCalc.dte) : null), [midBias, midReadiness, midCalc])
  const hasMidday = Boolean(mid && midBias && midStrategy)
  const shifted = midBias && midStrategy ? (midBias.label !== morningBias.label || midStrategy.recommendation !== morningStrategy.recommendation) : false

  // Beat 4 — Close: postmarket_summary as-is (day_change_pct_nifty already reflects the corrected net_change
  // calculation), plus the actual logged auto_trades outcome for the day — not a range-based estimate.
  const outcome = historyOutcomeRead(trade)

  return <article className="history-day-card">
    <div className="history-day-head">
      <div><strong>{row.trade_date}</strong><span>{row.day_name ?? '—'}</span></div>
      {post && <span className={`history-close-pill ${tone(post, 'day_change_pct_nifty')}`}>{value(post, 'day_change_pct_nifty', true)}</span>}
    </div>
    <div className="history-beats">
      <div className="history-beat">
        <span className="history-beat-label">Opening</span>
        {hasOpening ? <p><b className={openGapPct >= 0 ? 'positive' : 'negative'}>{openGapPct >= 0 ? '+' : ''}{openGapPct.toFixed(2)}%</b> gap ({gapPoints.toFixed(1)} pts) — {gapBandLabel(openGapPct)}</p> : <p className="history-beat-empty">No opening data recorded</p>}
      </div>
      <div className="history-beat">
        <span className="history-beat-label">Expected</span>
        <p><b>{morningBias.label}</b> bias · {morningStrategy.recommendation}</p>
      </div>
      <div className="history-beat">
        <span className="history-beat-label">Through the day</span>
        {hasMidday && midBias && midStrategy ? <p><b className={shifted ? 'is-shifted' : ''}>{midBias.label}</b> bias · {midStrategy.recommendation}<br /><span className="history-beat-note">{shifted ? 'Shifted since the morning call' : 'Unchanged since the morning call'}</span></p> : <p className="history-beat-empty">No midday snapshot recorded</p>}
      </div>
      <div className="history-beat">
        <span className="history-beat-label">Close</span>
        {post ? <p>Close <b className={tone(post, 'day_change_pct_nifty')}>{value(post, 'day_change_pct_nifty', true)}</b>, high/low {value(post, 'day_high_nifty')} / {value(post, 'day_low_nifty')}<br /><span className={outcome.cls}>{outcome.label}</span></p> : <p className="history-beat-empty">Post-market data not available</p>}
      </div>
    </div>
  </article>
}

function HistoryView({ data }: { data: HistoryExtras | null | undefined }) {
  const rows = data?.rows
  return <section className="phase-view"><div className="phase-intro"><div><p className="eyebrow">Prior sessions</p><h2>History</h2></div></div><div className="history-list history-days">{!rows ? <p className="history-empty">Loading history…</p> : rows.length === 0 ? <p className="history-empty">No history rows available yet.</p> : rows.map((row) => <HistoryDayCard key={String(row.trade_date)} row={row} mid={data?.mid[String(row.trade_date)]} post={data?.post[String(row.trade_date)]} trade={data?.trade[String(row.trade_date)]} />)}</div></section>
}

type Instrument = 'NIFTY' | 'SENSEX'
type Strike = 'ATM' | 'ITM1' | 'ITM2'
type Side = 'Call' | 'Put'
const strikeDefaults: Record<Strike, number> = { ATM: 0.5, ITM1: 0.62, ITM2: 0.72 }
type StrategyChoice = 'Naked Call' | 'Naked Put' | 'Debit Spread' | 'Credit Spread' | 'Iron Condor' | 'Custom' | 'No Trade'
const strategyChoices: StrategyChoice[] = ['No Trade', 'Naked Call', 'Naked Put', 'Debit Spread', 'Credit Spread', 'Iron Condor', 'Custom']
function normalizeStrategy(strategy: string): StrategyChoice { if (strategy === 'Debit Call Spread' || strategy === 'Debit Put Spread') return 'Debit Spread'; if (strategy === 'Naked Call') return 'Naked Call'; if (strategy === 'Naked Put') return 'Naked Put'; if (strategy === 'Credit Spread') return 'Credit Spread'; return 'Iron Condor' }
// Strike placement convention: Call strike = ATM + offset (positive offset → further OTM), Put strike = ATM − offset (positive offset → further OTM).
// Higher delta = deeper ITM, lower delta = further OTM, so positive offset must map to the LOW delta tier and negative offset to the HIGH delta tier.
function deltaForOffset(offset: number): number { const steps = [0.5, 0.7, 0.85, 0.95]; const step = steps[Math.min(Math.abs(offset), 3)]; if (offset === 0) return step; return offset > 0 ? Number((1 - step).toFixed(2)) : step }
type LegDef = { key: string; label: string; side: 'Buy' | 'Sell'; wing: number }
// `side` (Call/Put) is the single source of truth for Debit/Credit Spread leg construction — driven by the
// user-facing toggle, not a hidden bias check, so the toggle is what actually controls which side gets built.
function legsForStrategy(strategy: StrategyChoice, bias: string, side: Side): LegDef[] {
  if (strategy === 'No Trade') return []
  if (strategy === 'Naked Call') return [{ key: 'p', label: 'Buy Call', side: 'Buy', wing: bias === 'Bearish' ? -1 : 1 }]
  if (strategy === 'Naked Put') return [{ key: 'p', label: 'Buy Put', side: 'Buy', wing: bias === 'Bullish' ? 1 : -1 }]
  if (strategy === 'Debit Spread') {
    // Debit Spread buys the near-ATM leg and sells the far leg (opposite of Credit Spread's Sell-near/Buy-far shape).
    const isPut = side === 'Put'
    return [
      { key: 's', label: isPut ? 'Buy Put (primary)' : 'Buy Call (primary)', side: 'Buy', wing: isPut ? -1 : 1 },
      { key: 'lg', label: isPut ? 'Sell Put (hedge)' : 'Sell Call (hedge)', side: 'Sell', wing: 0 },
    ]
  }
  if (strategy === 'Credit Spread') {
    const isPut = side === 'Put'
    return [
      { key: 's', label: isPut ? 'Sell Put (primary)' : 'Sell Call (primary)', side: 'Sell', wing: isPut ? -1 : 1 },
      { key: 'lg', label: isPut ? 'Buy Put (hedge)' : 'Buy Call (hedge)', side: 'Buy', wing: 0 },
    ]
  }
  return [
    { key: 'lc', label: 'Buy Call (hedge)', side: 'Buy', wing: 1 },
    { key: 'sc', label: 'Sell Call', side: 'Sell', wing: 1 },
    { key: 'sp', label: 'Sell Put', side: 'Sell', wing: -1 },
    { key: 'lp', label: 'Buy Put (hedge)', side: 'Buy', wing: -1 },
  ]
}
function num(row: Row, key: string) { const n = Number(row[key]); return Number.isFinite(n) ? n : 0 }
function strategyPhrase(strategy: string, bias: string) { const map: Record<string, string> = { 'No Trade': 'No Trade (event day)', 'Iron Condor': 'Iron Condor (range-bound, IV fair)', 'Credit Spread': 'Sell Credit Spread (range-bound, IV rich)', 'Debit Call Spread': 'Buy Call Spread (bullish, IV rich — avoid naked options)', 'Debit Put Spread': 'Buy Put Spread (bearish, IV rich — avoid naked options)', 'Naked Call': 'Buy Naked Call (bullish, IV fair)', 'Naked Put': 'Buy Naked Put (bearish, IV fair)' }; return map[strategy] ?? `${bias} setup pending calculation` }
function advanceDeclineRatio(row: Row) { const raw = String(row.advance_decline_ratio ?? ''); const parts = raw.match(/[\d.]+/g); if (!parts || parts.length < 2) return null; const [a, d] = parts.map(Number); return d > 0 ? a / d : null }
function breadthDirection(raw: string | number | boolean | null | undefined) { const text = String(raw ?? ''); const parts = text.match(/[\d.]+/g); if (!parts || parts.length < 2) return null; const [advances, declines] = parts.map(Number); if (advances > declines) return { label: 'Bullish breadth', arrow: '▲', tone: 'positive' }; if (declines > advances) return { label: 'Bearish breadth', arrow: '▼', tone: 'negative' }; return null }
const midRemapKeys: Record<string, string> = { atm_iv_nifty_mid: 'atm_iv_nifty', atm_iv_sensex_mid: 'atm_iv_sensex', pcr_nifty_mid: 'pcr_nifty', pcr_sensex_mid: 'pcr_sensex', max_pain_nifty_mid: 'max_pain_nifty', max_pain_sensex_mid: 'max_pain_sensex', atm_straddle_price_nifty_mid: 'atm_straddle_price_nifty', atm_straddle_price_sensex_mid: 'atm_straddle_price_sensex', atm_straddle_delta_nifty_mid: 'atm_straddle_delta_nifty', atm_straddle_delta_sensex_mid: 'atm_straddle_delta_sensex', atm_straddle_theta_nifty_mid: 'atm_straddle_theta_nifty', atm_straddle_theta_sensex_mid: 'atm_straddle_theta_sensex', advance_decline_ratio_mid: 'advance_decline_ratio' }
function buildMidRow(row: Row, mid: Row): Row { const overlay: Row = {}; for (const [midKey, targetKey] of Object.entries(midRemapKeys)) { if (mid[midKey] !== null && mid[midKey] !== undefined) overlay[targetKey] = mid[midKey] }; return { ...row, ...overlay, spot_nifty: mid.spot_nifty ?? null, spot_sensex: mid.spot_sensex ?? null, intraday_change_pct_nifty: mid.intraday_change_pct_nifty ?? null, intraday_change_pct_sensex: mid.intraday_change_pct_sensex ?? null } }
function resolveAtmSpot(row: Row, instrument: Instrument): number { const suffix = instrument === 'NIFTY' ? 'nifty' : 'sensex'; const direct = num(row, `spot_${suffix}`); if (direct) return direct; const prev = num(row, `prev_close_${suffix}`); const gapPoints = num(row, `gap_points_${suffix}`); if (prev && gapPoints) return prev + gapPoints; return prev }
export function calculateVerdict(row: Row, instrument: Instrument) { const n = instrument === 'NIFTY'; const suffix = n ? 'nifty' : 'sensex'; const prev = num(row, `prev_close_${suffix}`); const open = n ? num(row, 'nifty_opening_points') : 0; const gapPct = n ? num(row, 'gift_nifty_gap_pct') : num(row, 'gap_points_sensex') / prev * 100; const predicted = num(row, 'gift_nifty_gap_pct') / 100 * num(row, 'prev_close_nifty'); const difference = open - predicted; const pcr = num(row, `pcr_${suffix}`); const iv = num(row, `atm_iv_${suffix}`); const vix = num(row, 'india_vix'); const support = num(row, `oi_support_${suffix}`); const resistance = num(row, `oi_resistance_${suffix}`); const maxPain = num(row, `max_pain_${suffix}`); const oiChangeSupport = String(row[`oi_change_support_${suffix}`] ?? ''); const oiChangeResistance = String(row[`oi_change_resistance_${suffix}`] ?? ''); const adRatio = advanceDeclineRatio(row); let bullVotes = 0; let bearVotes = 0; const giftGap = num(row, 'gift_nifty_gap_pct'); if (giftGap > 0) bullVotes++; if (giftGap < 0) bearVotes++; if (pcr > 1.3) bullVotes++; if (pcr < 0.8) bearVotes++; if (oiChangeSupport === 'Addition') bullVotes++; if (oiChangeSupport === 'Unwinding') bearVotes++; if (oiChangeResistance === 'Unwinding') bullVotes++; if (oiChangeResistance === 'Addition') bearVotes++; if (adRatio !== null && adRatio > 1.5) bullVotes++; if (adRatio !== null && adRatio < 0.7) bearVotes++; const bias = bullVotes > bearVotes ? 'Bullish' : bearVotes > bullVotes ? 'Bearish' : 'Neutral'; const ivRead = iv - vix > 2 ? 'IV rich' : 'IV fair'; const range = Math.abs(gapPct) <= 0.75; const strategy = range && ivRead === 'IV fair' ? 'Iron Condor' : !range && ivRead === 'IV rich' ? (bias === 'Bullish' ? 'Debit Call Spread' : bias === 'Bearish' ? 'Debit Put Spread' : 'Iron Condor') : range && ivRead === 'IV rich' ? 'Credit Spread' : bias === 'Bullish' ? 'Naked Call' : bias === 'Bearish' ? 'Naked Put' : 'Iron Condor'; const straddle = num(row, `atm_straddle_price_${suffix}`); const dte = num(row, `days_to_expiry_${suffix}`); const avgMove5d = num(row, `avg_move_5d_${suffix}`); const estimateA = straddle / Math.sqrt(Math.max(dte, 1)); const estimateB = avgMove5d; const conservative = Math.min(estimateA, estimateB); const aggressive = Math.max(estimateA, estimateB); const target = conservative * 0.6; const stop = conservative * 0.3; const aggressiveTarget = aggressive * 0.6; const aggressiveStop = aggressive * 0.3; const strike: Strike = vix < 11 ? 'ATM' : vix <= 14 ? 'ITM1' : 'ITM2'; return { gapPct, prev, open, predicted, difference, pcr, iv, vix, support, resistance, maxPain, bias, ivRead, strategy, straddle, conservative, aggressive, target, stop, aggressiveTarget, aggressiveStop, strike, dte, oiSupport: oiChangeSupport || '—', oiResistance: oiChangeResistance || '—', chartSupport: num(row, `chart_support_${suffix}`), chartResistance: num(row, `chart_resistance_${suffix}`) } }
// Raw (non-defaulted) numeric read of a premarket_dashboard column — returns null when the source field is
// missing so callers can omit a reasoning line rather than fabricating a value from a 0 default.
function rawNum(row: Row, key: string): number | null { const v = row[key]; if (v === null || v === undefined || v === '') return null; const n = Number(v); return Number.isFinite(n) ? n : null }
type BiasLabel = 'Strong Bullish' | 'Bullish' | 'Neutral' | 'Bearish' | 'Strong Bearish'
type IvCondition = 'Cheap' | 'Normal' | 'Expensive'
// STAGE 1 — Market Bias: weighted-signal score (Gap/OI/PCR/MaxPain) with DTE-dependent weights, replacing the
// old vote-count `calc.bias` for display/strategy-selection purposes. `calc.bias` itself is left untouched
// since it still drives leg wing/side placement (out of scope here per strike/hedge placement logic).
function computeMarketBias(row: Row, calc: ReturnType<typeof calculateVerdict>, instrument: Instrument) {
  const suffix = instrument === 'NIFTY' ? 'nifty' : 'sensex'
  const gapPct = calc.gapPct
  const gapScore = gapPct > 0.75 ? 2 : gapPct >= 0.25 ? 1 : gapPct >= -0.25 ? 0 : gapPct >= -0.75 ? -1 : -2
  const pcr = calc.pcr
  const pcrScore = pcr > 1.3 ? 2 : pcr >= 0.8 ? 0 : -2
  const oiSupportScore = calc.oiSupport === 'Addition' ? 1 : calc.oiSupport === 'Unwinding' ? -1 : 0
  const oiResistanceScore = calc.oiResistance === 'Addition' ? -1 : calc.oiResistance === 'Unwinding' ? 1 : 0
  const oiScore = Math.max(-2, Math.min(2, oiSupportScore + oiResistanceScore))
  // Max Pain score requires the new spot_{nifty|sensex} column; if null, its score is simply 0 rather than
  // blocking the rest of the weighted sum.
  const spotRaw = rawNum(row, `spot_${suffix}`)
  const maxPainScore = spotRaw !== null && calc.maxPain ? (((spotRaw - calc.maxPain) / calc.maxPain) * 100 < -0.3 ? 1 : ((spotRaw - calc.maxPain) / calc.maxPain) * 100 > 0.3 ? -1 : 0) : 0
  const dte = calc.dte
  const weights = dte > 3 ? { gap: 0.45, oi: 0.25, pcr: 0.2, maxPain: 0.1 } : { gap: 0.25, oi: 0.45, pcr: 0.2, maxPain: 0.1 }
  const score = gapScore * weights.gap + oiScore * weights.oi + pcrScore * weights.pcr + maxPainScore * weights.maxPain
  const label: BiasLabel = score >= 1.25 ? 'Strong Bullish' : score >= 0.5 ? 'Bullish' : score > -0.5 ? 'Neutral' : score > -1.25 ? 'Bearish' : 'Strong Bearish'
  return { score, label }
}
// STAGE 2 — Option Readiness: combines VIX level and ATM-IV-vs-VIX into one score (resolving the old
// contradiction of two separate VIX/IV lines), plus a DTE component. Also derives IV Condition for Stage 3.
function computeOptionReadiness(calc: ReturnType<typeof calculateVerdict>) {
  const vix = calc.vix
  const vixScore = vix >= 11 && vix < 14 ? 2 : vix < 11 ? 1 : vix < 18 ? 0 : vix < 22 ? -1 : -2
  const delta = calc.iv - vix
  const ivVixScore = Math.abs(delta) <= 1 ? 1 : delta < 0 ? 2 : -1
  const dte = calc.dte
  const dteScore = dte <= 1 ? -1 : dte <= 4 ? 2 : 1
  const score = vixScore + ivVixScore + dteScore
  const label = score >= 4 ? 'Good to Buy' : score >= 1 ? 'Caution' : 'Avoid'
  const ivCondition: IvCondition = Math.abs(delta) <= 1 ? 'Normal' : delta < 0 ? 'Cheap' : 'Expensive'
  return { score, label, ivCondition }
}
// STAGE 3 — Strategy Recommendation: Bias label + IV Condition + VIX + DTE lookup, with a DTE/VIX safety
// filter applied after the initial pick (downgrade naked options near expiry; block fresh buying if VIX>22).
function computeStrategyRecommendation(biasLabel: BiasLabel, ivCondition: IvCondition, vix: number, dte: number) {
  const vixNormal = vix >= 11 && vix <= 18
  let recommendation: string
  let reason: string
  if (biasLabel === 'Strong Bullish' || biasLabel === 'Bullish') {
    if (vix > 18) { recommendation = 'Put Credit Spread'; reason = `bullish bias but VIX (${vix.toFixed(1)}) is high, so selling premium instead of buying` }
    else if (ivCondition === 'Expensive') { recommendation = 'Put Credit Spread'; reason = 'bullish bias with expensive IV, so selling premium instead of buying' }
    else if (biasLabel === 'Strong Bullish' && ivCondition === 'Cheap' && vixNormal) { recommendation = 'Naked Call'; reason = 'strong bullish bias with cheap IV and normal VIX' }
    else { recommendation = 'Call Debit Spread'; reason = `${biasLabel.toLowerCase()} bias with ${ivCondition.toLowerCase()} IV` }
  } else if (biasLabel === 'Strong Bearish' || biasLabel === 'Bearish') {
    if (vix > 18) { recommendation = 'Call Credit Spread'; reason = `bearish bias but VIX (${vix.toFixed(1)}) is high, so selling premium instead of buying` }
    else if (ivCondition === 'Expensive') { recommendation = 'Call Credit Spread'; reason = 'bearish bias with expensive IV, so selling premium instead of buying' }
    else if (biasLabel === 'Strong Bearish' && ivCondition === 'Cheap' && vixNormal) { recommendation = 'Naked Put'; reason = 'strong bearish bias with cheap IV and normal VIX' }
    else { recommendation = 'Put Debit Spread'; reason = `${biasLabel.toLowerCase()} bias with ${ivCondition.toLowerCase()} IV` }
  } else {
    if (vix > 18) { recommendation = 'Iron Condor'; reason = `neutral bias with high VIX (${vix.toFixed(1)}), so a defined-risk neutral trade` }
    else if (ivCondition === 'Expensive') { recommendation = 'Iron Condor'; reason = 'neutral bias with expensive IV — enough extra premium to justify selling a defined-risk neutral trade' }
    else if (ivCondition === 'Cheap') { recommendation = 'No Trade'; reason = 'neutral bias with cheap IV — no edge to sell premium and no directional conviction to buy' }
    else { recommendation = 'No Trade'; reason = 'neutral bias with fairly-priced IV — no extra premium to justify selling, and no directional edge to buy' }
  }
  if (dte <= 1 && recommendation === 'Naked Call') { recommendation = 'Call Debit Spread'; reason += `, downgraded from Naked Call since DTE is ${dte} (avoid naked options near expiry)` }
  if (dte <= 1 && recommendation === 'Naked Put') { recommendation = 'Put Debit Spread'; reason += `, downgraded from Naked Put since DTE is ${dte} (avoid naked options near expiry)` }
  if (vix > 22 && (recommendation === 'Naked Call' || recommendation === 'Naked Put' || recommendation === 'Call Debit Spread' || recommendation === 'Put Debit Spread')) { recommendation = 'No Trade'; reason += `, overridden since VIX (${vix.toFixed(1)}) is above 22 (avoid fresh option buying)` }
  return { recommendation, reason }
}
// Maps a Stage 3 recommendation string to the existing strategy dropdown + Call/Put side toggle. "No Trade"
// now maps to the dropdown's own 'No Trade' option (instead of silently falling back to Iron Condor as a
// placeholder and pre-sizing legs that were never recommended). Any other unhandled recommendation string
// still falls back to Iron Condor with `noTrade: true`, preserving prior behavior.
function mapRecommendationToStrategy(recommendation: string): { strategy: StrategyChoice; side?: Side; noTrade: boolean } {
  if (recommendation === 'Naked Call') return { strategy: 'Naked Call', noTrade: false }
  if (recommendation === 'Naked Put') return { strategy: 'Naked Put', noTrade: false }
  if (recommendation === 'Call Debit Spread') return { strategy: 'Debit Spread', side: 'Call', noTrade: false }
  if (recommendation === 'Put Debit Spread') return { strategy: 'Debit Spread', side: 'Put', noTrade: false }
  if (recommendation === 'Put Credit Spread') return { strategy: 'Credit Spread', side: 'Put', noTrade: false }
  if (recommendation === 'Call Credit Spread') return { strategy: 'Credit Spread', side: 'Call', noTrade: false }
  if (recommendation === 'Iron Condor') return { strategy: 'Iron Condor', noTrade: false }
  if (recommendation === 'No Trade') return { strategy: 'No Trade', noTrade: true }
  return { strategy: 'Iron Condor', noTrade: true }
}
function VerdictInstrument({ row, instrument }: { row: Row; instrument: Instrument }) {
  const calc = useMemo(() => calculateVerdict(row, instrument), [row, instrument])
  // 3-stage Bias / Option Readiness / Strategy Recommendation framework now drives autoStrategy (replacing the
  // old normalizeStrategy(calc.strategy) vote-based pick). calc.bias/calc.strategy themselves are left intact
  // since calc.bias still drives leg wing/side placement (strike/hedge placement logic, out of scope here).
  const marketBias = useMemo(() => computeMarketBias(row, calc, instrument), [row, calc, instrument])
  const optionReadiness = useMemo(() => computeOptionReadiness(calc), [calc])
  const strategyRec = useMemo(() => computeStrategyRecommendation(marketBias.label, optionReadiness.ivCondition, calc.vix, calc.dte), [marketBias, optionReadiness, calc])
  const mappedStrategy = useMemo(() => mapRecommendationToStrategy(strategyRec.recommendation), [strategyRec])
  const autoStrategy = mappedStrategy.strategy
  const isNoTrade = mappedStrategy.noTrade
  const [strategy, setStrategy] = useState<StrategyChoice>(autoStrategy)
  useEffect(() => { setStrategy(autoStrategy) }, [autoStrategy])
  const strikeStep = instrument === 'NIFTY' ? 50 : 100
  const autoAtm = useMemo(() => { const raw = resolveAtmSpot(row, instrument); return raw ? Math.round(raw / strikeStep) * strikeStep : raw }, [row, instrument, strikeStep])
  const [atmSpot, setAtmSpot] = useState(String(autoAtm || ''))
  useEffect(() => { setAtmSpot(String(autoAtm || '')) }, [autoAtm])
  // Iron Condor / Custom default to 4 strikes away from ATM (offset 4 = 200 pts NIFTY / 400 pts SENSEX), so the
  // short legs never default to plain ATM.
  const defaultOffsetForStrategy = (s: StrategyChoice) => (s === 'Iron Condor' || s === 'Custom' ? 4 : 0)
  const [offset, setOffset] = useState(String(defaultOffsetForStrategy(strategy)))
  const [delta, setDelta] = useState(String(deltaForOffset(defaultOffsetForStrategy(strategy))))
  useEffect(() => { const d = defaultOffsetForStrategy(strategy); setOffset(String(d)); setDelta(String(deltaForOffset(d))) }, [strategy])
  const offsetNumber = Number(offset) || 0
  const onOffsetChange = (v: string) => { setOffset(v); const n = Number(v) || 0; setDelta(String(deltaForOffset(n))) }
  const [lots, setLots] = useState('1')
  const lotSize = instrument === 'NIFTY' ? 65 : 20
  const qty = (Number(lots) || 0) * lotSize
  const defaultHedgeWidth = instrument === 'NIFTY' ? 200 : 300
  const [hedgeWidthInput, setHedgeWidthInput] = useState(String(defaultHedgeWidth))
  useEffect(() => { setHedgeWidthInput(String(defaultHedgeWidth)) }, [defaultHedgeWidth])
  const hedgeWidth = Number(hedgeWidthInput) || defaultHedgeWidth
  // Side toggle (Call side / Put side) for Debit/Credit Spread. Defaults from the Stage 3 recommendation's
  // mapped side when the recommendation is itself a Debit/Credit Spread, else from today's Bias — but is the
  // actual driver of leg construction from here on, fully user-overridable via the toggle below.
  const defaultSide: Side = mappedStrategy.side ?? (calc.bias === 'Bearish' ? 'Put' : 'Call')
  const [side, setSide] = useState<Side>(defaultSide)
  useEffect(() => { setSide(defaultSide) }, [defaultSide])
  const legs = useMemo(() => legsForStrategy(strategy, calc.bias, side), [strategy, calc.bias, side])
  const atmNumber = Number(atmSpot) || 0
  const roundedStrike = (value: number) => Math.round(value / strikeStep) * strikeStep
  const [legPremiums, setLegPremiums] = useState<Record<string, string>>({})
  useEffect(() => { setLegPremiums({}) }, [strategy, instrument])
  const [strikeOverrides, setStrikeOverrides] = useState<Record<string, string>>({})
  useEffect(() => { setStrikeOverrides({}) }, [strategy, instrument, atmNumber, offsetNumber])
  // Call strike = ATM + offset (further OTM as offset grows), Put strike = ATM − offset (further OTM as offset
  // grows). Call and Put legs must never share the same shifted strike.
  const callStrike = atmNumber + offsetNumber * strikeStep
  const putStrike = atmNumber - offsetNumber * strikeStep
  const computedStrike = (leg: LegDef) => {
    if (strategy === 'Naked Call') return callStrike
    if (strategy === 'Naked Put') return putStrike
    if (strategy === 'Debit Spread' || strategy === 'Credit Spread') {
      const primary = side === 'Put' ? putStrike : callStrike
      if (leg.wing !== 0) return primary
      return side === 'Put' ? primary - hedgeWidth : primary + hedgeWidth
    }
    if (leg.key === 'sc') return callStrike
    if (leg.key === 'sp') return putStrike
    if (leg.key === 'lc') return callStrike + hedgeWidth
    if (leg.key === 'lp') return putStrike - hedgeWidth
    return callStrike
  }
  const legRows = legs.map((leg) => { const computed = roundedStrike(computedStrike(leg)); const override = strategy === 'Custom' ? strikeOverrides[leg.key] : undefined; return { ...leg, strike: override !== undefined && override !== '' ? Number(override) : computed, displayStrike: override !== undefined && override !== '' ? override : String(computed) } })
  const netPremium = legRows.reduce((sum, leg) => { const p = Number(legPremiums[leg.key]) || 0; return sum + (leg.side === 'Sell' ? p : -p) }, 0)
  const hasAnyPremium = legRows.some((leg) => Number(legPremiums[leg.key]) !== 0)
  const effectiveDelta = Number(delta) || 0
  const estTarget = calc.target * effectiveDelta
  const estStop = calc.stop * effectiveDelta
  const estAggressiveTarget = calc.aggressiveTarget * effectiveDelta
  const estAggressiveStop = calc.aggressiveStop * effectiveDelta
  const isNetSeller = strategy === 'Credit Spread' || strategy === 'Iron Condor' || strategy === 'Custom'
  // Credit Spread / Iron Condor split Net Premium into distinct Conservative vs Aggressive pairs (60/40 and
  // 75/25) so the two columns diverge like the buyer-side strategies do via Expected Move, and Target now
  // exceeds Stop-loss in both columns. Custom keeps the older single 0.4/1.5 pair (out of scope for this
  // change). Naked Call/Naked Put/Debit Spread remain premium-invariant (points × delta only), untouched here.
  const isSpreadSeller = strategy === 'Credit Spread' || strategy === 'Iron Condor'
  const actualConservativeTarget = hasAnyPremium ? (isSpreadSeller ? netPremium * 0.6 : isNetSeller ? Math.max(0, netPremium * 0.4) : calc.target * effectiveDelta) : null
  const actualConservativeStop = hasAnyPremium ? (isSpreadSeller ? netPremium * 0.4 : isNetSeller ? netPremium * 1.5 : calc.stop * effectiveDelta) : null
  const actualAggressiveTarget = hasAnyPremium ? (isSpreadSeller ? netPremium * 0.75 : isNetSeller ? Math.max(0, netPremium * 0.4) : calc.aggressiveTarget * effectiveDelta) : null
  const actualAggressiveStop = hasAnyPremium ? (isSpreadSeller ? netPremium * 0.25 : isNetSeller ? netPremium * 1.5 : calc.aggressiveStop * effectiveDelta) : null
  const bookProfitConservative = actualConservativeTarget === null ? null : isSpreadSeller ? actualConservativeTarget * qty : actualConservativeTarget * qty * 0.6
  const bookStopConservative = actualConservativeStop === null ? null : isSpreadSeller ? actualConservativeStop * qty : actualConservativeStop * qty * 0.4
  const bookProfitAggressive = actualAggressiveTarget === null ? null : isSpreadSeller ? actualAggressiveTarget * qty : actualAggressiveTarget * qty * 0.6
  const bookStopAggressive = actualAggressiveStop === null ? null : isSpreadSeller ? actualAggressiveStop * qty : actualAggressiveStop * qty * 0.4
  const sync = Math.abs(calc.difference) <= 5 ? ['In Sync', 'success', 'Prediction is tracking the actual open.'] : Math.abs(calc.difference) <= 15 ? ['Minor Divergence', 'warning', 'Prediction is slightly away from the actual open.'] : ['Diverging', 'danger', 'Prediction is materially away from the actual open.']
  const realGapPct = calc.prev ? (calc.open / calc.prev) * 100 : calc.gapPct
  const summary = `${row.trade_date} · ${row.day_name}: ${instrument} opened ${realGapPct >= 0 ? '+' : ''}${realGapPct.toFixed(2)}% gap (${calc.open.toFixed(1)}). ${marketBias.label} bias with India VIX ${calc.vix.toFixed(1)} (${calc.vix < 11 ? 'low volatility — momentum only' : calc.vix <= 14 ? 'normal volatility — ATM / ITM by setup' : 'elevated volatility — prefer defined risk'}), ${calc.dte <= 7 ? 'Weekly' : 'Monthly'} expiry in ${calc.dte} days, ${calc.iv} versus VIX, PCR ${calc.pcr.toFixed(2)}, OI support ${calc.support.toFixed(0)} (${calc.oiSupport}) / resistance ${calc.resistance.toFixed(0)} (${calc.oiResistance}), chart ${calc.chartSupport.toFixed(0)}–${calc.chartResistance.toFixed(0)}, max pain ${calc.maxPain.toFixed(0)}.`
  return <article className="verdict-instrument">
    <div className="verdict-instrument-head">
      <h3>{instrument}<button type="button" className="semantic-info verdict-info" aria-label={`${instrument} verdict details`}><Info size={14} aria-hidden="true" /><span className="semantic-tooltip" role="tooltip">{summary}</span></button></h3>
    </div>
    <div className="sync-strip"><span>Predicted <b>{calc.predicted.toFixed(1)}</b></span><span>Actual <b>{calc.open.toFixed(1)}</b></span><span>Difference <b>{calc.difference >= 0 ? '+' : ''}{calc.difference.toFixed(1)}</b></span><strong className={`sync-${sync[1]}`}>{sync[0]}</strong><small>{sync[2]}</small></div>
    <div className="verdict-card verdict-strategy-summary">
      <div className="verdict-strategy-box">
        <span className="eyebrow">Your strategy</span>
        {isNoTrade && <p className="no-trade-banner" role="status">No Trade recommended today — {strategyRec.reason}. You can still select a strategy manually below.</p>}
        <div className="verdict-controls verdict-controls-wide">
          <select value={strategy} onChange={(e) => setStrategy(e.target.value as StrategyChoice)} aria-label={`${instrument} strategy override`}>
            {strategyChoices.map((choice) => <option key={choice} value={choice}>{choice}</option>)}
          </select>
          {(strategy === 'Debit Spread' || strategy === 'Credit Spread') && <div className="side-toggle" role="group" aria-label={`${instrument} spread side`}>
            <button type="button" className={side === 'Call' ? 'is-active' : ''} aria-pressed={side === 'Call'} onClick={() => setSide('Call')}>Call side</button>
            <button type="button" className={side === 'Put' ? 'is-active' : ''} aria-pressed={side === 'Put'} onClick={() => setSide('Put')}>Put side</button>
          </div>}
        </div>
        {autoStrategy !== strategy && <small className="strategy-suggestion">System suggested: {autoStrategy}</small>}
      </div>
      <div className="day-summary"><span className="eyebrow">Day summary</span><p>{summary}</p><div className="bias-reasoning"><p className="reasoning-line"><strong>Market Bias:</strong> {marketBias.label} (score {marketBias.score.toFixed(2)})</p><p className="reasoning-line"><strong>Option Readiness:</strong> {optionReadiness.label} (score {optionReadiness.score})</p><p className="reasoning-line"><strong>Strategy Recommendation:</strong> {strategyRec.recommendation}, because {strategyRec.reason}.</p></div></div>
    </div>
    {strategy === 'No Trade' ? <div className="verdict-card no-trade-leg-builder"><p className="structure-line">No Trade is selected — there&apos;s no position to size. Switch the dropdown above to a real strategy if you want to build a trade manually.</p></div> : <>
    <div className="verdict-card verdict-editable">
      <div className="verdict-controls verdict-controls-triple">
        <label>ATM spot<input type="number" step={strikeStep} value={atmSpot} onChange={(e) => setAtmSpot(e.target.value === '' ? '' : String(roundedStrike(Number(e.target.value))))} aria-label={`${instrument} ATM spot`} /></label>
        <label>Strikes from ATM<input type="number" step="1" value={offset} onChange={(e) => onOffsetChange(e.target.value)} aria-label={`${instrument} strikes from ATM`} /></label>
        <label>Delta<input type="number" min="0" max="1" step="0.01" value={delta} onChange={(e) => setDelta(e.target.value)} aria-label={`${instrument} effective delta`} /></label>
        {strategy !== 'Naked Call' && strategy !== 'Naked Put' && <label>Hedge width<input type="number" step={strikeStep} value={hedgeWidthInput} onChange={(e) => setHedgeWidthInput(e.target.value === '' ? '' : String(roundedStrike(Number(e.target.value))))} aria-label={`${instrument} hedge width`} /></label>}
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
    </>}
    {strategy !== 'No Trade' && <div className="position-calculator">
      <div className="position-head">
        <div><p className="eyebrow">Trade entry</p><strong>{strategy}</strong></div>
        <span>Live calculation</span>
      </div>
      <div className="leg-list">
        {legRows.map((leg) => <div className="leg-row" key={leg.key}>
          <span className={`leg-badge leg-${leg.side.toLowerCase()}`}>{leg.side}</span>
          <span className="leg-label">{leg.label}</span>
          <label>Strike<input type="number" step={strikeStep} value={leg.displayStrike} onChange={(e) => setStrikeOverrides((p) => ({ ...p, [leg.key]: e.target.value === '' ? '' : String(roundedStrike(Number(e.target.value))) }))} aria-label={`${instrument} ${leg.label} strike`} /></label>
          <label>Premium<input type="number" min="0" value={legPremiums[leg.key] ?? ''} onChange={(e) => setLegPremiums((p) => ({ ...p, [leg.key]: e.target.value }))} placeholder="Enter fill" aria-label={`${instrument} ${leg.label} premium`} /></label>
        </div>)}
      </div>
      <div className="position-outputs">
        <span>Net Premium ({isNetSeller ? 'received' : 'paid'}) <b>{hasAnyPremium ? `₹${netPremium.toFixed(1)}` : 'Not entered yet'}</b></span>
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
      {hasAnyPremium && <div className="verdict-card verdict-tracks actual-tracks book-levels">
        <div className="track-columns">
          <div className="track-column"><div className="track-header"><i></i><span>Conservative</span></div><div className="track-row actual-target"><span>Book profit at</span><em>₹{bookProfitConservative?.toFixed(0)}</em></div><div className="track-row actual-stop"><span>Book stop at</span><em>₹{bookStopConservative?.toFixed(0)}</em></div></div>
          <div className="track-column"><div className="track-header"><i></i><span>Aggressive</span></div><div className="track-row actual-target"><span>Book profit at</span><em>₹{bookProfitAggressive?.toFixed(0)}</em></div><div className="track-row actual-stop"><span>Book stop at</span><em>₹{bookStopAggressive?.toFixed(0)}</em></div></div>
        </div>
      </div>}
      {!hasAnyPremium && <p className="structure-line">Enter fill premiums above to compute actual target / stop-loss and book levels.</p>}
    </div>}
    <div className="verdict-rationale"><span>Rationale</span><p>{calc.bias} bias from gap direction, PCR positioning, max pain pull, and OI level action; {calc.ivRead} conditions favor {calc.strategy.toLowerCase()}.</p></div>
  </article>
}
function VerdictView({ row }: { row: Row }) { const eventFlag = useMemo(() => highImpactEvent(row.event_today as string | null), [row.event_today]); return <section className="phase-view verdict-view"><div className="review-section-head"><div><p className="eyebrow">After Market Open</p><h2>Verdict</h2></div><span>Calculated strategy</span></div>{eventFlag && <div className="event-caution"><AlertTriangle size={16} /><span><strong>{eventFlag.name}</strong> — high impact event at {eventFlag.time}. Trade with caution.</span></div>}<div className="verdict-instruments"><VerdictInstrument row={row} instrument="NIFTY" /><VerdictInstrument row={row} instrument="SENSEX" /></div></section> }
function OutcomeBadge({ label, target, sl }: { label: string; target?: boolean; sl?: boolean }) { const text = target === true ? 'Target hit' : sl === true ? 'SL hit' : target === false && sl === false ? 'Neither' : 'Not yet available'; const cls = target === true ? 'outcome-hit' : sl === true ? 'outcome-stop' : 'outcome-neutral'; return <div className={`outcome-badge ${cls}`}><span>{label}</span><strong>{text}</strong></div> }
function MidVerdictInstrument({ row, mid, midSnapshot, instrument }: { row: Row; mid: Row; midSnapshot: Row; instrument: Instrument }) {
  const calc = useMemo(() => calculateVerdict(mid, instrument), [mid, instrument])
  const suffix = instrument === 'NIFTY' ? 'nifty' : 'sensex'
  const spotKey = `spot_${suffix}`
  const changeKey = `intraday_change_pct_${suffix}`
  // Same 3-stage Bias / Option Readiness / Strategy Recommendation framework the Verdict page's
  // VerdictInstrument uses (replacing the old vote-based calc.bias, Trend/Range calc.strategy, and "IV
  // rich"/"IV fair" reading here), fed the merged mid-row (buildMidRow output) so it reflects midday data.
  // calc.bias/calc.strategy themselves are left untouched since calculateVerdict still drives other logic.
  const marketBias = useMemo(() => computeMarketBias(mid, calc, instrument), [mid, calc, instrument])
  const optionReadiness = useMemo(() => computeOptionReadiness(calc), [calc])
  const strategyRec = useMemo(() => computeStrategyRecommendation(marketBias.label, optionReadiness.ivCondition, calc.vix, calc.dte), [marketBias, optionReadiness, calc])
  const effectiveDelta = strikeDefaults[calc.strike]
  // "Since morning" comparison: morning bias/strategy read from the original premarket_dashboard row (not the
  // mid-merged row), and the shift flags/note read from the raw midmarket_snapshot row — neither is currently
  // overlaid into `mid` by buildMidRow.
  const morningBias = String(row[`market_bias_${suffix}`] ?? '—')
  const morningStrategy = String(row[`suggested_strategy_${suffix}`] ?? '—')
  const biasShifted = Boolean(midSnapshot[`bias_shifted_${suffix}`])
  const strategyShifted = Boolean(midSnapshot[`strategy_shifted_${suffix}`])
  const hasShifted = biasShifted || strategyShifted
  const shiftNote = String(midSnapshot[`shift_note_${suffix}`] ?? '')
  return <article className="verdict-instrument"><div className="verdict-instrument-head"><h3>{instrument}</h3><span>{marketBias.label} · {strategyRec.recommendation}</span></div><div className="sync-strip"><span>Spot <b>{value(mid, spotKey)}</b></span><span>Intraday change <b className={tone(mid, changeKey)}>{value(mid, changeKey, true)}</b></span></div><div className="verdict-banner"><div><p className="eyebrow">Midday strategy read</p><strong>{strategyRec.recommendation}</strong><p>{strategyRec.reason}.</p></div></div><div className="verdict-card since-morning-card"><span className="eyebrow">Since morning</span><div className="since-morning-row"><span className="since-morning-label">Bias</span><span className={`since-morning-value ${biasShifted ? 'is-shifted' : 'is-unchanged'}`}>{morningBias} → {marketBias.label}</span></div><div className="since-morning-row"><span className="since-morning-label">Strategy</span><span className={`since-morning-value ${strategyShifted ? 'is-shifted' : 'is-unchanged'}`}>{morningStrategy} → {strategyRec.recommendation}</span></div><p className="since-morning-note">{hasShifted ? (shiftNote || 'Shifted since this morning.') : 'Unchanged since this morning.'}</p></div><div className="verdict-grid"><div className="verdict-card verdict-tracks"><div className="track-columns"><div className="track-column"><div className="track-header"><i></i><span>Conservative</span></div><strong className="track-move">{calc.conservative.toFixed(1)} pts</strong><div className="track-row"><span>↑ Target</span><b className="target-value">{calc.target.toFixed(1)} pts</b><em>₹{(calc.target * effectiveDelta).toFixed(1)}</em></div><div className="track-row"><span>↓ Stop-loss</span><b className="stop-value">{calc.stop.toFixed(1)} pts</b><em>₹{(calc.stop * effectiveDelta).toFixed(1)}</em></div></div><div className="track-column"><div className="track-header"><i></i><span>Aggressive</span></div><strong className="track-move">{calc.aggressive.toFixed(1)} pts</strong><div className="track-row"><span>↑ Target</span><b className="target-value">{calc.aggressiveTarget.toFixed(1)} pts</b><em>₹{(calc.aggressiveTarget * effectiveDelta).toFixed(1)}</em></div><div className="track-row"><span>↓ Stop-loss</span><b className="stop-value">{calc.aggressiveStop.toFixed(1)} pts</b><em>₹{(calc.aggressiveStop * effectiveDelta).toFixed(1)}</em></div></div></div></div></div></article>
}
function MidMarketView({ row, midSnapshot }: { row: Row; midSnapshot: Row | null | undefined }) {
  if (midSnapshot === undefined) return <section className="phase-view special-view"><div className="review-section-head"><div><p className="eyebrow">Open → Mid snapshot</p><h2>Mid-market</h2></div><span>Compared to morning call</span></div><p className="history-empty">Loading mid-market data…</p></section>
  if (!midSnapshot) return <section className="phase-view special-view"><div className="review-section-head"><div><p className="eyebrow">Open → Mid snapshot</p><h2>Mid-market</h2></div><span>Compared to morning call</span></div><p className="history-empty">Mid-market data not available yet — updates at 12:45 PM IST.</p></section>
  const mid = buildMidRow(row, midSnapshot)
  return <section className="phase-view special-view verdict-view"><div className="review-section-head"><div><p className="eyebrow">Open → Mid snapshot</p><h2>Mid-market</h2></div><span>Compared to morning call</span></div><div className="verdict-instruments"><MidVerdictInstrument row={row} mid={mid} midSnapshot={midSnapshot} instrument="NIFTY" /><MidVerdictInstrument row={row} mid={mid} midSnapshot={midSnapshot} instrument="SENSEX" /></div></section>
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
  const fields = phaseFields[phase] ?? []
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
  const { data: historyData } = useSWR<HistoryExtras | null>('premarket-dashboard-history', async () => {
    const { data: dashboardRows, error } = await supabase.from('premarket_dashboard').select('*').order('trade_date', { ascending: false }).limit(15)
    if (error) throw error
    const rows = (dashboardRows ?? []) as Row[]
    const tradeDates = rows.map((r) => r.trade_date).filter((d): d is string => typeof d === 'string')
    if (tradeDates.length === 0) return { rows, mid: {}, post: {}, trade: {} }
    const [{ data: midRows, error: midError }, { data: postRows, error: postError }, { data: tradeRows, error: tradeError }] = await Promise.all([
      supabase.from('midmarket_snapshot').select('*').in('trade_date', tradeDates),
      supabase.from('postmarket_summary').select('*').in('trade_date', tradeDates),
      supabase.from('auto_trades').select('trade_date, instrument, outcome').in('trade_date', tradeDates),
    ])
    if (midError) throw midError
    if (postError) throw postError
    if (tradeError) throw tradeError
    const mid: Record<string, Row> = {}
    for (const m of (midRows ?? []) as Row[]) { const d = String(m.trade_date ?? ''); if (d) mid[d] = m }
    const post: Record<string, Row> = {}
    for (const p of (postRows ?? []) as Row[]) { const d = String(p.trade_date ?? ''); if (d) post[d] = p }
    const trade: Record<string, Row> = {}
    for (const t of (tradeRows ?? []) as Row[]) { const d = String(t.trade_date ?? ''); if (d && t.instrument === 'NIFTY') trade[d] = t }
    return { rows, mid, post, trade }
  }, { revalidateOnFocus: false })
  const row = liveRow ? Object.fromEntries(Object.keys(visualRow).map((key) => [key, liveRow[key] ?? visualRow[key]])) as Row : visualRow
  const { data: midSnapshot } = useSWR<Row | null>(row.trade_date ? ['midmarket-snapshot', row.trade_date] : null, async () => { const { data, error } = await supabase.from('midmarket_snapshot').select('*').eq('trade_date', row.trade_date).order('trade_date', { ascending: false }).limit(1).maybeSingle(); if (error) throw error; return data as Row | null }, { revalidateOnFocus: false })
  const { data: postSummary } = useSWR<Row | null>(row.trade_date ? ['postmarket-summary', row.trade_date] : null, async () => { const { data, error } = await supabase.from('postmarket_summary').select('*').eq('trade_date', row.trade_date).order('trade_date', { ascending: false }).limit(1).maybeSingle(); if (error) throw error; return data as Row | null }, { revalidateOnFocus: false })
  useEffect(() => { document.documentElement.classList.toggle('dark', dark) }, [dark])
  useEffect(() => { const updateClock = () => { const now = new Date(); const options = { timeZone: 'Asia/Kolkata' } as const; setLiveDate(new Intl.DateTimeFormat('en-IN', { ...options, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)); setLiveDay(new Intl.DateTimeFormat('en-IN', { ...options, weekday: 'long' }).format(now)); setLiveTime(new Intl.DateTimeFormat('en-IN', { ...options, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }).format(now)) }; updateClock(); const timer = window.setInterval(updateClock, 1000); return () => window.clearInterval(timer) }, [])
  return <main className="app-shell"><header className="topbar"><button className="icon-button mobile-menu" onClick={() => setNavOpen(!navOpen)} aria-label="Toggle navigation"><Menu size={18} /></button><div className="brand-mark"><div className="brand-symbol"><BarChart3 size={16} /></div><div><strong>MarketCue</strong><span>TRADE ANALYSIS PLATFORM</span></div></div><span className="topbar-date">{liveDate || row?.trade_date || 'No current row'} · {liveDay || row?.day_name || 'Session date'} · {liveTime || '—'} IST</span><div className="topbar-meta"><button className="icon-button" onClick={() => location.reload()} aria-label="Refresh dashboard"><RefreshCw size={16} /></button><button className="icon-button" onClick={() => setDark(!dark)} aria-label="Toggle theme">{dark ? <Sun size={16} /> : <Moon size={16} />}</button></div></header><div className="workspace"><aside className={`sidebar ${navOpen ? '' : 'closed'}`}><div className="side-label">SESSION MAP</div>{phases.map(({ id, label, subtitle, icon: Icon }) => <button key={id} className={`phase-nav ${phase === id ? 'active' : ''}`} onClick={() => setPhase(id)}><Icon size={17} /><span><strong>{label}</strong><small>{subtitle}</small></span><ChevronRight size={14} /></button>)}<div className="side-rule" /></aside><div className="content">{phase === 'rules' ? <RulesView /> : phase === 'history' ? <HistoryView data={historyData} /> : phase === 'verdict' ? <VerdictView row={row} /> : phase === 'mid' ? <MidMarketView row={row} midSnapshot={midSnapshot} /> : phase === 'trade' ? <TradeView /> : phase === 'post' ? <PostMarketView row={row} postSummary={postSummary} /> : <PhaseView phase={phase} row={row} />}<footer className="data-footer"><span><CheckCircle2 size={14} /> {liveRow ? 'Live Supabase data' : 'Visual preview data'}</span><span>Snapshot: {row.trade_date}</span></footer></div></div></main>
}
