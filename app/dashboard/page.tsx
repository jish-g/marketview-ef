'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { BrandSymbol } from '@/components/brand-mark'
import Link from 'next/link'
import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'
import { TradeView } from '@/components/trade-view'
import { JournalView } from '@/components/journal-view'
import { useSession } from '@/hooks/use-session'
import { fmt, freshness } from '@/lib/format'
import { ScoreBreakdown, Disclaimer, EmptyState, Band, FreshnessStamp, ProvenanceBadge, BiasAxis, CheckpointTimeline, Progress, PhaseAside, Label, Metric, Banner, TradeLevels, Card, type Checkpoint } from '@/components/ui/ds'
import { useIsMobile } from '@/hooks/use-media-query'
import { Activity, AlertTriangle, ArrowDown, ArrowUp, BarChart3, BookOpen, CheckCircle2, ChevronRight, Clock3, Gauge, Info, Layers3, LogIn, LogOut, Menu, Moon, PenLine, RefreshCw, RotateCcw, Sun } from 'lucide-react'
import { Line, LineChart, ReferenceLine, ResponsiveContainer, XAxis, YAxis } from 'recharts'
type Row = Record<string, string | number | boolean | null>
type Phase = 'premarket' | 'open' | 'verdict' | 'mid' | 'post' | 'journal' | 'rules' | 'history' | 'trade'
const phases = [
  { id: 'premarket' as Phase, label: 'Pre-market', subtitle: 'Overnight setup', icon: Clock3 },
  { id: 'open' as Phase, label: 'Market open', subtitle: 'Opening auction', icon: Activity },
  { id: 'verdict' as Phase, label: 'Verdict', subtitle: 'Strategy selection', icon: CheckCircle2 },
  { id: 'mid' as Phase, label: 'Mid-market', subtitle: 'Intraday read', icon: Gauge },
  { id: 'trade' as Phase, label: 'Trade', subtitle: 'Live positions', icon: ArrowUp },
  { id: 'post' as Phase, label: 'Post-market', subtitle: 'Review & learn', icon: Layers3 },
  { id: 'journal' as Phase, label: 'Journal', subtitle: 'Daily trade notes', icon: PenLine },
  { id: 'rules' as Phase, label: 'Rules engine', subtitle: 'Interpretation guide', icon: BookOpen },
  { id: 'history' as Phase, label: 'History', subtitle: 'Prior snapshots', icon: BarChart3 },
]
const phaseFields: Partial<Record<Phase, { label: string; key: string; pct?: boolean }[]>> & Pick<Record<Phase, { label: string; key: string; pct?: boolean }[]>, 'premarket' | 'open' | 'mid' | 'post'> = {
  premarket: ([
    ['Event today', 'event_today'], ['India VIX', 'india_vix'], ['GIFT Nifty gap (Nifty expected to open)', 'gift_nifty_gap_pct', true], ['Expiry', 'days_to_expiry_nifty'], ['Expiry', 'days_to_expiry_sensex'], ['5D average move', 'avg_move_5d_nifty'], ['5D average move', 'avg_move_5d_sensex'], ['Prior Day Closed', 'prev_day_change_pct_nifty', true], ['Prior Day Closed', 'prev_day_change_pct_sensex', true], ['Chart Support (1D Pivot)', 'chart_support_nifty'], ['Chart Resistance (1D Pivot)', 'chart_resistance_nifty'], ['Chart Support (1D Pivot)', 'chart_support_sensex'], ['Chart Resistance (1D Pivot)', 'chart_resistance_sensex'], ['OI support', 'oi_support_nifty'], ['OI resistance', 'oi_resistance_nifty'], ['OI support', 'oi_support_sensex'], ['OI resistance', 'oi_resistance_sensex'],
  ] as const).map(([label, key, pct]) => ({ label, key, pct: Boolean(pct) })),
  open: ([
    ['Opening points', 'nifty_opening_points'], ['Advance / decline', 'advance_decline_ratio'], ['Previous close', 'prev_close_nifty'], ['Previous close', 'prev_close_sensex'], ['Gap points', 'gap_points_nifty'], ['Gap points', 'gap_points_sensex'], ['ATM IV', 'atm_iv_nifty'], ['ATM IV', 'atm_iv_sensex'], ['Straddle', 'atm_straddle_price_nifty'], ['Straddle', 'atm_straddle_price_sensex'], ['Delta', 'atm_straddle_delta_nifty'], ['Delta', 'atm_straddle_delta_sensex'], ['Theta', 'atm_straddle_theta_nifty'], ['Theta', 'atm_straddle_theta_sensex'], ['PCR', 'pcr_nifty'], ['PCR', 'pcr_sensex'], ['Max pain', 'max_pain_nifty'], ['Max pain', 'max_pain_sensex'],
  ] as const).map(([label, key]) => ({ label, key, pct: false })),
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

// Why a field is empty, in words. Criterion 8: an em dash tells the reader nothing.
const EMPTY_REASON: Record<string, [string, string]> = {
  event_today: ['None scheduled', 'No RBI, inflation or earnings event today.'],
  advance_decline_ratio: ['Not published', 'NSE releases breadth after 09:20 IST.'],
  mid_advance_decline_ratio: ['Not published', 'NSE releases breadth after 09:20 IST.'],
  post_advance_decline_ratio: ['Not published', 'NSE releases breadth after the close.'],
  india_vix: ['Not captured', 'The pre-market checkpoint has not run yet.'],
}
function emptyRead(key: string): [string, string] {
  return EMPTY_REASON[key] ?? ['Not captured', 'This checkpoint has not reported a value yet.']
}
// Spec §1: the OI interpretation carries colour, the level stays ink. Direction depends on
// WHICH level moved -- addition at support strengthens it (+1), addition at resistance caps
// the move (-1) -- which is what blanket-green got wrong before.
function oiSide(key: string) { return /resistance/i.test(key) ? 'resistance' : 'support' }
function oiReading(key: string, action: string) {
  const a = action.toLowerCase()
  const side = oiSide(key)
  if (a === 'addition') return side === 'support' ? 'Addition · strengthening +1' : 'Addition · capping \u22121'
  if (a.includes('unwinding')) return side === 'support' ? 'Unwinding · weakening \u22121' : 'Unwinding · releasing +1'
  return action
}
function oiTone(key: string, action: string) {
  const a = action.toLowerCase()
  const side = oiSide(key)
  const bullish = (a === 'addition' && side === 'support') || (a.includes('unwinding') && side === 'resistance')
  const bearish = (a === 'addition' && side === 'resistance') || (a.includes('unwinding') && side === 'support')
  return bullish ? 'is-strengthening' : bearish ? 'is-capping' : ''
}
function value(row: Row | null, key: string, pct = false) { const v = row?.[key]; if (v === null || v === undefined || v === '') return 'Not available'; const numeric = Number(v); const display = String(v); if (pct) return fmt.pct(numeric); if (/days_to_expiry/.test(key)) return `${display} day${numeric === 1 ? '' : 's'}`; if (/avg_move/.test(key)) return fmt.ptsAbs(numeric); if (/_pts_|gap_points|opening_points/.test(key)) return fmt.pts(numeric); if (/prev_close|max_pain|oi_support|oi_resistance|chart_support|chart_resistance|post_close/.test(key) && Number.isFinite(numeric)) return fmt.level(numeric); if (/^pcr_|^mid_pcr_|atm_iv|india_vix/.test(key) && Number.isFinite(numeric)) return fmt.ratio(numeric); if (/points|support|resistance|prev_close|opening|straddle|max_pain|avg_move|theta|close/.test(key)) return display; return display }
function fmtTimeIST(v: any) { if (!v) return null; return new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(v)) }
// Colour for a signed change in value. The row-based tone() below reads a field; this takes
// a number already in hand, for figures computed rather than read straight off the row.
// Rule 1: --up/--down mark a signed change in value and nothing else. Levels, strikes,
// expiry countdowns, volatility readings, averages and previous closes render in ink.
// Everything outside this list stays ink no matter what sign its number happens to carry.
const SIGNED_CHANGE_KEYS = /^(gap_points_|nifty_opening_points|prev_day_change_(pct|pts)_|day_change_pct_|india_vix_change_pct|gift_nifty_gap_(pct|pts)|post_day_change_pct_)/

function signTone(n: number | null | undefined) {
  if (n == null || !Number.isFinite(Number(n)) || Number(n) === 0) return ''
  return Number(n) > 0 ? 'positive' : 'negative'
}
function tone(row: Row | null, key: string) { if (!SIGNED_CHANGE_KEYS.test(key)) return ''; const n = Number(row?.[key]); return Number.isNaN(n) || n === 0 ? '' : n > 0 ? 'positive' : 'negative' }
function gapBandLabel(gapPct: number) { if (gapPct > 0.75) return 'Strong Gap Up'; if (gapPct >= 0.25) return 'Normal Gap Up'; if (gapPct >= -0.25) return 'Flat'; if (gapPct >= -0.75) return 'Normal Gap Down'; return 'Strong Gap Down' }
function highImpactEvent(eventToday: string | null | undefined) { const text = String(eventToday ?? ''); if (!text.includes('(High')) return null; const match = text.match(/^(.*?)\s*\(High,\s*([^)]+)\)/); if (!match) return null; return { name: match[1].trim(), time: match[2].trim() } }

function RulesView({ row }: { row: Row | null }) {
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
  const calc = row ? calculateVerdict(row, 'NIFTY') : null
  const bias = row && calc ? computeMarketBias(row, calc, 'NIFTY') : null
  const readiness = calc ? computeOptionReadiness(calc) : null
  const strategyRec = bias && readiness && calc ? computeStrategyRecommendation(bias.label, readiness.ivCondition, calc.vix, calc.dte) : null

  return <section className="phase-view rules-view">

    <div className="review-section-head rules-header"><div><p className="eyebrow">Interpretation guide</p><h2>Rules engine</h2></div><div className="phase-head-aside"><a className="action-button rules-reference-link" href="/rules">Open the full reference <ChevronRight size={15} /></a></div></div>
    {bias && readiness && strategyRec && <div className="scoring-path">
      <Label>Today&apos;s scoring path</Label>
      <div className="scoring-path-chips">
        <span className="ds-badge ds-badge--neutral">Bias {fmt.score(bias.score)} · {bias.label}</span>
        <span className="scoring-path-arrow" aria-hidden="true">→</span>
        <span className="ds-badge ds-badge--caution">Readiness {readiness.score} · {readiness.label}</span>
        <span className="scoring-path-arrow" aria-hidden="true">→</span>
        <span className="ds-badge ds-badge--outline">{strategyRec.recommendation}</span>
      </div>
      <p className="scoring-path-note">Each step is a table lookup, not a judgement. Change any input and the path changes with it — that is the whole claim.</p>
    </div>}

    <div className="rules-stage-summary">
      <Card><strong>Stage 1 · Market bias</strong><span className="rules-stage-summary-note">Gap, OI structure, PCR and max pain, weighted by days to expiry, mapped to five bands.</span></Card>
      <Card><strong>Stage 2 · Option readiness</strong><span className="rules-stage-summary-note">India VIX, IV versus VIX and days to expiry summed from −4 to +6, mapped to three bands.</span></Card>
      <Card><strong>Stage 3 · Strategy</strong><span className="rules-stage-summary-note">Bias band against IV condition, VIX and DTE. An Avoid reading forces no trade regardless of bias.</span></Card>
    </div>

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
type HistoryExtras = { rows: Row[]; mid: Record<string, Row>; midAll: Record<string, Row[]>; post: Record<string, Row>; trade: Record<string, Row> }

function historyOutcomeRead(trade: Row | undefined) {
  const outcome = trade?.outcome
  if (outcome === 'target') return { label: 'Target Hit', cls: 'outcome-hit' }
  if (outcome === 'stop') return { label: 'SL Hit', cls: 'outcome-stop' }
  if (outcome === 'open') return { label: 'Trade still open', cls: 'outcome-neutral' }
  return { label: 'No trade logged', cls: 'outcome-neutral' }
}

// One trading day told as a 4-beat story: Opening (real gap), Expected (fresh morning-call recompute),
// Through the day (midday bias read from midmarket_snapshot's own stored value), Close (actual outcome).
// Beat 2 is recomputed here with the same computeMarketBias/computeOptionReadiness/computeStrategyRecommendation
// functions the Verdict page uses -- pre-market has all 4 inputs those functions need, so recomputing is fine.
// Beat 3 reads midSnapshot's market_bias_{suffix}_mid / suggested_strategy_{suffix}_mid directly instead,
// since midmarket_snapshot has no open-interest columns and no gap field -- recomputing here was silently
// missing 2 of computeMarketBias's 4 inputs and pinning almost every midday reading to "Neutral" regardless
// of the real intraday move (verified against real PCR/spot/max-pain swings on 2026-08-26, where the stored
// value correctly moved Neutral -> Bearish -> Strong Bearish through the day).
// Reference #s-history renders "Fri, 11 Sept", not an ISO date with the weekday beside it.
function historyDateLabel(row: Row): string {
  const raw = row.trade_date ? String(row.trade_date) : null
  if (!raw) return 'Date not recorded'
  const d = new Date(`${raw}T00:00:00+05:30`)
  if (Number.isNaN(d.getTime())) return raw
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short' })
    .format(d).replace(/^(\w+)\s/, '$1, ')
}

function HistoryDayCard({ row, mid: midSnapshot, post, trade }: { row: Row; mid: Row | undefined; post: Row | undefined; trade: Row | undefined }) {
  const instrument: Instrument = 'NIFTY'
  const suffix = 'nifty'

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

  // Beat 3 — Through the day: midday bias/strategy read directly from midSnapshot's own stored columns.
  const hasMidday = Boolean(midSnapshot && midSnapshot[`market_bias_${suffix}_mid`] != null)
  const middayBiasLabel = midSnapshot ? String(midSnapshot[`market_bias_${suffix}_mid`] ?? 'Not available') : 'Not available'
  const middayStrategy = midSnapshot ? String(midSnapshot[`suggested_strategy_${suffix}_mid`] ?? 'Not available') : 'Not available'
  const shifted = midSnapshot ? Boolean(midSnapshot[`bias_shifted_${suffix}`]) || Boolean(midSnapshot[`strategy_shifted_${suffix}`]) : false

  // Beat 4 — Close: postmarket_summary as-is (day_change_pct_nifty already reflects the corrected net_change
  // calculation), plus the actual logged auto_trades outcome for the day — not a range-based estimate.
  const outcome = historyOutcomeRead(trade)

  return <article className="history-day-card">
    <div className="history-day-head">
      <strong className="history-day-date">{historyDateLabel(row)}</strong>
      <span className={`ds-badge ds-badge--${morningBias.label === 'Bullish' || morningBias.label === 'Strong Bullish' ? 'up' : morningBias.label === 'Bearish' || morningBias.label === 'Strong Bearish' ? 'down' : 'neutral'}`}>
        {morningBias.label === 'Bullish' || morningBias.label === 'Strong Bullish' ? '\u2191' : morningBias.label === 'Bearish' || morningBias.label === 'Strong Bearish' ? '\u2193' : '\u2192'} {morningBias.label}
      </span>
      {post && <span className={`history-close-pill ${tone(post, 'day_change_pct_nifty')}`}>{value(post, 'day_change_pct_nifty', true)}</span>}
    </div>
    <div className="history-beats">
      <div className="history-beat">
        <span className="history-beat-label">Pre-market</span>
        {hasOpening ? <p><b className={openGapPct >= 0 ? 'positive' : 'negative'}>{fmt.pct(openGapPct)}</b> gap ({fmt.pts(gapPoints)}) — {gapBandLabel(openGapPct)}</p> : <p className="history-beat-empty">No opening data recorded</p>}
      </div>
      <div className="history-beat">
        <span className="history-beat-label">Verdict</span>
        <p><b>{morningBias.label}</b> bias · {morningStrategy.recommendation}</p>
      </div>
      <div className="history-beat">
        <span className="history-beat-label">Checkpoints</span>
        {hasMidday ? <p><b className={shifted ? 'is-shifted' : ''}>{middayBiasLabel}</b> bias · {middayStrategy}<br /><span className="history-beat-note">{shifted ? 'Shifted since the morning call' : 'Unchanged since the morning call'}</span></p> : <p className="history-beat-empty">No midday snapshot recorded</p>}
      </div>
      <div className="history-beat">
        <span className="history-beat-label">Outcome</span>
        {post ? <p>Close <b className={tone(post, 'day_change_pct_nifty')}>{value(post, 'day_change_pct_nifty', true)}</b>, high/low {value(post, 'day_high_nifty')} / {value(post, 'day_low_nifty')}<br /><span className={outcome.cls}>{outcome.label}</span></p> : <p className="history-beat-empty">Post-market data not available</p>}
      </div>
    </div>
  </article>
}

function HistoryView({ data }: { data: HistoryExtras | null | undefined }) {
  const rows = data?.rows
  return <section className="phase-view"><div className="review-section-head"><div><p className="eyebrow">Prior snapshots</p><h2>History</h2></div><PhaseAside /></div><div className="history-list history-days">{!rows ? <p className="history-empty">Loading history…</p> : rows.length === 0 ? <p className="history-empty">No history rows available yet.</p> : rows.map((row) => <HistoryDayCard key={String(row.trade_date)} row={row} mid={data?.mid[String(row.trade_date)]} post={data?.post[String(row.trade_date)]} trade={data?.trade[String(row.trade_date)]} />)}</div></section>
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
// Formats each session phase's data-freshness label for its eyebrow, e.g. "UPDATED 08:58 IST"
// once today's row has been written by that phase, or "UPDATES AT 08:58 IST" (using the
// scheduled time) while today's row for that phase is still pending.
// Same VIX bands as computeOptionReadiness's vixScore, expressed as a plain volatility read
// rather than a trading instruction — kept in sync so Market Open's summary agrees with Verdict.
function vixCondition(vix: number): string {
  if (vix >= 11 && vix < 14) return 'Favorable volatility'
  if (vix < 11) return 'Low volatility'
  if (vix < 18) return 'Normal volatility'
  if (vix < 22) return 'Elevated volatility'
  return 'High volatility'
}
function syncLabel(row: Row | null | undefined, scheduledIST: string): string {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
  const tradeDate = row?.trade_date ? String(row.trade_date) : null
  const updatedAt = row?.updated_at ? String(row.updated_at) : null
  if (tradeDate === today && updatedAt) {
    const time = new Date(updatedAt).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false })
    return `UPDATED ${time} IST`
  }
  return `UPDATES AT ${scheduledIST} IST`
}

function breadthDirection(raw: string | number | boolean | null | undefined) { const text = String(raw ?? ''); const parts = text.match(/[\d.]+/g); if (!parts || parts.length < 2) return null; const [advances, declines] = parts.map(Number); if (advances > declines) return { label: 'Bullish breadth', arrow: '▲', tone: 'positive' }; if (declines > advances) return { label: 'Bearish breadth', arrow: '▼', tone: 'negative' }; return null }
const midRemapKeys: Record<string, string> = { atm_iv_nifty_mid: 'atm_iv_nifty', atm_iv_sensex_mid: 'atm_iv_sensex', pcr_nifty_mid: 'pcr_nifty', pcr_sensex_mid: 'pcr_sensex', max_pain_nifty_mid: 'max_pain_nifty', max_pain_sensex_mid: 'max_pain_sensex', atm_straddle_price_nifty_mid: 'atm_straddle_price_nifty', atm_straddle_price_sensex_mid: 'atm_straddle_price_sensex', atm_straddle_delta_nifty_mid: 'atm_straddle_delta_nifty', atm_straddle_delta_sensex_mid: 'atm_straddle_delta_sensex', atm_straddle_theta_nifty_mid: 'atm_straddle_theta_nifty', atm_straddle_theta_sensex_mid: 'atm_straddle_theta_sensex', advance_decline_ratio_mid: 'advance_decline_ratio' }
function buildMidRow(row: Row, mid: Row): Row { const overlay: Row = {}; for (const [midKey, targetKey] of Object.entries(midRemapKeys)) { if (mid[midKey] !== null && mid[midKey] !== undefined) overlay[targetKey] = mid[midKey] }; return { ...row, ...overlay, spot_nifty: mid.spot_nifty ?? null, spot_sensex: mid.spot_sensex ?? null, intraday_change_pct_nifty: mid.intraday_change_pct_nifty ?? null, intraday_change_pct_sensex: mid.intraday_change_pct_sensex ?? null } }
function resolveAtmSpot(row: Row, instrument: Instrument): number { const suffix = instrument === 'NIFTY' ? 'nifty' : 'sensex'; const direct = num(row, `spot_${suffix}`); if (direct) return direct; const prev = num(row, `prev_close_${suffix}`); const gapPoints = num(row, `gap_points_${suffix}`); if (prev && gapPoints) return prev + gapPoints; return prev }
export function calculateVerdict(row: Row, instrument: Instrument) { const n = instrument === 'NIFTY'; const suffix = n ? 'nifty' : 'sensex'; const prev = num(row, `prev_close_${suffix}`); const open = n ? num(row, 'nifty_opening_points') : 0; const gapPct = n ? num(row, 'gift_nifty_gap_pct') : num(row, 'gap_points_sensex') / prev * 100; const predicted = num(row, 'gift_nifty_gap_pct') / 100 * num(row, 'prev_close_nifty'); const difference = open - predicted; const pcr = num(row, `pcr_${suffix}`); const iv = num(row, `atm_iv_${suffix}`); const vix = num(row, 'india_vix'); const support = num(row, `oi_support_${suffix}`); const resistance = num(row, `oi_resistance_${suffix}`); const maxPain = num(row, `max_pain_${suffix}`); const oiChangeSupport = String(row[`oi_change_support_${suffix}`] ?? ''); const oiChangeResistance = String(row[`oi_change_resistance_${suffix}`] ?? ''); const adRatio = advanceDeclineRatio(row); let bullVotes = 0; let bearVotes = 0; const giftGap = num(row, 'gift_nifty_gap_pct'); if (giftGap > 0) bullVotes++; if (giftGap < 0) bearVotes++; if (pcr > 1.3) bullVotes++; if (pcr < 0.8) bearVotes++; if (oiChangeSupport === 'Addition') bullVotes++; if (oiChangeSupport === 'Unwinding') bearVotes++; if (oiChangeResistance === 'Unwinding') bullVotes++; if (oiChangeResistance === 'Addition') bearVotes++; if (adRatio !== null && adRatio > 1.5) bullVotes++; if (adRatio !== null && adRatio < 0.7) bearVotes++; const bias = bullVotes > bearVotes ? 'Bullish' : bearVotes > bullVotes ? 'Bearish' : 'Neutral'; const ivRead = iv - vix > 2 ? 'IV rich' : 'IV fair'; const range = Math.abs(gapPct) <= 0.75; const strategy = range && ivRead === 'IV fair' ? 'Iron Condor' : !range && ivRead === 'IV rich' ? (bias === 'Bullish' ? 'Debit Call Spread' : bias === 'Bearish' ? 'Debit Put Spread' : 'Iron Condor') : range && ivRead === 'IV rich' ? 'Credit Spread' : bias === 'Bullish' ? 'Naked Call' : bias === 'Bearish' ? 'Naked Put' : 'Iron Condor'; const straddle = num(row, `atm_straddle_price_${suffix}`); const dte = num(row, `days_to_expiry_${suffix}`); const avgMove5d = num(row, `avg_move_5d_${suffix}`); const estimateA = straddle / Math.sqrt(Math.max(dte, 1)); const estimateB = avgMove5d; const conservative = Math.min(estimateA, estimateB); const aggressive = Math.max(estimateA, estimateB); const target = conservative * 0.6; const stop = conservative * 0.3; const aggressiveTarget = aggressive * 0.6; const aggressiveStop = aggressive * 0.3; const strike: Strike = vix < 11 ? 'ATM' : vix <= 14 ? 'ITM1' : 'ITM2'; return { gapPct, prev, open, predicted, difference, pcr, iv, vix, support, resistance, maxPain, bias, ivRead, strategy, straddle, conservative, aggressive, target, stop, aggressiveTarget, aggressiveStop, strike, dte, oiSupport: oiChangeSupport || 'Not available', oiResistance: oiChangeResistance || 'Not available', chartSupport: num(row, `chart_support_${suffix}`), chartResistance: num(row, `chart_resistance_${suffix}`) } }
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
  return {
    score, label,
    components: [
      { name: 'Gap %', value: fmt.pct(gapPct), score: gapScore, weight: `${Math.round(weights.gap * 100)}%` },
      { name: 'OI structure', value: `${calc.oiSupport ?? 'No change'} / ${calc.oiResistance ?? 'No change'}`, score: oiScore, weight: `${Math.round(weights.oi * 100)}%` },
      { name: 'PCR', value: fmt.ratio(pcr), score: pcrScore, weight: `${Math.round(weights.pcr * 100)}%` },
      { name: 'Max pain', value: calc.maxPain ? fmt.strike(calc.maxPain) : 'Not published', score: maxPainScore, weight: `${Math.round(weights.maxPain * 100)}%` },
    ],
  }
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
// Payoff diagram for the currently selected strategy: plots a stylized P&L curve across a strike
// range around ATM, sized from each leg's strike/side/premium, with vertical reference lines for
// Spot and every leg strike so it's immediately clear which strikes to short vs buy. For buyer
// strategies (Naked Call/Put, Debit Spread) target/stop are point-based, so they're drawn as
// vertical price-level lines too. For seller strategies (Credit Spread, Iron Condor), target/stop
// are net-premium-based (already computed as actualConservativeTarget/Stop, in rupees), so they're
// drawn as horizontal P&L threshold lines on the y-axis instead — no invented price level.
function TargetStopCard({ instrument, calc, delta = 0.5 }: { instrument?: Instrument; calc: ReturnType<typeof calculateVerdict>; delta?: number }) {
  const target = calc.target * delta
  const stop = calc.stop * delta
  const aggressiveTarget = calc.aggressiveTarget * delta
  const aggressiveStop = calc.aggressiveStop * delta
  return <div className="verdict-card verdict-tracks">
    {instrument && <p className="eyebrow target-stop-instrument">{instrument}</p>}
    <div className="track-columns">
      <div className="track-column">
        <div className="track-header"><i></i><span>Conservative</span></div>
        <strong className="track-move">{fmt.ptsAbs(calc.conservative)}</strong>
        <div className="track-row"><span>↑ Target (est.)</span><b className="target-value">{calc.target.toFixed(1)} pts</b><em>₹{target.toFixed(1)}</em></div>
        <div className="track-row"><span>↓ Stop-loss (est.)</span><b className="stop-value">{calc.stop.toFixed(1)} pts</b><em>₹{stop.toFixed(1)}</em></div>
      </div>
      <div className="track-column">
        <div className="track-header"><i></i><span>Aggressive</span></div>
        <strong className="track-move">{fmt.ptsAbs(calc.aggressive)}</strong>
        <div className="track-row"><span>↑ Target (est.)</span><b className="target-value">{calc.aggressiveTarget.toFixed(1)} pts</b><em>₹{aggressiveTarget.toFixed(1)}</em></div>
        <div className="track-row"><span>↓ Stop-loss (est.)</span><b className="stop-value">{calc.aggressiveStop.toFixed(1)} pts</b><em>₹{aggressiveStop.toFixed(1)}</em></div>
      </div>
    </div>
  </div>
}

function PayoffChart({ legRows, atmNumber, strikeStep, isNetSeller, spotEstTarget, spotEstStop, spotAggressiveTarget, spotAggressiveStop, actualConservativeTarget, actualConservativeStop, actualAggressiveTarget, actualAggressiveStop, qty }: {
  legRows: { key: string; label: string; side: 'Buy' | 'Sell'; strike: number }[]
  atmNumber: number
  strikeStep: number
  isNetSeller: boolean
  spotEstTarget: number | null
  spotEstStop: number | null
  spotAggressiveTarget: number | null
  spotAggressiveStop: number | null
  actualConservativeTarget: number | null
  actualConservativeStop: number | null
  actualAggressiveTarget: number | null
  actualAggressiveStop: number | null
  qty: number
}) {
  if (legRows.length === 0 || !atmNumber) return null
  const strikes = legRows.map((l) => l.strike)
  const lo = Math.min(atmNumber, ...strikes) - 6 * strikeStep
  const hi = Math.max(atmNumber, ...strikes) + 6 * strikeStep
  const points: { x: number; pnl: number }[] = []
  for (let x = lo; x <= hi; x += strikeStep / 2) {
    let pnl = 0
    for (const leg of legRows) {
      const isPut = leg.label.toLowerCase().includes('put')
      const intrinsic = isPut ? Math.max(0, leg.strike - x) : Math.max(0, x - leg.strike)
      pnl += leg.side === 'Buy' ? intrinsic : -intrinsic
    }
    points.push({ x, pnl })
  }
  const targetPrice = spotEstTarget != null ? +(atmNumber + spotEstTarget).toFixed(0) : null
  const stopPrice = spotEstStop != null ? +(atmNumber - spotEstStop).toFixed(0) : null
  const aggTargetPrice = spotAggressiveTarget != null ? +(atmNumber + spotAggressiveTarget).toFixed(0) : null
  const aggStopPrice = spotAggressiveStop != null ? +(atmNumber - spotAggressiveStop).toFixed(0) : null
  const legColors: Record<string, string> = { Buy: '#008300', Sell: '#e34948' }
  // Approved design (confirmed against prototypes covering all 4 strategy types): plain P&L
  // curve colored by profit/loss segment, thin color-coded vertical guide lines with NO on-chart
  // text (recharts doesn't avoid label collisions — text overlapped when levels cluster near
  // spot), no y-axis gridlines/ticks (the shape + legend carry the meaning, not an absolute
  // scale), and a legend row of dot + stacked label/value chips carrying every actual number.
  const legendItems: { label: string; value: string; color: string }[] = [
    { label: 'Spot', value: atmNumber.toLocaleString('en-IN'), color: '#898781' },
  ]
  for (const leg of legRows) {
    legendItems.push({ label: leg.side, value: `${leg.strike.toLocaleString('en-IN')} ${leg.label.toLowerCase().includes('put') ? 'PE' : 'CE'}`, color: legColors[leg.side] })
  }
  if (!isNetSeller && targetPrice != null && stopPrice != null) {
    const targetValue = aggTargetPrice != null ? `${targetPrice.toLocaleString('en-IN')} / ${aggTargetPrice.toLocaleString('en-IN')}` : targetPrice.toLocaleString('en-IN')
    const stopValue = aggStopPrice != null ? `${stopPrice.toLocaleString('en-IN')} / ${aggStopPrice.toLocaleString('en-IN')}` : stopPrice.toLocaleString('en-IN')
    legendItems.push({ label: aggTargetPrice != null ? 'Target (cons. / agg.)' : 'Target', value: targetValue, color: '#1baf7a' })
    legendItems.push({ label: aggStopPrice != null ? 'Stop (cons. / agg.)' : 'Stop', value: stopValue, color: '#eda100' })
  }
  if (isNetSeller && actualConservativeTarget != null && actualConservativeStop != null) {
    const consTarget = Math.round(actualConservativeTarget * qty)
    const consStop = Math.round(actualConservativeStop * qty)
    const aggTarget = actualAggressiveTarget != null ? Math.round(actualAggressiveTarget * qty) : null
    const aggStop = actualAggressiveStop != null ? Math.round(actualAggressiveStop * qty) : null
    const targetValue = aggTarget != null ? `₹${consTarget.toLocaleString('en-IN')} / ₹${aggTarget.toLocaleString('en-IN')}` : `₹${consTarget.toLocaleString('en-IN')}`
    const stopValue = aggStop != null ? `₹${consStop.toLocaleString('en-IN')} / ₹${aggStop.toLocaleString('en-IN')}` : `₹${consStop.toLocaleString('en-IN')}`
    legendItems.push({ label: aggTarget != null ? 'Target (net premium, cons. / agg.)' : 'Target (net premium)', value: targetValue, color: '#1baf7a' })
    legendItems.push({ label: aggStop != null ? 'Stop (net premium, cons. / agg.)' : 'Stop (net premium)', value: stopValue, color: '#eda100' })
  }
  return <div className="verdict-card payoff-chart-card">
    <span className="eyebrow">Strategy view</span>
    <div className="payoff-chart-canvas">
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={points} margin={{ top: 8, right: 10, bottom: 4, left: 6 }}>
          <XAxis dataKey="x" type="number" domain={[lo, hi]} tick={{ fontSize: 11, fill: '#898781' }} tickFormatter={(v) => String(Math.round(v))} axisLine={{ stroke: '#c3c2b7' }} tickLine={false} />
          <YAxis hide domain={['dataMin', 'dataMax']} />
          <ReferenceLine y={0} stroke="#c3c2b7" />
          <ReferenceLine x={atmNumber} stroke="#898781" strokeWidth={1.5} />
          {legRows.map((leg) => <ReferenceLine key={leg.key} x={leg.strike} stroke={legColors[leg.side]} strokeDasharray={leg.side === 'Sell' ? undefined : '4 3'} />)}
          {!isNetSeller && targetPrice != null && <ReferenceLine x={targetPrice} stroke="#1baf7a" strokeDasharray="4 3" />}
          {!isNetSeller && stopPrice != null && <ReferenceLine x={stopPrice} stroke="#eda100" strokeDasharray="4 3" />}
          {!isNetSeller && aggTargetPrice != null && <ReferenceLine x={aggTargetPrice} stroke="#1baf7a" strokeDasharray="2 2" strokeOpacity={0.5} />}
          {!isNetSeller && aggStopPrice != null && <ReferenceLine x={aggStopPrice} stroke="#eda100" strokeDasharray="2 2" strokeOpacity={0.5} />}
          <Line type="monotone" dataKey="pnl" stroke="#2a78d6" strokeWidth={2.5} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
    <div className="payoff-legend-row">
      {legendItems.map((it, i) => <div key={i} className="payoff-legend-chip">
        <i className="payoff-swatch" style={{ background: it.color }} />
        <span><small>{it.label}</small><b>{it.value}</b></span>
      </div>)}
    </div>
  </div>
}

function VerdictInstrument({ row, instrument }: { row: Row; instrument: Instrument }) {
  const calc = useMemo(() => calculateVerdict(row, instrument), [row, instrument])
  const legSupabase = useMemo(() => createClient(), [])
  // Live call/put premiums for a +/-20-strike band around ATM, refreshed by the Edge Function's
  // open and mid phases — used to auto-fill each leg's premium below instead of requiring a
  // manual "Enter fill" for every strategy change.
  const { data: legPremiumRows, mutate: mutateLegPremiums } = useSWR<Row[] | null>(
    row.trade_date ? ['leg-premiums', row.trade_date, instrument] : null,
    async () => { const { data, error } = await legSupabase.from('leg_premiums').select('*').eq('trade_date', row.trade_date).eq('instrument', instrument); if (error) throw error; return data as Row[] | null },
    { revalidateOnFocus: false },
  )
  // Manual-trade submit flow: "Update premium" re-fetches the leg_premiums table (which the
  // open/mid Edge Function phases keep refreshed with live LTPs for a +/-20-strike band), so
  // the premium fields below pick up whatever's live right now instead of the last poll cycle.
  // "Trade" then logs whatever strategy/legs/premium are currently on screen as a manual trade,
  // tagged source: 'manual' so it's tracked on the Trade page independently of (and alongside)
  // the system's own 09:30 pick for the same instrument/day.
  const [updatingPremium, setUpdatingPremium] = useState(false)
  const [submittingTrade, setSubmittingTrade] = useState(false)
  const [manualTradeStatus, setManualTradeStatus] = useState<string | null>(null)
  const handleUpdatePremium = async () => {
    setUpdatingPremium(true)
    try { await mutateLegPremiums() } finally { setUpdatingPremium(false) }
  }
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
  // Auto-fill each leg's premium from the fetched +/-20-strike band whenever the strategy,
  // strikes, or fetched data change — only fills blank fields, never overwrites a value the
  // user already typed or already auto-filled-and-edited.
  useEffect(() => {
    if (!legPremiumRows || legPremiumRows.length === 0) return
    setLegPremiums((prev) => {
      let changed = false
      const next = { ...prev }
      for (const leg of legRows) {
        if (next[leg.key] !== undefined && next[leg.key] !== '') continue
        const isPut = leg.label.toLowerCase().includes('put')
        const match = legPremiumRows.find((r) => Number(r.strike) === leg.strike)
        const ltp = match ? (isPut ? match.put_ltp : match.call_ltp) : null
        if (ltp != null) { next[leg.key] = String(ltp); changed = true }
      }
      return changed ? next : prev
    })
  }, [legPremiumRows, legRows])
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
  // Same conservative/aggressive target-stop formulas used everywhere else on this page
  // (net-seller vs net-buyer split above) feed the manual trade's stored target/stop levels,
  // so a manual trade is judged by the exact same math as a system trade -- equal treatment,
  // per the plan: only the strategy choice and entry timing differ.
  const submitManualTrade = async () => {
    if (!hasAnyPremium || strategy === 'No Trade') return
    setSubmittingTrade(true)
    setManualTradeStatus(null)
    try {
      const { data: inserted, error: insertError } = await legSupabase
        .from('auto_trades')
        .insert({
          trade_date: row.trade_date,
          instrument,
          strategy,
          source: 'manual',
          filled_at: new Date().toISOString(),
          qty,
          net_premium: +netPremium.toFixed(2),
          is_credit: isNetSeller,
          outcome: 'open',
          state: 'running',
          entry_premium: +netPremium.toFixed(2),
          target_price_cons: actualConservativeTarget != null ? +actualConservativeTarget.toFixed(2) : null,
          stop_price_cons: actualConservativeStop != null ? +actualConservativeStop.toFixed(2) : null,
          target_price_aggr: actualAggressiveTarget != null ? +actualAggressiveTarget.toFixed(2) : null,
          stop_price_aggr: actualAggressiveStop != null ? +actualAggressiveStop.toFixed(2) : null,
          dte: calc.dte,
          last_checked_at: new Date().toISOString(),
        })
        .select('id')
        .single()
      if (insertError) throw insertError
      const legInsertRows = legRows.map((leg) => ({
        auto_trade_id: inserted.id,
        leg_key: leg.key,
        side: leg.side,
        strike: leg.strike,
        premium: Number(legPremiums[leg.key]) || 0,
      }))
      const { error: legInsertError } = await legSupabase.from('auto_trade_legs').insert(legInsertRows)
      if (legInsertError) throw legInsertError
      setManualTradeStatus('Logged as a manual trade — now tracked on the Trade page.')
    } catch (e) {
      setManualTradeStatus(`Could not log this trade: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setSubmittingTrade(false)
    }
  }
  const sync = Math.abs(calc.difference) <= 5 ? ['In Sync', 'success', 'Prediction is tracking the actual open.'] : Math.abs(calc.difference) <= 15 ? ['Minor Divergence', 'warning', 'Prediction is slightly away from the actual open.'] : ['Diverging', 'danger', 'Prediction is materially away from the actual open.']
  const realGapPct = calc.prev ? (calc.open / calc.prev) * 100 : calc.gapPct
  const summary = `${row.trade_date} · ${row.day_name}: ${instrument} opened ${realGapPct >= 0 ? '+' : ''}${realGapPct.toFixed(2)}% gap (${calc.open.toFixed(1)}). ${marketBias.label} bias with India VIX ${calc.vix.toFixed(1)} (${calc.vix < 11 ? 'low volatility — momentum only' : calc.vix <= 14 ? 'normal volatility — ATM / ITM by setup' : 'elevated volatility — prefer defined risk'}), ${calc.dte <= 7 ? 'Weekly' : 'Monthly'} expiry in ${calc.dte} days, ${calc.iv} versus VIX, PCR ${calc.pcr.toFixed(2)}, OI support ${calc.support.toFixed(0)} (${calc.oiSupport}) / resistance ${calc.resistance.toFixed(0)} (${calc.oiResistance}), chart ${calc.chartSupport.toFixed(0)}–${calc.chartResistance.toFixed(0)}, max pain ${calc.maxPain.toFixed(0)}.`
  return <article className="verdict-instrument">
    <div className="verdict-instrument-head">
      <h3>{instrument}<button type="button" className="semantic-info verdict-info" aria-label={`${instrument} verdict details`}><Info size={14} aria-hidden="true" /><span className="semantic-tooltip" role="tooltip">{summary}</span></button></h3>
    </div>
    {instrument === 'NIFTY'
      ? <div className="sync-strip">{/* All three are signed changes in value, so they take the up/down colour and go through fmt -- they were rendering in ink with a hyphen-minus and no leading +. */}<span>Predicted <b className={signTone(calc.predicted)}>{fmt.pts(calc.predicted)}</b></span><span>Actual <b className={signTone(calc.open)}>{fmt.pts(calc.open)}</b></span><span>Difference <b className={signTone(calc.difference)}>{fmt.pts(calc.difference)}</b></span><strong className={`sync-${sync[1]}`}>{sync[0]}</strong><small>{sync[2]}</small></div>
      : <div className="sync-strip sync-strip-empty"><small>No predicted open for SENSEX — GIFT Nifty leads NIFTY only, so there is no overnight leading indicator to compare against.</small></div>}
    <div className="verdict-answer">
      <div className="verdict-answer-main">
        <Label tone="caution">Recommendation</Label>
        <strong className="verdict-answer-value">{strategyRec.recommendation}</strong>
        <p className="verdict-answer-note">{strategyRec.reason}.{isNoTrade ? ' You can still build a position manually below.' : ''}</p>
      </div>
      <div className="verdict-answer-scores">
        <div className="verdict-score-card">
          <div className="verdict-score-head"><Label>Market bias</Label><span className="ds-num verdict-score-num">{fmt.score(marketBias.score)}</span></div>
          <strong className="verdict-score-band">{marketBias.label}</strong>
          <BiasAxis value={marketBias.score} />
        </div>
        <div className="verdict-score-card">
          <div className="verdict-score-head"><Label>Option readiness</Label><span className="ds-num verdict-score-num">{optionReadiness.score} / 6</span></div>
          <strong className={`verdict-score-band ${optionReadiness.label.toLowerCase() === 'caution' ? 'is-caution' : ''}`}>{optionReadiness.label}</strong>
          <small className="verdict-score-note">{optionReadiness.ivCondition} IV · VIX {calc.vix} · DTE {calc.dte}</small>
        </div>
      </div>
    </div>
    <div className="verdict-card verdict-strategy-summary">
      <div className="verdict-strategy-box">
        <span className="eyebrow">Strategy override</span>
        
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
      <div className="day-summary"><span className="eyebrow">Day summary</span><p>{summary}</p></div>
    </div>
    {strategy === 'No Trade' ? <div className="verdict-card no-trade-leg-builder"><p className="structure-line">No Trade is selected — there&apos;s no position to size. Switch the dropdown above to a real strategy if you want to build a trade manually.</p></div> : <>
    <PayoffChart legRows={legRows} atmNumber={atmNumber} strikeStep={strikeStep} isNetSeller={isNetSeller} spotEstTarget={calc.target} spotEstStop={calc.stop} spotAggressiveTarget={calc.aggressiveTarget} spotAggressiveStop={calc.aggressiveStop} actualConservativeTarget={actualConservativeTarget} actualConservativeStop={actualConservativeStop} actualAggressiveTarget={actualAggressiveTarget} actualAggressiveStop={actualAggressiveStop} qty={qty} />
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
      <TargetStopCard calc={calc} />
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
          <label>Premium<input type="number" min="0" value={legPremiums[leg.key] ?? ''} onChange={(e) => setLegPremiums((p) => ({ ...p, [leg.key]: e.target.value }))} placeholder="Auto-filled from live quote" aria-label={`${instrument} ${leg.label} premium`} /></label>
        </div>)}
      </div>
      <div className="position-outputs">
        <span>Net Premium ({isNetSeller ? 'received' : 'paid'}) <b>{hasAnyPremium ? `₹${netPremium.toFixed(1)}` : 'Not entered yet'}</b></span>
      </div>
      <div className="manual-trade-actions">
        <button type="button" className="action-button" onClick={handleUpdatePremium} disabled={updatingPremium}><RotateCcw size={13} /> {updatingPremium ? 'Updating...' : 'Update premium'}</button>
        <button type="button" className="action-button action-button-success" onClick={submitManualTrade} disabled={submittingTrade || !hasAnyPremium}><CheckCircle2 size={13} /> {submittingTrade ? 'Logging...' : 'Trade'}</button>
      </div>
      {manualTradeStatus && <p className="structure-line">{manualTradeStatus}</p>}
      {!hasAnyPremium && <p className="structure-line">Enter or update premiums above, then Trade to log this as a manual trade on today's Trade page -- tracked the same way as the system's pick, alongside it.</p>}
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
    <div className="verdict-rationale"><span>Rationale</span><p>{marketBias.label} bias (score {fmt.score(marketBias.score)}) with {optionReadiness.ivCondition.toLowerCase()} IV and {optionReadiness.label.toLowerCase()} readiness; the framework recommends {strategyRec.recommendation.toLowerCase()}.</p><div className="verdict-breakdown"><ScoreBreakdown inputs={marketBias.components} caption={`Market bias inputs · weights for ${calc.dte} day${calc.dte === 1 ? '' : 's'} to expiry`} /></div><Disclaimer capturedAt={fmt.timeIST((row.updated_at ?? row.trade_date) as string | null)} /></div>
  </article>
}
function VerdictView({ row }: { row: Row }) {
  const eventFlag = useMemo(() => highImpactEvent(row.event_today as string | null), [row.event_today])
  // Verdict is computed from Open-phase fields (bias/strategy are derived from gap, PCR, IV
  // captured at 9:30). If those are still null, the 9:30 cron hasn't run yet today -- show a
  // clear not-yet-available message instead of the instrument cards (which would otherwise
  // render off of leftover/undefined values).
  const hasOpenData = row.market_bias_nifty != null && row.market_bias_sensex != null
  if (!hasOpenData) return <section className="phase-view verdict-view"><div className="review-section-head"><div><p className="eyebrow">After Market Open · {syncLabel(row, '09:30')}</p><h2>Verdict</h2></div><PhaseAside capturedAt={(row?.updated_at ?? null) as string | null} /></div><p className="history-empty">Verdict data not available yet — updates at 9:30 AM IST once the market opens.</p></section>
  return <section className="phase-view verdict-view"><div className="review-section-head"><div><p className="eyebrow">After Market Open · {syncLabel(row, '09:30')}</p><h2>Verdict</h2></div><PhaseAside capturedAt={(row?.updated_at ?? null) as string | null} /></div>{eventFlag && <div className="event-caution"><AlertTriangle size={16} /><span><strong>{eventFlag.name}</strong> — high impact event at {eventFlag.time}. Trade with caution.</span></div>}<div className="verdict-instruments"><VerdictInstrument row={row} instrument="NIFTY" /><VerdictInstrument row={row} instrument="SENSEX" /></div></section>
}
function OutcomeBadge({ label, target, sl }: { label: string; target?: boolean; sl?: boolean }) { const text = target === true ? 'Target hit' : sl === true ? 'SL hit' : target === false && sl === false ? 'Neither' : 'Not yet available'; const cls = target === true ? 'outcome-hit' : sl === true ? 'outcome-stop' : 'outcome-neutral'; return <div className={`outcome-badge ${cls}`}><span>{label}</span><strong>{text}</strong></div> }
// Fixed daily checkpoint slots in order, with display label and 24h IST minute-of-day (used to
// decide whether a not-yet-landed checkpoint is merely "later today" vs. actually overdue).
const CHECKPOINT_SLOTS: { id: string; label: string; minuteOfDay: number }[] = [
  { id: '1030', label: '10:30', minuteOfDay: 10 * 60 + 30 },
  { id: '1130', label: '11:30', minuteOfDay: 11 * 60 + 30 },
  { id: '1230', label: '12:30', minuteOfDay: 12 * 60 + 30 },
  { id: '1330', label: '13:30', minuteOfDay: 13 * 60 + 30 },
  { id: '1430', label: '14:30', minuteOfDay: 14 * 60 + 30 },
]
// Ordering used to pick "the latest landed checkpoint" for a given day (History recap, etc.) --
// derived from CHECKPOINT_SLOTS so there's one source of truth for the daily schedule, plus the
// legacy '1245' single-checkpoint label (pre-dates the 5-checkpoint schedule) sorted last since
// it's always the only checkpoint on whatever day it appears.
const CHECKPOINT_ORDER = [...CHECKPOINT_SLOTS.map((s) => s.id), '1245']

function nowMinuteOfDayIST(): number {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date())
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0)
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0)
  return hour * 60 + minute
}
// One checkpoint's compact read for a single instrument -- time, bias (with the live intraday
// % change alongside it), suggested strategy (with the IV-vs-VIX read that drove the pick), and
// a one-line shift note when the bias/strategy actually moved since the morning call. All values
// read directly from the stored midmarket_snapshot row (see the bias-source fix above) rather than
// recalculated. intraday_change_pct_{suffix} is a genuine derived value -- (spot - prev_close) /
// prev_close * 100 off two real captured prices, verified against today's actual spot/prev_close --
// not a placeholder or estimate.
function MidCheckpointRow({ cp, suffix, label }: { cp: Row; suffix: 'nifty' | 'sensex'; label: string }) {
  const biasLabel = String(cp[`market_bias_${suffix}_mid`] ?? 'Not available')
  const strategy = String(cp[`suggested_strategy_${suffix}_mid`] ?? 'Not available')
  const ivRead = cp[`iv_vs_vix_${suffix}_mid`] != null ? String(cp[`iv_vs_vix_${suffix}_mid`]).toLowerCase() : null
  const changePct = cp[`intraday_change_pct_${suffix}`]
  const changeLabel = changePct != null ? `${Number(changePct) > 0 ? '+' : ''}${Number(changePct).toFixed(2)}%` : null
  const shifted = Boolean(cp[`bias_shifted_${suffix}`]) || Boolean(cp[`strategy_shifted_${suffix}`])
  const shiftNote = String(cp[`shift_note_${suffix}`] ?? '')
  const tone = /bearish/i.test(biasLabel) ? 'negative' : /bullish/i.test(biasLabel) ? 'positive' : ''

  return <div className={`mid-row-card ${shifted ? 'mid-row-card-shifted' : ''}`}>
    <div className="mid-row-top">
      <span className="mid-row-time">{label}</span>
      <span className={`mid-row-bias ${tone}`}>{biasLabel}{changeLabel && <em className="mid-row-change">{changeLabel}</em>}</span>
    </div>
    <p className="mid-row-strategy">{strategy}{ivRead && <span className="mid-row-iv"> · IV {ivRead}</span>}</p>
    {shifted && shiftNote && <p className="mid-row-shift-note">{shiftNote}</p>}
  </div>
}

// A checkpoint slot whose cron hasn't run yet today, for one instrument column.
function MidCheckpointRowPending({ label }: { label: string }) {
  return <div className="mid-row-card mid-row-card-pending">
    <span className="mid-row-time">{label}</span>
    <span className="mid-row-pending-tag">Pending</span>
  </div>
}

// One instrument's full day at a glance: all 5 checkpoints stacked, expanded by default (no
// tap-to-expand) so the whole session is visible in one compact column.
function MidInstrumentColumn({ instrument, byId, nowMin }: { instrument: Instrument; byId: Map<string, Row>; nowMin: number }) {
  const suffix = instrument === 'NIFTY' ? 'nifty' : 'sensex'
  // Spec §3: five checkpoint rows through CheckpointTimeline. A checkpoint whose bias moved
  // gets the caution tone and a one-line explanation; unchanged ones stay neutral, so the eye
  // lands on the one that actually did something. Two columns because MarketCue tracks two
  // instruments -- the reference shows one, but the row design is the part that transfers.
  const rows: Checkpoint[] = CHECKPOINT_SLOTS.map((slot) => {
    const cp = byId.get(slot.id)
    if (!cp) {
      const overdue = nowMin >= slot.minuteOfDay
      return {
        time: slot.label,
        headline: overdue ? 'Running a little late' : 'Not captured yet',
        badge: overdue ? 'overdue' : 'scheduled',
        detail: overdue
          ? 'The checkpoint is past due and has not reported.'
          : `Captures at ${slot.label} IST.`,
      }
    }
    const biasLabel = String(cp[`market_bias_${suffix}_mid`] ?? 'Not available')
    const strategy = String(cp[`suggested_strategy_${suffix}_mid`] ?? 'Not available')
    const changePct = cp[`intraday_change_pct_${suffix}`]
    const shifted = Boolean(cp[`bias_shifted_${suffix}`]) || Boolean(cp[`strategy_shifted_${suffix}`])
    const shiftNote = String(cp[`shift_note_${suffix}`] ?? '')
    const parts = [
      changePct != null ? `${instrument === 'NIFTY' ? 'Nifty' : 'Sensex'} ${fmt.pct(Number(changePct))}` : null,
      cp[`pcr_${suffix}_mid`] != null ? `PCR ${fmt.ratio(Number(cp[`pcr_${suffix}_mid`]))}` : null,
      cp[`india_vix_mid`] != null ? `VIX ${fmt.ratio(Number(cp['india_vix_mid']))}` : null,
    ].filter(Boolean)
    return {
      time: slot.label,
      headline: shifted ? `Bias shifted to ${biasLabel.toLowerCase()}` : `Bias held ${biasLabel.toLowerCase()}`,
      badge: shifted ? `${biasLabel} · shifted` : `${biasLabel} · unchanged`,
      detail: parts.length ? parts.join(' · ') : strategy,
      shifted,
      note: shifted ? (shiftNote || 'Bias moved since the previous checkpoint.') : undefined,
    }
  })

  return <div className="mid-instrument-col">
    <p className="mid-instrument-col-label">{instrument === 'NIFTY' ? 'Nifty' : 'Sensex'}</p>
    <CheckpointTimeline rows={rows} />
  </div>
}

function MidMarketView({ row, midCheckpoints }: { row: Row; midCheckpoints: Row[] | null | undefined }) {
  // Re-render every minute so a slot flips from "pending" to actually landed (or from
  // not-yet-due to overdue-looking) without needing a manual refresh.
  const [, forceTick] = useState(0)
  useEffect(() => { const t = window.setInterval(() => forceTick((n) => n + 1), 60000); return () => window.clearInterval(t) }, [])

  if (midCheckpoints === undefined) return <section className="phase-view special-view"><div className="review-section-head"><div><p className="eyebrow">Open → Mid checkpoints · today</p><h2>Mid-market</h2></div><PhaseAside /></div><p className="history-empty">Loading mid-market data…</p></section>

  const byId = new Map((midCheckpoints ?? []).map((cp) => [String(cp.checkpoint), cp]))
  const nowMin = nowMinuteOfDayIST()

  return <section className="phase-view special-view mid-checkpoint-view">
    <div className="review-section-head"><div><p className="eyebrow">Open → Mid checkpoints · today</p><h2>Mid-market</h2></div><PhaseAside capturedAt={(midCheckpoints?.[midCheckpoints.length - 1]?.created_at ?? row?.updated_at ?? null) as string | null} /></div>
    <div className="mid-instrument-grid">
      <MidInstrumentColumn instrument="NIFTY" byId={byId} nowMin={nowMin} />
      <MidInstrumentColumn instrument="SENSEX" byId={byId} nowMin={nowMin} />
    </div>
  </section>
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
/* --------------------------------------------------------------- Post-market
   Reference: marketcue-dashboard.html #s-post. The screen led with two instrument cards
   and no answer; the design leads with the verdict-vs-outcome read, then the four figures
   that justify it, then what carries into tomorrow.

   The headline and the carry-forward lines are assembled from values this screen (and
   Market open) already derived -- the verdict's recommendation, the range-vs-target
   outcome PostInstrumentCard already computed, the prediction miss, the OI levels and the
   DTE weighting. No new model, no new arithmetic; each line restates a number the app
   already shows somewhere, in words. A line whose inputs are missing is dropped rather
   than guessed, so the list is never padded.

   Sensex keeps its close card below the Nifty block. The design shows Nifty only -- the
   prediction tiles are meaningless for an index with no leading indicator -- but the
   close, high and low are real data the screen already carried, so they stay rather than
   being silently dropped. */
function CarryForward({ row, postSummary, calc }: { row: Row; postSummary: Row; calc: ReturnType<typeof calculateVerdict> }) {
  const lines: string[] = []
  const actual = row.gap_points_nifty != null ? Number(row.gap_points_nifty) : null
  const predicted = row.gift_nifty_gap_pts != null ? Number(row.gift_nifty_gap_pts)
    : row.gift_nifty_gap_pct != null && row.prev_close_nifty != null ? (Number(row.gift_nifty_gap_pct) / 100) * Number(row.prev_close_nifty) : null
  if (actual != null && predicted != null) {
    const miss = Math.abs(actual - predicted)
    lines.push(miss >= 50
      ? `GIFT Nifty misled by ${fmt.ptsAbs(miss)} — treat the predicted open as a weak signal this week.`
      : `GIFT Nifty was within ${fmt.ptsAbs(miss)} of the open — the predicted gap held up today.`)
  }
  const support = row.oi_support_nifty != null ? Number(row.oi_support_nifty) : null
  const supportAction = String(row.oi_change_support_nifty ?? '')
  if (support != null && supportAction) {
    lines.push(`OI support at ${fmt.strike(support)} saw ${supportAction.toLowerCase()} through the session. Watch it on expiry.`)
  }
  const dte = calc.dte
  if (Number.isFinite(dte)) {
    lines.push(dte <= 3
      ? `${dte} day${dte === 1 ? '' : 's'} to expiry moves OI to 45% weight — a single OI flip can move the band.`
      : `${dte} days to expiry keeps gap at 45% weight — OI matters less until the final three sessions.`)
  }
  if (lines.length === 0) return null
  return <div className="post-carry">
    <span className="section-title">What to carry into tomorrow</span>
    <Card className="post-carry-list">
      {lines.map((line, i) => <div className="post-carry-row" key={line}>
        <span className="post-carry-index">{String(i + 1).padStart(2, '0')}</span>
        <span>{line}</span>
      </div>)}
    </Card>
  </div>
}

function PostMarketView({ row, postSummary }: { row: Row; postSummary: Row | null | undefined }) {
  const head = (aside: ReactNode) => <div className="review-section-head">
    <div><p className="eyebrow">After the close · review &amp; learn</p><h2>How the session played out</h2></div>
    {aside}
  </div>
  if (postSummary === undefined) return <section className="phase-view special-view">{head(<PhaseAside />)}<p className="history-empty">Loading post-market data…</p></section>
  if (!postSummary) return <section className="phase-view special-view">{head(<PhaseAside />)}<p className="history-empty">Post-market data not available yet — updates at 9:00 PM IST.</p></section>

  const calc = calculateVerdict(row, 'NIFTY')
  const fii = postSummary.fii_net_cash_cr
  const dii = postSummary.dii_net_cash_cr
  const asOf = postSummary.fii_dii_data_date

  const actual = row.gap_points_nifty != null ? Number(row.gap_points_nifty) : null
  const predicted = row.gift_nifty_gap_pts != null ? Number(row.gift_nifty_gap_pts)
    : row.gift_nifty_gap_pct != null && row.prev_close_nifty != null ? (Number(row.gift_nifty_gap_pct) / 100) * Number(row.prev_close_nifty) : null
  const miss = actual != null && predicted != null ? Math.abs(actual - predicted) : null
  const high = num(postSummary, 'day_high_nifty')
  const low = num(postSummary, 'day_low_nifty')
  const dayRange = Number.isFinite(high) && Number.isFinite(low) && high > 0 ? high - low : null
  // Exactly the comparison PostInstrumentCard already makes, reused rather than re-derived.
  const rangeOutcome = dayRange == null ? null
    : dayRange >= calc.target ? 'travelled'
    : dayRange < calc.stop ? 'came nowhere near'
    : 'fell short of'
  // A target distance is a magnitude, not a signed change -- don't run it through fmt.pts.
  const targetPts = fmt.ptsAbs(calc.target)
  const closePct = postSummary.day_change_pct_nifty != null ? Number(postSummary.day_change_pct_nifty) : null

  return <section className="phase-view special-view post-market-view">
    {head(<PhaseAside capturedAt={(postSummary?.updated_at ?? row?.updated_at ?? null) as string | null} />)}

    <Card tone="raised" className="post-hero">
      <Label>Verdict vs outcome</Label>
      <strong className="post-hero-value">{
        dayRange == null ? 'The session is not closed out yet'
          : dayRange >= calc.target ? 'The day travelled its conservative target'
          : dayRange < calc.stop ? 'The day never went anywhere'
          : 'The day stayed inside the expected range'
      }</strong>
      <p className="post-hero-body">
        {calc.bias} bias, {calc.strategy} recommended.
        {closePct != null && <> Nifty closed <strong className={`num ${tone(postSummary, 'day_change_pct_nifty')}`}>{fmt.pct(closePct)}</strong></>}
        {rangeOutcome != null && <> and {rangeOutcome} the <strong className="num">{targetPts}</strong> a conservative target needed</>}.
      </p>
    </Card>

    <div className="market-open-tiles">
      {predicted == null
        ? <EmptyState label="Predicted open" headline="Not available" reason="GIFT Nifty did not publish a gap for this session." />
        : <Metric label="Predicted open" value={<span className={predicted > 0 ? 'positive' : predicted < 0 ? 'negative' : ''}>{fmt.pts(predicted)}</span>} sub="from GIFT Nifty" />}
      {actual == null
        ? <EmptyState label="Actual open" headline="Not recorded" reason="The opening snapshot did not run for this session." />
        : <Metric label="Actual open" value={<span className={tone(row, 'gap_points_nifty')}>{fmt.pts(actual)}</span>} sub="vs previous close" />}
      {/* Prediction miss and Day range split the number from its unit across Metric's
          value and sub, per the reference, so fmt.ptsAbs would print "pts" twice. */}
      {miss == null
        ? <EmptyState label="Prediction miss" headline="Not available" reason="Needs both a predicted and an actual open." />
        : <Metric label="Prediction miss" className={miss >= 50 ? 'is-diverging' : undefined} value={miss.toFixed(1)} sub={<span className={miss >= 50 ? 'negative' : ''}>{miss >= 50 ? 'pts · diverging' : 'pts · in line'}</span>} />}
      {dayRange == null
        ? <EmptyState label="Day range" headline="Not recorded" reason="Day high and low were not captured." />
        : <Metric label="Day range" value={dayRange.toFixed(1)} sub={`pts · ${dayRange < calc.conservative ? 'under' : 'over'} ${calc.conservative.toFixed(2)} expected`} />}
    </div>

    <CarryForward row={row} postSummary={postSummary} calc={calc} />

    <div className="post-secondary">
      <span className="section-title">Closing levels</span>
      <div className="verdict-instruments"><PostInstrumentCard row={row} postSummary={postSummary} instrument="NIFTY" /><PostInstrumentCard row={row} postSummary={postSummary} instrument="SENSEX" /></div>
      <div className="flow-card"><span>FII / DII net cash flow</span><strong>{fii != null && dii != null ? `FII: ${fmt.rupees(Number(fii))} Cr, DII: ${fmt.rupees(Number(dii))} Cr (as of ${asOf ?? row.trade_date})` : 'Not available'}</strong></div>
    </div>

    <Disclaimer capturedAt={fmt.timeIST((postSummary?.updated_at ?? null) as string | null)} />
  </section>
}

// The read, stated before its evidence. Derived from the same computeMarketBias object the
// Verdict page uses, so the two pages cannot disagree about the day.
function ThesisHero({ row, onSeeVerdict }: { row: Row; onSeeVerdict: () => void }) {
  const calc = useMemo(() => calculateVerdict(row, 'NIFTY'), [row])
  const bias = useMemo(() => computeMarketBias(row, calc, 'NIFTY'), [row, calc])
  const readiness = useMemo(() => computeOptionReadiness(calc), [calc])
  const band = String(bias.label).toLowerCase()
  return <div className="thesis-hero">
    <div className="thesis-hero-main">
      <Label>Thesis for the open</Label>
      <strong className="thesis-hero-value">{bias.label}</strong>
      <BiasAxis value={bias.score} />
      <p className="thesis-hero-note">
        Bias {fmt.score(bias.score)} · {readiness.label.toLowerCase()} readiness · {calc.dte} day{calc.dte === 1 ? '' : 's'} to expiry.
      </p>
      <button type="button" className="action-button" onClick={onSeeVerdict}>See the verdict <ChevronRight size={14} /></button>
    </div>
  </div>
}
/* ---------------------------------------------------------------- Market open
   Reference: marketcue-dashboard.html #s-open. The generic PhaseView renderer produced a
   nine-tile wall for this phase with the narrative buried in fifth position; the design
   leads with the answer (did the open match the prediction?) and keeps four tiles.

   Nifty only, deliberately: Sensex has no leading indicator, so "diverged from the
   predicted open" has no meaning for it -- the same reason the Pre-market screen suppresses
   the Sensex prediction row. Sensex evidence stays on Pre-market and Verdict.

   Every figure here already existed on the row or came out of calculateVerdict. Nothing is
   computed that was not computed before -- this is presentation only. */
function MarketOpenView({ row, capturedAt }: { row: Row; capturedAt: string | null }) {
  const calc = calculateVerdict(row, 'NIFTY')
  const gapPts = row.gap_points_nifty != null ? Number(row.gap_points_nifty) : null
  const prevClose = row.prev_close_nifty != null ? Number(row.prev_close_nifty) : null
  const gapPct = gapPts != null && prevClose ? (gapPts / prevClose) * 100 : null
  const predictedPct = row.gift_nifty_gap_pct != null ? Number(row.gift_nifty_gap_pct) : null
  const predictedPts = row.gift_nifty_gap_pts != null ? Number(row.gift_nifty_gap_pts)
    : predictedPct != null && prevClose != null ? (predictedPct / 100) * prevClose : null
  const missPts = gapPts != null && predictedPts != null ? Math.abs(gapPts - predictedPts) : null
  // The design's own threshold for "in line" vs "diverged", matching the existing openSummary.
  const diverged = gapPct != null && predictedPct != null && Math.abs(predictedPct - gapPct) >= 0.15
  const vix = row.india_vix != null ? Number(row.india_vix) : null
  const stamp = freshness(capturedAt, false)

  return <section className="phase-view market-open-view">
    <div className="review-section-head">
      <div><p className="eyebrow">Market open snapshot</p><h2>Read the opening auction</h2></div>
      <div className="phase-head-aside">
        <FreshnessStamp state={stamp.state} label={stamp.label} capturedAt={capturedAt} />
        <ProvenanceBadge source="system" />
      </div>
    </div>

    {predictedPts == null
      ? <Banner tone="info" label="No predicted open to compare against">
          GIFT Nifty did not publish a gap for this session, so the open is reported on its own.
          {gapPct != null && <> Nifty opened <strong className="num">{fmt.pct(gapPct)} ({fmt.pts(gapPts)})</strong>.</>}
        </Banner>
      : <Banner tone={diverged ? 'blocking' : 'info'} label={diverged ? 'Nifty diverged from the predicted open' : 'Nifty opened in line with the predicted open'}>
          Opened <strong className={`num ${tone(row, 'gap_points_nifty')}`}>{fmt.pct(gapPct)} ({fmt.pts(gapPts)})</strong> against a predicted{' '}
          <strong className="num">{fmt.pct(predictedPct)} ({fmt.pts(predictedPts)})</strong>
          {/* "a 191.7 pt miss" -- attributive singular, so not fmt.ptsAbs's "pts". */}
          {missPts != null && <> — a <strong className="num">{missPts.toFixed(1)} pt</strong> {diverged ? 'miss' : 'difference'}</>}.
          {vix != null && <> VIX at {fmt.ratio(vix)} — {vixCondition(vix).toLowerCase()}.</>}
        </Banner>}

    <div className="market-open-tiles">
      <Metric label="Opening points" value={<span className={tone(row, 'gap_points_nifty')}>{value(row, 'gap_points_nifty')}</span>} sub={gapPct != null ? `${fmt.pct(gapPct)} vs prev close` : 'Previous close not recorded'} />
      <Metric label="Previous close" value={value(row, 'prev_close_nifty')} sub="Prior session" />
      <Metric label="ATM IV" value={value(row, 'atm_iv_nifty')} sub={vix != null ? `vs VIX ${fmt.ratio(vix)}` : 'India VIX not recorded'} />
      <Metric label="Straddle" value={value(row, 'atm_straddle_price_nifty')} sub="pts, ATM straddle" />
    </div>

    <div className="market-open-move">
      <span className="section-title">Expected move</span>
      <div className="market-open-move-grid">
        <TradeLevels variant="conservative" heading="Nifty · conservative" total={fmt.ptsAbs(calc.conservative)}
          targetPts={calc.target} stopPts={calc.stop} targetRupees={calc.target * 0.5} stopRupees={calc.stop * 0.5} />
        <TradeLevels variant="aggressive" heading="Nifty · aggressive" total={fmt.ptsAbs(calc.aggressive)}
          targetPts={calc.aggressiveTarget} stopPts={calc.aggressiveStop} targetRupees={calc.aggressiveTarget * 0.5} stopRupees={calc.aggressiveStop * 0.5} />
        {row.advance_decline_ratio == null
          ? <EmptyState label="Advance / decline" headline="Not published" reason="NSE releases breadth after 09:20 IST." />
          : <Metric label="Advance / decline" value={value(row, 'advance_decline_ratio')} sub="advances per decline" />}
      </div>
    </div>

    <Disclaimer capturedAt={fmt.timeIST(capturedAt)} />
  </section>
}

function PhaseView({ phase, row, historyData, onSeeVerdict }: { phase: Phase; row: Row | null; historyData?: HistoryExtras | null; onSeeVerdict?: () => void }) {
  const supabase = useMemo(() => createClient(), [])
  const { data: giftRow } = useSWR(
    phase === 'premarket' && row?.trade_date ? ['gift-nifty-staging', row.trade_date] : null,
    async () => {
      const { data, error } = await supabase.from('gift_nifty_staging').select('last_price, fetched_at').eq('trade_date', row!.trade_date).maybeSingle()
      if (error) throw error
      return data as Row | null
    }
  )
  const headStamp = freshness((row?.updated_at ?? null) as string | null, false)
  const fields = phaseFields[phase] ?? []
  const phaseHeadings: Record<'premarket' | 'open', [string, string]> = { premarket: ['Overnight → Open setup', 'Build the market thesis'], open: ['Market Open snapshot', 'Read the opening auction'] }
  const phaseSyncTimes: Record<'premarket' | 'open', string> = { premarket: '08:58', open: '09:30' }
  const commonKeys = ['event_today', 'india_vix', 'india_vix_change_pct', 'gift_nifty_gap_pct', 'advance_decline_ratio', 'mid_market_status', 'mid_advance_decline_ratio', 'mid_india_vix', 'mid_market_notes', 'post_market_status', 'post_advance_decline_ratio', 'post_market_notes']
  const common = fields.filter((f) => commonKeys.includes(f.key))
  const indexFields = fields.filter((f) => !commonKeys.includes(f.key))
  const nifty = indexFields.filter((f) => f.key.toLowerCase().includes('nifty') || f.key.includes('pcr_nifty') || f.key.includes('max_pain_nifty'))
  const sensex = indexFields.filter((f) => f.key.toLowerCase().includes('sensex') || f.key.includes('pcr_sensex') || f.key.includes('max_pain_sensex'))
  const marketOpenBias = (key: string) => { const gap = Number(row?.[key]); return gap > 0 ? 'Bullish' : gap < 0 ? 'Bearish' : 'Neutral' }
  const openSummary = (title: string): string | null => {
    if (phase !== 'open' || !row) return null
    const suffix = title === 'Nifty' ? 'nifty' : 'sensex'
    const gapPts = row[`gap_points_${suffix}`]
    const prevClose = row[`prev_close_${suffix}`]
    const gapPct = gapPts != null && prevClose ? (Number(gapPts) / Number(prevClose)) * 100 : null
    if (gapPct == null) return null
    const giftGapPct = title === 'Nifty' ? row.gift_nifty_gap_pct : null
    const predictedText = title === 'Nifty' && giftGapPct != null
      ? (Math.abs(Number(giftGapPct) - gapPct) < 0.15 ? `in line with GIFT Nifty's predicted gap` : `diverged from GIFT Nifty's predicted gap`)
      : null
    const vix = row.india_vix
    const vixText = vix != null ? `VIX at ${Number(vix).toFixed(1)} — ${vixCondition(Number(vix)).toLowerCase()}` : null
    const oiSupport = row[`oi_support_${suffix}`]
    const oiSupportChange = row[`oi_change_support_${suffix}`]
    const oiText = oiSupport != null ? `OI support ${oiSupportChange ? String(oiSupportChange).toLowerCase() : 'steady'} at ${oiSupport}` : null
    const gapText = `Opened ${gapPct >= 0 ? '+' : ''}${gapPct.toFixed(2)}% (${Number(gapPts).toFixed(1)} pts)${predictedText ? ` — ${predictedText}` : ''}`
    return [gapText, vixText, oiText].filter(Boolean).join('. ') + '.'
  }
  const renderGroup = (title: string, group: typeof fields) => { const isIndex = title === 'Nifty' || title === 'Sensex'; const bias = title === 'Nifty' ? marketOpenBias('gap_points_nifty') : marketOpenBias('gap_points_sensex'); const summary = isIndex ? openSummary(title) : null; return <section className={`metric-group ${title === 'Common market data' ? 'common-group' : ''}`}><div className="group-heading">{title !== 'Common market data' && <h3>{isIndex ? `${title === 'Nifty' ? 'Nifty 50' : 'Sensex'} — evidence` : title}{phase === 'open' && isIndex && <em className={`market-open-bias ${bias.toLowerCase()}`}> ({bias})</em>} {isIndex && <button type="button" className="semantic-info" aria-label={`${title} market color and OI action guidance`}><Info size={14} aria-hidden="true" /><span className="semantic-tooltip" role="tooltip"><b className="key-positive">Green</b> bullish / positive · <b className="key-negative">Red</b> bearish / negative · OI Addition = building interest · OI Unwinding = reducing interest</span></button>}</h3>}</div>{summary && <div className="verdict-banner prior-sessions-banner open-summary-banner"><p className="eyebrow">{title} at open</p><p className="prior-session-line">{summary}</p></div>}<div className="field-grid">{group.map((f) => { const isVix = f.key === 'india_vix'; const isOiAction = f.key.startsWith('oi_change_'); const actionTone = isOiAction ? (String(row?.[f.key] ?? '').toLowerCase() === 'addition' ? 'positive' : String(row?.[f.key] ?? '').toLowerCase().includes('unwinding') ? 'negative' : '') : ''; const relatedAction = f.key === 'oi_support_nifty' ? row?.oi_change_support_nifty : f.key === 'oi_support_sensex' ? row?.oi_change_support_sensex : f.key === 'oi_resistance_nifty' ? row?.oi_change_resistance_nifty : f.key === 'oi_resistance_sensex' ? row?.oi_change_resistance_sensex : null; const breadth = f.key === 'advance_decline_ratio' ? breadthDirection(row?.[f.key]) : null; const isNiftyGap = f.key === 'gap_points_nifty'; const predictedGap = isNiftyGap ? (row?.gift_nifty_gap_pts != null ? Number(row.gift_nifty_gap_pts) : row?.gift_nifty_gap_pct != null && row?.prev_close_nifty != null ? (num(row, 'gift_nifty_gap_pct') / 100) * num(row, 'prev_close_nifty') : null) : null; const gapDiff = isNiftyGap && predictedGap != null && row?.[f.key] != null ? Number(row[f.key]) - predictedGap : null; const fmtSigned = (n: number) => `${n > 0 ? '+' : ''}${n.toFixed(2)}`; const isGiftGap = f.key === 'gift_nifty_gap_pct'; const isEmpty = row?.[f.key] == null; if (isEmpty && gapDiff == null) { const [headline, reason] = emptyRead(f.key); return <div className="field-card is-empty" key={f.key}><span>{f.label}</span><strong className="field-empty-headline">{headline}</strong><small className="field-empty-reason">{reason}</small></div> } return <div className={`field-card ${isEmpty ? 'is-empty' : ''} ${isGiftGap ? 'field-card-wide' : ''}`} key={f.key}><span>{gapDiff != null ? 'Difference from Predicted' : f.label}</span><strong className={gapDiff != null ? (gapDiff > 0 ? 'positive' : gapDiff < 0 ? 'negative' : '') : tone(row, f.key)}>{gapDiff != null ? fmtSigned(gapDiff) : value(row, f.key, f.pct)}{isVix && row?.india_vix_change_pct != null && <em className={`vix-change ${tone(row, 'india_vix_change_pct')}`}> ({value(row, 'india_vix_change_pct', true)})</em>}{f.key.startsWith('prev_day_change_pct_') && row?.[f.key.replace('_pct_', '_pts_')] != null && <em className="prior-day-pts"> ({fmt.pts(Number(row[f.key.replace('_pct_', '_pts_')]))})</em>}{isGiftGap && row?.gift_nifty_gap_pts != null && <em className="prior-day-pts"> <span className="nowrap">({Number(row.gift_nifty_gap_pts) > 0 ? '+' : ''}{row.gift_nifty_gap_pts} pts)</span> expected open</em>}{relatedAction != null && <em className={`oi-action ${oiTone(f.key, String(relatedAction))}`}> {oiReading(f.key, String(relatedAction))}</em>}{breadth && <em className={`breadth-flag ${breadth.tone}`}> {breadth.arrow} {breadth.label}</em>}{gapDiff != null && predictedGap != null && <em className="predicted-gap">(Prediction from GIFT Nifty: {fmtSigned(predictedGap)} pts, Actual Open Nifty: {fmtSigned(Number(row[f.key]))} pts)</em>}</strong>{isOiAction && <small className={`oi-action ${actionTone}`}>{String(row?.[f.key] ?? 'Not available')}</small>}{isGiftGap && giftRow?.last_price != null && row?.prev_close_nifty != null && <small className="gift-raw-compare">GIFT Nifty {giftRow.last_price} ({fmtTimeIST(giftRow.fetched_at)}) vs Nifty {row.prev_close_nifty} (Prev Close)</small>}</div> })}</div></section> }
  const [eyebrow, heading] = phaseHeadings[phase as 'premarket' | 'open']
  const scheduledTime = phaseSyncTimes[phase as 'premarket' | 'open']
  // D-1 recap for Pre-market only: the single most recent trading day strictly before
  // today's row, summarized across all three of its sessions (open, mid, post) — so
  // Pre-market opens with "what happened yesterday" instead of a blank data grid.
  const priorDay = phase === 'premarket' && historyData
    ? historyData.rows.find((r) => String(r.trade_date) !== String(row?.trade_date)) ?? null
    : null
  const priorDayLines = priorDay ? (() => {
    const dateKey = String(priorDay.trade_date)
    const dayLabel = priorDay.day_name ? String(priorDay.day_name) : dateKey
    const checkpoints = historyData?.midAll[dateKey] ?? []
    const post = historyData?.post[dateKey]

    // Prefer the AI-phrased recap written by the post-close Edge Function (v16) -- it's built
    // from the exact same underlying structured data (open bias, checkpoint flips, close%,
    // outcome) computed server-side, just phrased by Haiku instead of the sentence-template
    // logic below. Only fall back to the rules-based builder if that column is null (e.g. the
    // anthropic_api_key wasn't configured yet when that day's post-close ran, or the AI call
    // failed) -- so the banner never goes blank just because phrasing didn't happen.
    if (post?.recap_story_nifty) return { dayLabel, story: String(post.recap_story_nifty) }

    const gapPts = priorDay.gap_points_nifty
    const prevClose = priorDay.prev_close_nifty
    const gapPct = gapPts != null && prevClose ? (Number(gapPts) / Number(prevClose)) * 100 : null
    const openBias = priorDay.market_bias_nifty ? String(priorDay.market_bias_nifty) : null
    const openSentence = gapPct != null
      ? `Market opened ${Math.abs(gapPct) < 0.05 ? 'flat' : `gapping ${gapPct >= 0 ? '+' : ''}${gapPct.toFixed(2)}%`}${openBias ? ` with a ${openBias} bias` : ''}.`
      : null

    // Walk the day's checkpoint sequence (bias per 10:30/11:30/12:30/1:30/2:30 slot) and detect
    // the shape of the day: steady (bias never changed), a single flip (one clean turn, the
    // most common "story" case), or choppy (flipped back and forth more than once). Each shape
    // gets its own sentence pattern so the recap reads like a description of what happened
    // rather than a fixed fill-in-the-blanks template repeated verbatim every day.
    const sequence = checkpoints
      .map((cp) => ({ label: CHECKPOINT_SLOTS.find((s) => s.id === String(cp.checkpoint))?.label ?? 'midday', bias: cp.market_bias_nifty_mid ? String(cp.market_bias_nifty_mid) : null, strategy: cp.suggested_strategy_nifty_mid ? String(cp.suggested_strategy_nifty_mid) : null }))
      .filter((s) => s.bias != null)

    let midSentence: string | null = null
    if (sequence.length > 0) {
      const flips: { at: string; from: string; to: string; strategy: string | null }[] = []
      let running = openBias ?? sequence[0].bias
      for (const step of sequence) {
        if (step.bias !== running) { flips.push({ at: step.label, from: running as string, to: step.bias as string, strategy: step.strategy }); running = step.bias }
      }
      const last = sequence[sequence.length - 1]
      if (flips.length === 0) {
        midSentence = `Through the day's checkpoints the tone held steady at ${running}${last.strategy ? `, with ${last.strategy} the standing call` : ''}.`
      } else if (flips.length === 1) {
        const f = flips[0]
        midSentence = `The tone held ${f.from} through the morning, then flipped ${f.to} by the ${f.at} checkpoint${f.strategy ? ` as the call shifted to ${f.strategy}` : ''}, and stayed that way into the close.`
      } else {
        const path = [openBias ?? sequence[0].bias, ...flips.map((f) => f.to)].join(' → ')
        midSentence = `Mid-market was choppy, swinging ${path} across the day's checkpoints before settling ${last.bias} by ${last.label}.`
      }
    }

    const closePct = post?.day_change_pct_nifty
    const outcome = post?.target_hit_nifty ? 'the target was hit intraday' : post?.sl_hit_nifty ? 'the stop-loss was hit intraday' : post ? 'neither target nor stop was hit' : null
    const closeSentence = closePct != null
      ? `The session closed ${Number(closePct) >= 0 ? '+' : ''}${Number(closePct).toFixed(2)}%${outcome ? `, and ${outcome}` : ''}.`
      : null

    const story = [openSentence, midSentence, closeSentence].filter((s): s is string => s != null).join(' ')
    return { dayLabel, story }
  })() : null
  // 'open' phase's real data (spot/gap/IV/PCR) only lands once the 9:30 cron actually runs --
  // before that, gap_points_nifty/sensex are null on today's row and there's nothing genuine
  // to show, so this shows an explicit not-yet message instead of a mostly-empty field grid.
  const openDataMissing = phase === 'open' && row?.gap_points_nifty == null && row?.gap_points_sensex == null
  if (openDataMissing) return <section className="phase-view"><div className="review-section-head"><div><p className="eyebrow">{eyebrow} · {syncLabel(row, scheduledTime)}</p><h2>{heading}</h2></div><div className="phase-head-aside"><FreshnessStamp state={headStamp.state} label={headStamp.label} capturedAt={(row?.updated_at ?? null) as string | null} /><ProvenanceBadge source="system" /></div></div><p className="history-empty">Market Open data not available yet — updates at 9:30 AM IST once the market opens.</p></section>
  const openTargetCards = phase === 'open' && row ? <div className="market-open-target-row">
    <TargetStopCard instrument="NIFTY" calc={calculateVerdict(row, 'NIFTY')} />
    <TargetStopCard instrument="SENSEX" calc={calculateVerdict(row, 'SENSEX')} />
  </div> : null
  return <section className="phase-view"><div className="review-section-head"><div><p className="eyebrow">{eyebrow} · {syncLabel(row, scheduledTime)}</p><h2>{heading}</h2></div><div className="phase-head-aside"><FreshnessStamp state={headStamp.state} label={headStamp.label} capturedAt={(row?.updated_at ?? null) as string | null} /><ProvenanceBadge source="system" /></div></div>{phase === 'premarket' && row && onSeeVerdict && <div className="thesis-row"><ThesisHero row={row} onSeeVerdict={onSeeVerdict} />{priorDayLines && priorDayLines.story && <div className="verdict-banner prior-sessions-banner"><p className="eyebrow">{priorDayLines.dayLabel} recap</p><p className="prior-session-line prior-session-story">{priorDayLines.story}</p></div>}</div>}<div className="metric-groups">{renderGroup('Common market data', common)}{openTargetCards}{renderGroup('Nifty', nifty)}{renderGroup('Sensex', sensex)}</div><Disclaimer capturedAt={fmt.timeIST((row?.updated_at ?? null) as string | null)} /></section>
}
export default function Dashboard() {
  const [phase, setPhase] = useState<Phase>('premarket'); const [dark, setDark] = useState(true); const [navOpen, setNavOpen] = useState(false); const [liveDate, setLiveDate] = useState(''); const [liveDay, setLiveDay] = useState(''); const [liveTime, setLiveTime] = useState('')
  const isMobile = useIsMobile()
  // The sidebar is a permanent rail on desktop and an overlay drawer on mobile, so the default open state
  // follows the viewport rather than being fixed at mount.
  useEffect(() => { setNavOpen(!isMobile) }, [isMobile])
  // Picking a phase inside the mobile drawer should reveal the phase, not leave the drawer covering it.
  const selectPhase = (next: Phase) => { setPhase(next); if (isMobile) setNavOpen(false) }
  // Stop the page behind the drawer from scrolling while the overlay is up.
  useEffect(() => {
    if (!isMobile || !navOpen) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [isMobile, navOpen])
  const { session, loading: sessionLoading, signOut } = useSession()
  // Trade and Journal are admin-only, so they never render on a local dev session and could
  // not be reviewed against the design. The same NODE_ENV-gated flag that lets the dashboard
  // render signed-out also grants admin locally. Both halves are build-time constants, so
  // `next build` folds this to false and drops it -- see components/auth-guard.tsx.
  const DEV_BYPASS = process.env.NODE_ENV === 'development' && process.env.NEXT_PUBLIC_DEV_BYPASS_AUTH === 'true'
  const isAdmin = DEV_BYPASS || session?.user?.email === 'jishnu@ziovy.com'
  const visiblePhases = isAdmin ? phases : phases.filter((p) => p.id !== 'trade' && p.id !== 'journal')
  useEffect(() => { if (!sessionLoading && !isAdmin && phase === 'trade') setPhase('premarket') }, [sessionLoading, isAdmin, phase])
  // Which trading session the whole dashboard is showing. null means "the newest published
  // session", which is the behaviour the app had before this existed. A date pins every
  // screen to that session, because everything below Pre-market already filters on
  // row.trade_date -- only this top query had to learn about it.
  //
  // The value lives in the URL so a session is linkable and survives a reload. Read on mount
  // rather than through useSearchParams, which would force a Suspense boundary here for no
  // benefit; popstate keeps the back button honest.
  const [sessionDate, setSessionDate] = useState<string | null>(null)
  useEffect(() => {
    const read = () => {
      const v = new URLSearchParams(window.location.search).get('session')
      setSessionDate(v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null)
    }
    read()
    window.addEventListener('popstate', read)
    return () => window.removeEventListener('popstate', read)
  }, [])
  const goToSession = (next: string | null) => {
    setSessionDate(next)
    const url = new URL(window.location.href)
    if (next) url.searchParams.set('session', next)
    else url.searchParams.delete('session')
    window.history.pushState({}, '', url)
  }

  const supabase = useMemo(() => createClient(), [])
  const { data: liveRow } = useSWR<Row | null>(['premarket-dashboard', sessionDate], async () => {
    const base = supabase.from('premarket_dashboard').select('*')
    const { data, error } = sessionDate
      ? await base.eq('trade_date', sessionDate).maybeSingle()
      : await base.order('trade_date', { ascending: false }).limit(1).maybeSingle()
    if (error) throw error
    return data as Row | null
  }, { revalidateOnFocus: false })
  const { data: historyData } = useSWR<HistoryExtras | null>('premarket-dashboard-history', async () => {
    const { data: dashboardRows, error } = await supabase.from('premarket_dashboard').select('*').order('trade_date', { ascending: false }).limit(15)
    if (error) throw error
    const rows = (dashboardRows ?? []) as Row[]
    const tradeDates = rows.map((r) => r.trade_date).filter((d): d is string => typeof d === 'string')
    if (tradeDates.length === 0) return { rows, mid: {}, midAll: {}, post: {}, trade: {} }
    const [{ data: midRows, error: midError }, { data: postRows, error: postError }, { data: tradeRows, error: tradeError }] = await Promise.all([
      supabase.from('midmarket_snapshot').select('*').in('trade_date', tradeDates),
      supabase.from('postmarket_summary').select('*').in('trade_date', tradeDates),
      supabase.from('auto_trades').select('trade_date, instrument, outcome').in('trade_date', tradeDates),
    ])
    if (midError) throw midError
    if (postError) throw postError
    if (tradeError) throw tradeError
    // Since the mid-market schedule became 5 checkpoints/day, midmarket_snapshot now has up to
    // 5 rows per trade_date (one per checkpoint) instead of 1. For history/recap purposes we
    // want exactly one representative mid-market read per day -- the LATEST checkpoint that
    // actually landed, not whichever row the query happens to return last (which was
    // non-deterministic and could silently show an early-session read instead of the final
    // one). CHECKPOINT_ORDER mirrors the daily schedule (CHECKPOINT_SLOTS); legacy '1245' rows
    // sort after all 5 hourly slots since they predate this schedule and are the only
    // checkpoint on their day.
    const mid: Record<string, Row> = {}
    // midAll keeps every checkpoint for a day (sorted earliest-first) so the Pre-market recap
    // can tell the full intraday arc ("opened Neutral, flipped Bullish by 12:30, held into
    // close") instead of collapsing straight to the single latest reading.
    const midAll: Record<string, Row[]> = {}
    for (const m of (midRows ?? []) as Row[]) {
      const d = String(m.trade_date ?? '')
      if (!d) continue
      const existing = mid[d]
      if (!existing || CHECKPOINT_ORDER.indexOf(String(m.checkpoint)) > CHECKPOINT_ORDER.indexOf(String(existing.checkpoint))) mid[d] = m
      ;(midAll[d] ??= []).push(m)
    }
    for (const d of Object.keys(midAll)) midAll[d].sort((a, b) => CHECKPOINT_ORDER.indexOf(String(a.checkpoint)) - CHECKPOINT_ORDER.indexOf(String(b.checkpoint)))
    const post: Record<string, Row> = {}
    for (const p of (postRows ?? []) as Row[]) { const d = String(p.trade_date ?? ''); if (d) post[d] = p }
    const trade: Record<string, Row> = {}
    for (const t of (tradeRows ?? []) as Row[]) { const d = String(t.trade_date ?? ''); if (d && t.instrument === 'NIFTY') trade[d] = t }
    return { rows, mid, midAll, post, trade }
  }, { revalidateOnFocus: false })
  // Use the real row's own values as-is when we have one -- a null field means that phase
  // genuinely hasn't run yet today, and must stay null/empty rather than being silently
  // backfilled with the hardcoded demo row's fake numbers (that was masking "not run yet" as
  // if it were real data). The demo row is only used as a whole when there's no live row at
  // all (e.g. very first load before Supabase has ever written anything).
  const row = liveRow ?? visualRow
  // Rule 6: time and provenance are permanent furniture, and the reading visibly ages past
  // its checkpoint. The audit found a header clock reading 15:26 while every phase was
  // stamped "UPDATED 08:45 IST" in identical styling -- stale presented as live.
  const capturedISO = (row?.updated_at ?? null) as string | null
  const capturedLabel = fmt.timeIST(capturedISO) ? `Captured ${fmt.timeIST(capturedISO)}` : 'Capture time unknown'
  // Indian equities trade 09:15-15:30 IST; outside that the stamp says closed rather than aging.
  const marketOpen = (() => {
    const now = new Date()
    const hhmm = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }).format(now)
    const day = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', weekday: 'short' }).format(now)
    if (day === 'Sat' || day === 'Sun') return false
    return hhmm >= '09:15' && hhmm <= '15:30'
  })()
  const sessionState = freshness(capturedISO, marketOpen)
  // All of today's mid-market checkpoints (10:30/11:30/12:30/1:30/2:30 IST, or the legacy
  // single '1245' row for historical days before the 5-checkpoint schedule started), ordered
  // earliest-first so the timeline UI can just .map() them left-to-right / top-to-bottom.
  const checkpointOrder = CHECKPOINT_ORDER
  const { data: midCheckpoints } = useSWR<Row[] | null>(row.trade_date ? ['midmarket-checkpoints', row.trade_date] : null, async () => {
    const { data, error } = await supabase.from('midmarket_snapshot').select('*').eq('trade_date', row.trade_date)
    if (error) throw error
    const rows = (data ?? []) as Row[]
    return rows.sort((a, b) => checkpointOrder.indexOf(String(a.checkpoint)) - checkpointOrder.indexOf(String(b.checkpoint)))
  }, { revalidateOnFocus: false })
  const { data: postSummary } = useSWR<Row | null>(row.trade_date ? ['postmarket-summary', row.trade_date] : null, async () => { const { data, error } = await supabase.from('postmarket_summary').select('*').eq('trade_date', row.trade_date).order('trade_date', { ascending: false }).limit(1).maybeSingle(); if (error) throw error; return data as Row | null }, { revalidateOnFocus: false })
  useEffect(() => { document.documentElement.classList.toggle('light', !dark) }, [dark])
  useEffect(() => { const updateClock = () => { const now = new Date(); const options = { timeZone: 'Asia/Kolkata' } as const; setLiveDate(new Intl.DateTimeFormat('en-IN', { ...options, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)); setLiveDay(new Intl.DateTimeFormat('en-IN', { ...options, weekday: 'long' }).format(now)); setLiveTime(new Intl.DateTimeFormat('en-IN', { ...options, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }).format(now)) }; updateClock(); const timer = window.setInterval(updateClock, 1000); return () => window.clearInterval(timer) }, [])
  // History already fetches the last 15 sessions on load, so the picker knows which dates
  // exist without another request -- and stepping moves to the next PUBLISHED session rather
  // than to the next calendar day, which would land on weekends and holidays.
  const sessionDates = (historyData?.rows ?? [])
    .map((r) => (typeof r.trade_date === 'string' ? r.trade_date : null))
    .filter((d): d is string => d != null)
  const latestDate = sessionDates[0] ?? null
  const currentDate = sessionDate ?? latestDate
  const currentIdx = currentDate ? sessionDates.indexOf(currentDate) : -1
  // sessionDates is newest-first, so "older" is a higher index.
  const olderDate = currentIdx >= 0 && currentIdx < sessionDates.length - 1 ? sessionDates[currentIdx + 1] : null
  const newerDate = currentIdx > 0 ? sessionDates[currentIdx - 1] : null
  const isArchived = sessionDate != null && latestDate != null && sessionDate !== latestDate
  const sessionLabel = (d: string | null) => {
    if (!d) return ''
    const parsed = new Date(`${d}T00:00:00+05:30`)
    if (Number.isNaN(parsed.getTime())) return d
    return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short' }).format(parsed)
  }
  const sessionLabelLong = (d: string | null) => {
    if (!d) return ''
    const parsed = new Date(`${d}T00:00:00+05:30`)
    if (Number.isNaN(parsed.getTime())) return d
    return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', weekday: 'long', day: 'numeric', month: 'long' }).format(parsed)
  }
  const sessionsBack = isArchived && currentIdx >= 0 ? currentIdx : 0

  return <main className="app-shell"><header className="topbar"><button className="icon-button nav-toggle" onClick={() => setNavOpen(!navOpen)} aria-label={navOpen ? 'Hide session map' : 'Show session map'} aria-expanded={navOpen} aria-controls="session-map"><Menu size={18} /></button><div className="brand-mark"><BrandSymbol size={30} /><div><strong>MarketCue</strong></div></div>{isArchived
      ? <span className="topbar-date topbar-date-archived">{sessionLabelLong(currentDate)}</span>
      : <span className="topbar-date">{liveDay || row?.day_name || ''} {liveDate || row?.trade_date || ''} · {liveTime || '—'} IST</span>}
    <div className="session-picker" role="group" aria-label="Trading session">
      <button type="button" onClick={() => olderDate && goToSession(olderDate)} disabled={!olderDate} aria-label="Previous session">‹</button>
      <span className="session-picker-date">{sessionLabel(currentDate) || '—'}</span>
      <button type="button" onClick={() => newerDate && goToSession(newerDate === latestDate ? null : newerDate)} disabled={!newerDate} aria-label="Next session">›</button>
    </div>
    {isArchived && <button type="button" className="session-today" onClick={() => goToSession(null)}>Today</button>}<div className="topbar-meta"><FreshnessStamp state={sessionState.state} label={sessionState.label} capturedAt={capturedISO} /><button type="button" className="icon-button" onClick={() => setDark(!dark)} aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'} aria-pressed={!dark}>{dark ? <Sun size={16} /> : <Moon size={16} />}</button>{!sessionLoading && (session ? <button type="button" className="topbar-toggle" onClick={() => signOut()}>Sign out</button> : <Link href="/login" className="topbar-toggle">Sign in</Link>)}</div></header>
    {isArchived && <div className="archive-bar" role="status">
      <span className="archive-bar-tag">Archived session</span>
      <span className="archive-bar-text">
        Viewing <b>{sessionLabelLong(currentDate)}</b>
        {sessionsBack > 0 && <> — {sessionsBack === 1 ? 'the previous session' : `${sessionsBack} sessions ago`}</>}.
        {' '}Figures are as published that day and do not update.
      </span>
      <button type="button" className="archive-bar-exit" onClick={() => goToSession(null)}>Back to today</button>
    </div>}
    <div className="workspace"><aside id="session-map" className={`sidebar ${navOpen ? '' : 'closed'}`} aria-hidden={isMobile && !navOpen}><div className="side-label">SESSION MAP</div>{visiblePhases.map(({ id, label, subtitle }) => <button key={id} className={`phase-nav ${phase === id ? 'active' : ''}`} onClick={() => selectPhase(id)} aria-current={phase === id ? 'page' : undefined}><span><strong>{label}</strong><small>{subtitle}</small></span></button>)}<div className="side-rule" /><div className="side-source"><span className="side-label">Data source</span><strong>NSE option chain</strong><small>{capturedLabel}</small></div></aside>{isMobile && navOpen && <button type="button" className="nav-backdrop" aria-label="Close navigation" onClick={() => setNavOpen(false)} />}<div className="content">{phase === 'rules' ? <RulesView row={row} /> : phase === 'history' ? <HistoryView data={historyData} /> : phase === 'verdict' ? <VerdictView row={row} /> : phase === 'mid' ? <MidMarketView row={row} midCheckpoints={midCheckpoints} /> : phase === 'trade' ? (isAdmin ? <TradeView /> : null) : phase === 'post' ? <PostMarketView row={row} postSummary={postSummary} /> : phase === 'open' && row && row.gap_points_nifty != null ? <MarketOpenView row={row} capturedAt={(row.updated_at ?? null) as string | null} /> : phase === 'journal' ? (isAdmin ? <JournalView /> : null) : <PhaseView phase={phase} row={row} historyData={historyData} onSeeVerdict={() => setPhase('verdict')} />}<footer className="data-footer"><span><CheckCircle2 size={14} /> {liveRow ? 'Live Supabase data' : 'Visual preview data'}</span><span>Snapshot: {row.trade_date}</span></footer></div></div></main>
}
