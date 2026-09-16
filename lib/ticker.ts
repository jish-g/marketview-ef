// Home-page ticker: six instruments the pipeline already computes every phase, reduced to
// one chip each. Runs on the server (page.tsx, 60s revalidate) and in the browser (SWR) off
// the same anon client, so the shape and the rules live here once.
//
// Every figure is read, never recomputed: spot and straddle from the latest checkpoint,
// prev close and VIX from the pre-market row, close from the post-market row. The only
// arithmetic is subtraction for a points delta where the pipeline stores only a percent.
//
// Straddle change is versus the PREVIOUS session's last checkpoint, both ATM at their own
// time -- the same method on both sides. There is no 15:30 straddle capture yet (the
// post-close phase stores close/high/low only), so "prev close" here means that day's final
// checkpoint. On an expiry roll (today's DTE >= yesterday's) the comparison is between two
// different contracts and is suppressed rather than shown.

type Row = Record<string, any>

// Minimal query surface shared by @supabase/supabase-js and @supabase/ssr clients.
type Client = { from: (table: string) => any }

export type TickerChip = {
  key: string
  name: string
  tag?: string           // 'ATM straddle'
  last: number
  unit?: 'pts'           // straddle premiums are points, indices and VIX are levels
  changePts: number | null
  changePct: number | null
  changeNote?: string    // 'prev close' | 'vs prev close' | 'new expiry'
}

export type TickerData = {
  chips: TickerChip[]
  /** 'close' | a checkpoint like '13:30' | 'pre-market' -- what the index chips reflect. */
  asOf: string
  tradeDate: string
}

function n(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const x = Number(v)
  return Number.isFinite(x) ? x : null
}

/** Points implied by a level and its percent change: level − level / (1 + pct/100). */
function ptsFromPct(level: number | null, pct: number | null) {
  if (level == null || pct == null) return null
  const prev = level / (1 + pct / 100)
  return level - prev
}

function checkpointLabel(cp: unknown) {
  const s = String(cp ?? '')
  return /^\d{4}$/.test(s) ? `${s.slice(0, 2)}:${s.slice(2)}` : null
}

type Inputs = {
  tradeDate: string
  pre: Row | null
  mid: Row | null        // today's latest checkpoint
  post: Row | null
  prevPre: Row | null    // previous session's pre-market row (DTE for roll detection)
  prevMid: Row | null    // previous session's last checkpoint (straddle "prev close")
  bank: Row | null       // market_snapshots ^NSEBANK
}

export function buildTicker({ tradeDate, pre, mid, post, prevPre, prevMid, bank }: Inputs): TickerData {
  const chips: TickerChip[] = []
  let asOf = 'pre-market'

  for (const [key, name] of [['nifty', 'NIFTY 50'], ['sensex', 'SENSEX']] as const) {
    const prevClose = n(pre?.[`prev_close_${key}`])
    const close = n(post?.[`close_${key}`])
    const spot = n(mid?.[`spot_${key}`])
    if (close != null) {
      chips.push({ key, name, last: close, changePct: n(post?.[`day_change_pct_${key}`]), changePts: prevClose != null ? close - prevClose : null })
      asOf = 'close'
    } else if (spot != null) {
      const pct = n(mid?.[`intraday_change_pct_${key}`]) ?? (prevClose ? ((spot - prevClose) / prevClose) * 100 : null)
      chips.push({ key, name, last: spot, changePct: pct, changePts: prevClose != null ? spot - prevClose : null })
      asOf = checkpointLabel(mid?.checkpoint) ?? 'mid-market'
    } else if (prevClose != null) {
      chips.push({ key, name, last: prevClose, changePct: n(pre?.[`prev_day_change_pct_${key}`]), changePts: n(pre?.[`prev_day_change_pts_${key}`]), changeNote: 'prev close' })
    }
  }

  const bankLast = n(bank?.price)
  if (bankLast != null) {
    const pct = n(bank?.change_pct)
    chips.push({ key: 'banknifty', name: 'BANK NIFTY', last: bankLast, changePct: pct, changePts: ptsFromPct(bankLast, pct) })
  }

  const vix = n(pre?.india_vix)
  if (vix != null) {
    const pct = n(pre?.india_vix_change_pct)
    chips.push({ key: 'vix', name: 'INDIA VIX', last: vix, changePct: pct, changePts: ptsFromPct(vix, pct) })
  }

  const dteToday = { nifty: n(pre?.days_to_expiry_nifty), sensex: n(pre?.days_to_expiry_sensex) }
  const dtePrev = { nifty: n(prevPre?.days_to_expiry_nifty), sensex: n(prevPre?.days_to_expiry_sensex) }
  for (const [key, name] of [['nifty', 'NIFTY'], ['sensex', 'SENSEX']] as const) {
    const today = n(mid?.[`atm_straddle_price_${key}_mid`]) ?? n(pre?.[`atm_straddle_price_${key}`])
    if (today == null) continue
    const prev = n(prevMid?.[`atm_straddle_price_${key}_mid`]) ?? n(prevPre?.[`atm_straddle_price_${key}`])
    const rolled = dteToday[key] != null && dtePrev[key] != null && dteToday[key]! >= dtePrev[key]!
    if (rolled || prev == null || prev === 0) {
      chips.push({ key: `straddle-${key}`, name, tag: 'ATM straddle', last: today, unit: 'pts', changePts: null, changePct: null, changeNote: rolled ? 'new expiry' : undefined })
    } else {
      chips.push({ key: `straddle-${key}`, name, tag: 'ATM straddle', last: today, unit: 'pts', changePts: today - prev, changePct: ((today - prev) / prev) * 100, changeNote: 'vs prev close' })
    }
  }

  return { chips, asOf, tradeDate }
}

export async function fetchTicker(supabase: Client, tradeDate: string): Promise<TickerData> {
  const [preRes, midRes, postRes, prevPreRes, prevMidRes, bankRes] = await Promise.all([
    supabase.from('premarket_dashboard')
      .select('prev_close_nifty, prev_close_sensex, prev_day_change_pct_nifty, prev_day_change_pct_sensex, prev_day_change_pts_nifty, prev_day_change_pts_sensex, india_vix, india_vix_change_pct, days_to_expiry_nifty, days_to_expiry_sensex, atm_straddle_price_nifty, atm_straddle_price_sensex')
      .eq('trade_date', tradeDate).maybeSingle(),
    supabase.from('midmarket_snapshot')
      .select('checkpoint, spot_nifty, spot_sensex, intraday_change_pct_nifty, intraday_change_pct_sensex, atm_straddle_price_nifty_mid, atm_straddle_price_sensex_mid')
      .eq('trade_date', tradeDate).order('checkpoint', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('postmarket_summary')
      .select('close_nifty, close_sensex, day_change_pct_nifty, day_change_pct_sensex')
      .eq('trade_date', tradeDate).maybeSingle(),
    supabase.from('premarket_dashboard')
      .select('trade_date, days_to_expiry_nifty, days_to_expiry_sensex, atm_straddle_price_nifty, atm_straddle_price_sensex')
      .lt('trade_date', tradeDate).order('trade_date', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('midmarket_snapshot')
      .select('trade_date, checkpoint, atm_straddle_price_nifty_mid, atm_straddle_price_sensex_mid')
      .lt('trade_date', tradeDate).order('trade_date', { ascending: false }).order('checkpoint', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('market_snapshots')
      .select('price, change_pct, source_ts')
      .eq('asset', '^NSEBANK').order('source_ts', { ascending: false }).limit(1).maybeSingle(),
  ])
  // A failing source hides its chip; it never blanks the strip.
  const ok = (r: { data: Row | null; error: unknown }) => (r.error ? null : r.data)
  return buildTicker({
    tradeDate,
    pre: ok(preRes), mid: ok(midRes), post: ok(postRes),
    prevPre: ok(prevPreRes), prevMid: ok(prevMidRes), bank: ok(bankRes),
  })
}
