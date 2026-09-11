// market-data-sync
// v23: per-request timeout on all Upstox calls; open phase stamps updated_at.
// Phases: premarket | open | mid | post-close | post-fii | entry | poll | blog
// v11: blog phase now publishes one combined Nifty+Sensex post per session, not two.
// v17 adds gift_nifty_gap_pts alongside gift_nifty_gap_pct so the Pre-market UI can show
// "+0.73% (+176.4 pts)" for the GIFT Nifty predicted gap, same pattern as prev_day_change_pts.
// Computed directly from the same ltp/priorNiftyClose already fetched for the % calc -- no
// extra query. Like gift_nifty_gap_pct, this is a live-quote-derived field only written at the
// moment premarket actually runs, so it stays null if that hasn't happened yet today.
// v16 adds recap_story_nifty/sensex to postmarket_summary: at post-close, deterministically
// builds a structured recap of the day's arc (open bias, gap%, mid-market checkpoint flips with
// their times and strategy calls, close%, target/stop outcome), then sends that structured
// object -- never raw data -- to Haiku purely for phrasing into 2-3 readable sentences. Haiku
// makes no decisions and adds no facts; the underlying structured analysis is computed in plain
// TS and is what stays reusable for any future querying, the AI step only affects display text.
// Read by the Pre-market page's "Yesterday recap" banner (falls back to its own rules-based
// sentence builder if this column is null, e.g. key not configured or API call failed).
// v15 adds prev_day_change_pts_nifty/sensex alongside the existing prev_day_change_pct -- the
// point-move equivalent so the UI can show "+0.48% (+115.4 pts)". Derived algebraically from
// that day's own close and pct (points = close - close/(1+pct/100)), no new query needed.
// v13: fixes two pre-market bugs. (1) gift_nifty_gap_pct was comparing GIFT Nifty's live price
// to GIFT Nifty's own OHLC close (which trades near round-the-clock, so this always netted out
// near 0%) instead of NIFTY cash-market's actual previous close -- now reads the prior day's
// postmarket_summary.close_nifty for the correct predicted-gap comparison. (2) chart_support_*/
// chart_resistance_* were never written by any phase despite existing in the schema and UI --
// now computed via the standard pivot-point formula (Pivot=(H+L+C)/3, Support=2P-H,
// Resistance=2P-L) from the prior day's postmarket_summary high/low/close.
// v14 adds prev_day_change_pct_nifty/sensex (relabeled "Prior Day Closed" in the UI) -- a third
// column that existed in the schema/UI with no writer. Carries forward the prior trading day's
// own close-to-close % move straight from postmarket_summary.day_change_pct_nifty/sensex
// (written by the 3:45 PM post-close phase), not recomputed -- just surfaced on Pre-market.
// v12: mid phase now runs 5x/day (10:30, 11:30, 12:30, 1:30, 2:30 IST) instead of once at
// 12:45. Each run reads a `checkpoint` field from the cron POST body ('1030'|'1130'|'1230'|
// '1330'|'1430') and upserts midmarket_snapshot on (trade_date, checkpoint) instead of just
// trade_date, so all 5 checkpoints for a day coexist as separate rows rather than the latest
// overwriting the rest. Existing single-checkpoint rows keep checkpoint='1245' for history.
// Called by pg_cron via pg_net. See project chat log for schedule.
//
// v7 adds the automated (paper) trade log: `entry` phase logs a virtual trade at 09:30
// mirroring the Verdict page's Stage 1/2/3 recommendation, `poll` phase runs every 5 minutes
// 09:30-15:30 IST checking the live net premium against conservative/aggressive target/stop
// and advancing a running -> locked_conservative -> closed state machine, and `post-close`
// now also force-resolves any trade still open at market close. Full spec: see
// trade-log-automation-spec.md in the project chat log. No real orders are ever placed --
// this only logs what the system's own strategy call would have done.
//
// v8 adds `source` ('system' | 'manual') to auto_trades so a manually-logged trade (via
// the Verdict page's Update Premium / Trade buttons) can coexist with the system's own
// 09:30 pick for the same day/instrument instead of colliding. The `entry` phase's dedupe
// check below is scoped to source="system" so it only ever skips against its own prior
// system row, never against a manual row. Manual rows are inserted client-side (via the
// Supabase client from the Verdict page) but flow through the same poll/post-close state
// machine automatically, since those phases query by state, not by source.
//
// v9 adds the `blog` phase for the public Nifty Today / Sensex Today content pages. Pass
// { "phase": "blog", "blogPhase": "premarket" | "postmarket" } in the request body. Reads the
// day's already-captured premarket_dashboard or postmarket_summary row and asks Claude Haiku
// to write a short public post from it, then inserts into the public-read blog_posts table.
// Requires an "anthropic_api_key" vault secret -- until that secret is added, this phase is a
// clean no-op (returns ok:true with a skipped note) rather than failing the cron run.
//
// v10 rewrites the blog prompt per publisher instruction (2026-08-25): (1) no strategy
// recommendation -- the post describes the data's read, not trading advice, (2) explicit
// anti-template instructions plus temperature 1 so daily prose doesn't feel formulaic even
// though the underlying data shape repeats, (3) the model now writes its own daily headline
// (HEADLINE:/BODY: format) that reflects that day's actual character instead of a fixed
// "Nifty Today: Pre-Market -- <date>" title every day.
//
// v11 merges the two separate per-instrument posts into a single combined post per session
// (2026-08-25, per publisher instruction): instead of looping over NIFTY/SENSEX and writing
// two rows, the blog phase now sends both instruments' data to the model in one call and asks
// for one post covering both, stored with instrument="BOTH". Public routes moved from
// /nifty-today + /sensex-today to a single /nifty-sensex-today section. Still one post per
// session (premarket/postmarket), same 9:00 AM / 8:00 PM IST cadence -- just one post instead
// of two each time.

import { createClient } from "jsr:@supabase/supabase-js@2";

const UPSTOX_BASE = "https://api.upstox.com/v2";
const UPSTOX_BASE_V3 = "https://api.upstox.com/v3";

const INSTR = {
  NIFTY: "NSE_INDEX|Nifty 50",
  SENSEX: "BSE_INDEX|SENSEX",
  VIX: "NSE_INDEX|India VIX",
  GIFT: "GLOBAL_INDEX|SGX NIFTY",
};

const STRIKE_STEP: Record<"NIFTY" | "SENSEX", number> = { NIFTY: 50, SENSEX: 100 };
const LOT_SIZE: Record<"NIFTY" | "SENSEX", number> = { NIFTY: 65, SENSEX: 20 };
const DEFAULT_HEDGE_WIDTH: Record<"NIFTY" | "SENSEX", number> = { NIFTY: 200, SENSEX: 300 };

async function fiiDiiCash(kind: "fii" | "dii", token: string) {
  const path = kind === "fii" ? "/market/fii" : "/market/dii";
  const data = await upstoxGet(`${path}?data_type=${encodeURIComponent("NSE_EQ|CASH")}&interval=1D`, token);
  const rows = data["NSE_EQ|CASH"];
  if (!rows || !rows.length) return null;
  const latest = rows.reduce((a: any, b: any) => (a.time_stamp > b.time_stamp ? a : b));
  return {
    date: new Date(latest.time_stamp).toISOString().slice(0, 10),
    netCr: +((latest.buy_amount ?? 0) - (latest.sell_amount ?? 0)).toFixed(2),
  };
}

function todayIST(): string {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  return now.toISOString().slice(0, 10);
}

function dayNameIST(): string {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][now.getDay()];
}

// Every Upstox call is bounded by UPSTOX_TIMEOUT_MS. Without this, a stalled request hangs the
// whole invocation until the edge runtime kills it, and the phase writes nothing at all -- not
// even skipped_notes -- which is indistinguishable from the cron never having fired.
const UPSTOX_TIMEOUT_MS = 15_000;

async function upstoxGet(path: string, token: string, base: string = UPSTOX_BASE) {
  const res = await fetch(`${base}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    signal: AbortSignal.timeout(UPSTOX_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`Upstox ${path} -> ${res.status} ${await res.text()}`);
  }
  const json = await res.json();
  if (json.status !== "success") throw new Error(`Upstox ${path} bad status: ${JSON.stringify(json)}`);
  return json.data;
}

async function avgDailyRange5d(instrumentKey: string, token: string): Promise<number | null> {
  const to = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  to.setDate(to.getDate() - 1);
  const from = new Date(to);
  from.setDate(from.getDate() - 12);
  const toStr = to.toISOString().slice(0, 10);
  const fromStr = from.toISOString().slice(0, 10);
  const data = await upstoxGet(
    `/historical-candle/${encodeURIComponent(instrumentKey)}/days/1/${toStr}/${fromStr}`,
    token,
    UPSTOX_BASE_V3,
  );
  const candles: any[] = data.candles ?? [];
  if (candles.length < 5) return null;
  const sorted = [...candles].sort((a, b) => new Date(b[0]).getTime() - new Date(a[0]).getTime());
  const last5 = sorted.slice(0, 5);
  const ranges = last5.map((c) => c[2] - c[3]);
  const avg = ranges.reduce((s, r) => s + r, 0) / ranges.length;
  return +avg.toFixed(2);
}

async function nearestExpiry(instrumentKey: string, token: string): Promise<string> {
  const data = await upstoxGet(`/option/contract?instrument_key=${encodeURIComponent(instrumentKey)}`, token);
  const today = todayIST();
  const expiries: string[] = [...new Set(data.map((c: any) => c.expiry))].sort();
  const future = expiries.filter((e) => e >= today);
  if (future.length === 0) throw new Error(`No future expiry found for ${instrumentKey}`);
  return future[0];
}

async function optionChain(instrumentKey: string, expiry: string, token: string) {
  return await upstoxGet(
    `/option/chain?instrument_key=${encodeURIComponent(instrumentKey)}&expiry_date=${expiry}`,
    token,
  );
}

async function quote(instrumentKey: string, token: string) {
  const data = await upstoxGet(`/market-quote/quotes?instrument_key=${encodeURIComponent(instrumentKey)}`, token);
  const key = Object.keys(data)[0];
  return key ? data[key] : null;
}

function computePCR(chain: any[]) {
  let callOI = 0, putOI = 0;
  for (const row of chain) {
    callOI += row.call_options?.market_data?.oi ?? 0;
    putOI += row.put_options?.market_data?.oi ?? 0;
  }
  if (callOI === 0) return null;
  return +(putOI / callOI).toFixed(4);
}

function computeMaxPain(chain: any[]) {
  const strikes = chain.map((r) => r.strike_price);
  let best = { strike: null as number | null, pain: Infinity };
  for (const s of strikes) {
    let pain = 0;
    for (const row of chain) {
      const k = row.strike_price;
      const callOI = row.call_options?.market_data?.oi ?? 0;
      const putOI = row.put_options?.market_data?.oi ?? 0;
      if (s > k) pain += (s - k) * callOI;
      if (s < k) pain += (k - s) * putOI;
    }
    if (pain < best.pain) best = { strike: s, pain };
  }
  return best.strike;
}

function findATMRow(chain: any[], spot: number) {
  return chain.reduce((best, row) =>
    Math.abs(row.strike_price - spot) < Math.abs(best.strike_price - spot) ? row : best
  , chain[0]);
}

function oiSupportResistance(chain: any[], spot: number) {
  const below = chain.filter((r) => r.strike_price < spot);
  const above = chain.filter((r) => r.strike_price > spot);
  const support = below.reduce((best: any, r: any) => {
    const oi = r.put_options?.market_data?.oi ?? 0;
    const bestOi = best?.put_options?.market_data?.oi ?? -1;
    return oi > bestOi ? r : best;
  }, null);
  const resistance = above.reduce((best: any, r: any) => {
    const oi = r.call_options?.market_data?.oi ?? 0;
    const bestOi = best?.call_options?.market_data?.oi ?? -1;
    return oi > bestOi ? r : best;
  }, null);
  const change = (row: any, side: "put_options" | "call_options") => {
    if (!row) return null;
    const oi = row[side]?.market_data?.oi ?? 0;
    const prevOi = row[side]?.market_data?.prev_oi ?? 0;
    if (oi > prevOi) return "Addition";
    if (oi < prevOi) return "Unwinding";
    return "Flat";
  };
  return {
    supportStrike: support?.strike_price ?? null,
    resistanceStrike: resistance?.strike_price ?? null,
    supportChange: change(support, "put_options"),
    resistanceChange: change(resistance, "call_options"),
  };
}

function gapScoreV(gapPct: number) {
  if (gapPct > 0.75) return 2;
  if (gapPct >= 0.25) return 1;
  if (gapPct >= -0.25) return 0;
  if (gapPct >= -0.75) return -1;
  return -2;
}
function pcrScoreV(pcr: number) {
  return pcr > 1.3 ? 2 : pcr >= 0.8 ? 0 : -2;
}

type BiasLabel = "Strong Bullish" | "Bullish" | "Neutral" | "Bearish" | "Strong Bearish";
type IvConditionT = "Cheap" | "Normal" | "Expensive";

function computeMarketBiasV(gapPct: number, pcr: number, oiSupportChange: string | null, oiResistanceChange: string | null, spot: number | null, maxPain: number | null, dte: number): { score: number; label: BiasLabel } {
  const gapScore = gapScoreV(gapPct);
  const pcrScore = pcrScoreV(pcr);
  const oiSupportScore = oiSupportChange === "Addition" ? 1 : oiSupportChange === "Unwinding" ? -1 : 0;
  const oiResistanceScore = oiResistanceChange === "Addition" ? -1 : oiResistanceChange === "Unwinding" ? 1 : 0;
  const oiScore = Math.max(-2, Math.min(2, oiSupportScore + oiResistanceScore));
  const maxPainScore = spot !== null && maxPain ? (((spot - maxPain) / maxPain) * 100 < -0.3 ? 1 : ((spot - maxPain) / maxPain) * 100 > 0.3 ? -1 : 0) : 0;
  const weights = dte > 3 ? { gap: 0.45, oi: 0.25, pcr: 0.2, maxPain: 0.1 } : { gap: 0.25, oi: 0.45, pcr: 0.2, maxPain: 0.1 };
  const score = gapScore * weights.gap + oiScore * weights.oi + pcrScore * weights.pcr + maxPainScore * weights.maxPain;
  const label: BiasLabel = score >= 1.25 ? "Strong Bullish" : score >= 0.5 ? "Bullish" : score > -0.5 ? "Neutral" : score > -1.25 ? "Bearish" : "Strong Bearish";
  return { score, label };
}

function computeOptionReadinessV(vix: number, iv: number, dte: number): { score: number; label: string; ivCondition: IvConditionT } {
  const vixScore = vix >= 11 && vix < 14 ? 2 : vix < 11 ? 1 : vix < 18 ? 0 : vix < 22 ? -1 : -2;
  const delta = iv - vix;
  const ivVixScore = Math.abs(delta) <= 1 ? 1 : delta < 0 ? 2 : -1;
  const dteScore = dte <= 1 ? -1 : dte <= 4 ? 2 : 1;
  const score = vixScore + ivVixScore + dteScore;
  const label = score >= 4 ? "Good to Buy" : score >= 1 ? "Caution" : "Avoid";
  const ivCondition: IvConditionT = Math.abs(delta) <= 1 ? "Normal" : delta < 0 ? "Cheap" : "Expensive";
  return { score, label, ivCondition };
}

function computeStrategyRecommendationV(biasLabel: BiasLabel, ivCondition: IvConditionT, vix: number, dte: number): { recommendation: string; reason: string } {
  const vixNormal = vix >= 11 && vix <= 18;
  let recommendation: string;
  let reason: string;
  if (biasLabel === "Strong Bullish" || biasLabel === "Bullish") {
    if (vix > 18) { recommendation = "Put Credit Spread"; reason = `bullish bias but VIX (${vix.toFixed(1)}) is high, so selling premium instead of buying`; }
    else if (ivCondition === "Expensive") { recommendation = "Put Credit Spread"; reason = "bullish bias with expensive IV, so selling premium instead of buying"; }
    else if (biasLabel === "Strong Bullish" && ivCondition === "Cheap" && vixNormal) { recommendation = "Naked Call"; reason = "strong bullish bias with cheap IV and normal VIX"; }
    else { recommendation = "Call Debit Spread"; reason = `${biasLabel.toLowerCase()} bias with ${ivCondition.toLowerCase()} IV`; }
  } else if (biasLabel === "Strong Bearish" || biasLabel === "Bearish") {
    if (vix > 18) { recommendation = "Call Credit Spread"; reason = `bearish bias but VIX (${vix.toFixed(1)}) is high, so selling premium instead of buying`; }
    else if (ivCondition === "Expensive") { recommendation = "Call Credit Spread"; reason = "bearish bias with expensive IV, so selling premium instead of buying"; }
    else if (biasLabel === "Strong Bearish" && ivCondition === "Cheap" && vixNormal) { recommendation = "Naked Put"; reason = "strong bearish bias with cheap IV and normal VIX"; }
    else { recommendation = "Put Debit Spread"; reason = `${biasLabel.toLowerCase()} bias with ${ivCondition.toLowerCase()} IV`; }
  } else {
    if (vix > 18) { recommendation = "Iron Condor"; reason = `neutral bias with high VIX (${vix.toFixed(1)}), so a defined-risk neutral trade`; }
    else if (ivCondition === "Expensive") { recommendation = "Iron Condor"; reason = "neutral bias with expensive IV — enough extra premium to justify selling a defined-risk neutral trade"; }
    else if (ivCondition === "Cheap") { recommendation = "No Trade"; reason = "neutral bias with cheap IV — no edge to sell premium and no directional conviction to buy"; }
    else { recommendation = "No Trade"; reason = "neutral bias with fairly-priced IV — no extra premium to justify selling, and no directional edge to buy"; }
  }
  if (dte <= 1 && recommendation === "Naked Call") { recommendation = "Call Debit Spread"; reason += `, downgraded from Naked Call since DTE is ${dte} (avoid naked options near expiry)`; }
  if (dte <= 1 && recommendation === "Naked Put") { recommendation = "Put Debit Spread"; reason += `, downgraded from Naked Put since DTE is ${dte} (avoid naked options near expiry)`; }
  if (vix > 22 && (recommendation === "Naked Call" || recommendation === "Naked Put" || recommendation === "Call Debit Spread" || recommendation === "Put Debit Spread")) { recommendation = "No Trade"; reason += `, overridden since VIX (${vix.toFixed(1)}) is above 22 (avoid fresh option buying)`; }
  return { recommendation, reason };
}

type StrategyChoice = "Naked Call" | "Naked Put" | "Debit Spread" | "Credit Spread" | "Iron Condor" | "No Trade";
type SideT = "Call" | "Put";

function mapRecommendationToStrategyV(recommendation: string): { strategy: StrategyChoice; side?: SideT; noTrade: boolean } {
  if (recommendation === "Naked Call") return { strategy: "Naked Call", noTrade: false };
  if (recommendation === "Naked Put") return { strategy: "Naked Put", noTrade: false };
  if (recommendation === "Call Debit Spread") return { strategy: "Debit Spread", side: "Call", noTrade: false };
  if (recommendation === "Put Debit Spread") return { strategy: "Debit Spread", side: "Put", noTrade: false };
  if (recommendation === "Put Credit Spread") return { strategy: "Credit Spread", side: "Put", noTrade: false };
  if (recommendation === "Call Credit Spread") return { strategy: "Credit Spread", side: "Call", noTrade: false };
  if (recommendation === "Iron Condor") return { strategy: "Iron Condor", noTrade: false };
  if (recommendation === "No Trade") return { strategy: "No Trade", noTrade: true };
  return { strategy: "Iron Condor", noTrade: true };
}

type LegDefV = { key: string; label: string; side: "Buy" | "Sell"; wing: number };

function legsForStrategyV(strategy: StrategyChoice, bias: string, side: SideT): LegDefV[] {
  if (strategy === "No Trade") return [];
  if (strategy === "Naked Call") return [{ key: "p", label: "Buy Call", side: "Buy", wing: bias === "Bearish" ? -1 : 1 }];
  if (strategy === "Naked Put") return [{ key: "p", label: "Buy Put", side: "Buy", wing: bias === "Bullish" ? 1 : -1 }];
  if (strategy === "Debit Spread") {
    const isPut = side === "Put";
    return [
      { key: "s", label: isPut ? "Buy Put (primary)" : "Buy Call (primary)", side: "Buy", wing: isPut ? -1 : 1 },
      { key: "lg", label: isPut ? "Sell Put (hedge)" : "Sell Call (hedge)", side: "Sell", wing: 0 },
    ];
  }
  if (strategy === "Credit Spread") {
    const isPut = side === "Put";
    return [
      { key: "s", label: isPut ? "Sell Put (primary)" : "Sell Call (primary)", side: "Sell", wing: isPut ? -1 : 1 },
      { key: "lg", label: isPut ? "Buy Put (hedge)" : "Buy Call (hedge)", side: "Buy", wing: 0 },
    ];
  }
  return [
    { key: "lc", label: "Buy Call (hedge)", side: "Buy", wing: 1 },
    { key: "sc", label: "Sell Call", side: "Sell", wing: 1 },
    { key: "sp", label: "Sell Put", side: "Sell", wing: -1 },
    { key: "lp", label: "Buy Put (hedge)", side: "Buy", wing: -1 },
  ];
}

function defaultOffsetForStrategyV(s: StrategyChoice): number {
  return s === "Iron Condor" ? 4 : 0;
}

function roundedStrikeV(value: number, step: number): number {
  return Math.round(value / step) * step;
}

function computeLegStrike(leg: LegDefV, strategy: StrategyChoice, side: SideT, callStrike: number, putStrike: number, hedgeWidth: number): number {
  if (strategy === "Naked Call") return callStrike;
  if (strategy === "Naked Put") return putStrike;
  if (strategy === "Debit Spread" || strategy === "Credit Spread") {
    const primary = side === "Put" ? putStrike : callStrike;
    if (leg.wing !== 0) return primary;
    return side === "Put" ? primary - hedgeWidth : primary + hedgeWidth;
  }
  if (leg.key === "sc") return callStrike;
  if (leg.key === "sp") return putStrike;
  if (leg.key === "lc") return callStrike + hedgeWidth;
  if (leg.key === "lp") return putStrike - hedgeWidth;
  return callStrike;
}

async function instrumentChainData(instrumentKey: string, token: string) {
  const expiry = await nearestExpiry(instrumentKey, token);
  const chain = await optionChain(instrumentKey, expiry, token);
  const spot = chain[0]?.underlying_spot_price;
  const atmRow = findATMRow(chain, spot);
  const pcr = computePCR(chain);
  const maxPain = computeMaxPain(chain);
  const { supportStrike, resistanceStrike, supportChange, resistanceChange } = oiSupportResistance(chain, spot);
  const callIV = atmRow.call_options?.option_greeks?.iv ?? null;
  const putIV = atmRow.put_options?.option_greeks?.iv ?? null;
  const atmIV = callIV != null && putIV != null ? +((callIV + putIV) / 2).toFixed(2) : null;
  const straddlePrice = (atmRow.call_options?.market_data?.ltp ?? 0) + (atmRow.put_options?.market_data?.ltp ?? 0);
  const straddleDelta = (atmRow.call_options?.option_greeks?.delta ?? 0) + (atmRow.put_options?.option_greeks?.delta ?? 0);
  const straddleTheta = (atmRow.call_options?.option_greeks?.theta ?? 0) + (atmRow.put_options?.option_greeks?.theta ?? 0);
  const today = todayIST();
  const dte = Math.max(0, Math.round((new Date(expiry).getTime() - new Date(today).getTime()) / 86400000));
  return {
    expiry, dte, spot, pcr, maxPain, atmIV, chain, atmStrike: atmRow.strike_price,
    straddlePrice: +straddlePrice.toFixed(2),
    straddleDelta: +straddleDelta.toFixed(4),
    straddleTheta: +straddleTheta.toFixed(2),
    oiSupport: supportStrike, oiResistance: resistanceStrike,
    oiSupportChange: supportChange, oiResistanceChange: resistanceChange,
  };
}

function legPremiumRows(tradeDate: string, instrument: "NIFTY" | "SENSEX", chain: any[], atmStrike: number) {
  const step = STRIKE_STEP[instrument];
  const lo = atmStrike - 20 * step;
  const hi = atmStrike + 20 * step;
  return chain
    .filter((row) => row.strike_price >= lo && row.strike_price <= hi)
    .map((row) => ({
      trade_date: tradeDate,
      instrument,
      strike: row.strike_price,
      call_ltp: row.call_options?.market_data?.ltp ?? null,
      put_ltp: row.put_options?.market_data?.ltp ?? null,
      updated_at: new Date().toISOString(),
    }));
}

function premiumFromChain(chain: any[], strike: number, isPut: boolean): number | null {
  const row = chain.find((r) => r.strike_price === strike);
  if (!row) return null;
  return isPut ? (row.put_options?.market_data?.ltp ?? null) : (row.call_options?.market_data?.ltp ?? null);
}

function nowIST(): Date {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
}

function isMarketHoursIST(): boolean {
  const now = nowIST();
  const day = now.getDay();
  if (day === 0 || day === 6) return false;
  const minutes = now.getHours() * 60 + now.getMinutes();
  return minutes >= 9 * 60 + 15 && minutes <= 15 * 60 + 30;
}

Deno.serve(async (req: Request) => {
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const cronSecret = req.headers.get("x-cron-secret");
  const { data: expectedSecret } = await admin.rpc("get_vault_secret", { secret_name: "edge_function_cron_secret" });
  if (!cronSecret || cronSecret !== expectedSecret) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }

  const { data: upstoxToken } = await admin.rpc("get_vault_secret", { secret_name: "upstox_analytics_token" });
  if (!upstoxToken) {
    return new Response(JSON.stringify({ error: "upstox_analytics_token not found in vault" }), { status: 500 });
  }

  let body: any = {};
  try { body = await req.json(); } catch { /* no body */ }
  const phase = body.phase;
  const checkpoint = body.checkpoint ?? null; // '1030'|'1130'|'1230'|'1330'|'1430' for phase === 'mid'
  const tradeDate = todayIST();
  const skipped: string[] = [];

  try {
    if (phase === "premarket") {
      const out: Record<string, unknown> = { trade_date: tradeDate, day_name: dayNameIST() };

      try {
        const vix = await quote(INSTR.VIX, upstoxToken);
        out.india_vix = vix?.last_price ?? null;
      } catch (e) { skipped.push(`india_vix: ${e}`); }

      // Most recent prior trading day's postmarket_summary row -- source of truth for
      // "yesterday's actual close/high/low" for both the GIFT gap fix and chart pivots below.
      // Not premarket_dashboard.prev_close_* since that field is itself written later by the
      // *same* day's open phase (via Upstox's own ohlc.close), so at 8:58 AM pre-market time
      // it's whatever the open phase wrote yesterday morning -- unreliable to read here.
      let priorClose: Record<string, unknown> | null = null;
      try {
        const { data: priorRows } = await admin
          .from("postmarket_summary")
          .select("trade_date, close_nifty, close_sensex, day_high_nifty, day_low_nifty, day_high_sensex, day_low_sensex, day_change_pct_nifty, day_change_pct_sensex")
          .lt("trade_date", tradeDate)
          .order("trade_date", { ascending: false })
          .limit(1);
        priorClose = priorRows?.[0] ?? null;
        if (!priorClose) skipped.push("gift_nifty_gap_pct / chart pivots: no prior postmarket_summary row on record yet");
      } catch (e) { skipped.push(`prior postmarket_summary lookup: ${e}`); }

      try {
        // v21: GIFT Nifty source switched from Upstox's GLOBAL_INDEX|SGX NIFTY (a stale/mismapped
        // instrument key -- GIFT Nifty moved from SGX to NSE IX in 2023, so that key's data was
        // unreliable) to Zerodha Kite Connect's NSEIX:GIFT NIFTY, fetched by the standalone
        // gift-nifty-fetch function (cron'd at 8:45 AM IST) and staged in gift_nifty_staging.
        // This block only reads that staged value -- it does not call Kite directly. If today's
        // manual Kite login hasn't happened yet (or the fetch failed), gift_nifty_staging.status
        // will not be "ok" for today's trade_date, and these fields are simply skipped (left null)
        // exactly as the old code did when Upstox returned no quote -- no crash, no stale data.
        const { data: giftRow } = await admin
          .from("gift_nifty_staging")
          .select("last_price, status")
          .eq("trade_date", tradeDate)
          .maybeSingle();
        const ltp = giftRow?.status === "ok" ? giftRow?.last_price : null;
        const priorNiftyClose = priorClose?.close_nifty != null ? Number(priorClose.close_nifty) : null;
        if (ltp != null && priorNiftyClose) {
          out.gift_nifty_gap_pct = +(((ltp - priorNiftyClose) / priorNiftyClose) * 100).toFixed(3);
          // v17 adds the point equivalent alongside the % (e.g. "+0.73% (+176.4 pts)"), same
          // pattern as prev_day_change_pts_*. Computed directly from the same ltp/priorNiftyClose
          // already fetched above for the % calc -- no extra query, and only written at the
          // exact moment premarket runs (this is a live predicted gap, not a stored EOD value,
          // so if the cron hasn't run yet today this stays null same as gift_nifty_gap_pct does).
          out.gift_nifty_gap_pts = +(ltp - priorNiftyClose).toFixed(2);
        }
        else if (ltp == null) skipped.push("gift_nifty_gap_pct: no staged GIFT Nifty price for today (manual Kite login may not have run yet)");
      } catch (e) { skipped.push(`gift_nifty_gap_pct: ${e}`); }

      // v13 adds chart_support/chart_resistance (never previously computed -- these columns
      // existed in the schema and UI but had no writer). Standard floor-trader pivot formula
      // from the prior day's high/low/close: Pivot = (H+L+C)/3, Support = 2*Pivot - H,
      // Resistance = 2*Pivot - L. This is a technical/chart-based level, distinct from the
      // options-OI-based oi_support/oi_resistance computed below from the live option chain.
      //
      // v13 also adds prev_day_change_pct_nifty/sensex -- another pre-existing column (labeled
      // "Prior Day Closed" in the Pre-market UI) that had no writer at all. This is simply the
      // prior trading day's own close-to-close % move, straight from postmarket_summary's
      // day_change_pct_* (written by the 3:45 PM post-close phase) -- not derived/recomputed
      // here, just carried forward so Pre-market can show it without a client-side join.
      for (const [label, closeKey, highKey, lowKey, changeKey] of [
        ["nifty", "close_nifty", "day_high_nifty", "day_low_nifty", "day_change_pct_nifty"],
        ["sensex", "close_sensex", "day_high_sensex", "day_low_sensex", "day_change_pct_sensex"],
      ] as const) {
        const c = priorClose?.[closeKey] != null ? Number(priorClose[closeKey]) : null;
        const h = priorClose?.[highKey] != null ? Number(priorClose[highKey]) : null;
        const l = priorClose?.[lowKey] != null ? Number(priorClose[lowKey]) : null;
        if (c != null && h != null && l != null) {
          const pivot = (h + l + c) / 3;
          out[`chart_support_${label}`] = +(2 * pivot - h).toFixed(2);
          out[`chart_resistance_${label}`] = +(2 * pivot - l).toFixed(2);
        } else {
          skipped.push(`chart_support_${label}/chart_resistance_${label}: missing prior high/low/close`);
        }

        const priorChangePct = priorClose?.[changeKey] != null ? Number(priorClose[changeKey]) : null;
        if (priorChangePct != null) {
          out[`prev_day_change_pct_${label}`] = priorChangePct;
          // v15 adds the point equivalent alongside the % for "Prior Day Closed" (e.g. "+0.48% (+115.4 pts)").
          // day_change_pct = (close - prevClose) / prevClose * 100, so prevClose = close / (1 + pct/100)
          // and points = close - prevClose. Derived entirely from this day's own close+pct, no extra query needed.
          if (c != null) {
            const priorPrevClose = c / (1 + priorChangePct / 100);
            out[`prev_day_change_pts_${label}`] = +(c - priorPrevClose).toFixed(2);
          }
        } else {
          skipped.push(`prev_day_change_pct_${label}: missing prior day_change_pct in postmarket_summary`);
        }
      }

      for (const [label, key] of [["nifty", INSTR.NIFTY], ["sensex", INSTR.SENSEX]] as const) {
        try {
          const d = await instrumentChainData(key, upstoxToken);
          out[`days_to_expiry_${label}`] = d.dte;
          out[`oi_support_${label}`] = d.oiSupport;
          out[`oi_resistance_${label}`] = d.oiResistance;
          out[`oi_change_support_${label}`] = d.oiSupportChange;
          out[`oi_change_resistance_${label}`] = d.oiResistanceChange;
        } catch (e) { skipped.push(`${label} pre-market chain: ${e}`); }

        try {
          const avg5d = await avgDailyRange5d(key, upstoxToken);
          if (avg5d != null) out[`avg_move_5d_${label}`] = avg5d;
          else skipped.push(`avg_move_5d_${label}: fewer than 5 candles returned`);
        } catch (e) { skipped.push(`avg_move_5d_${label}: ${e}`); }
      }

      if (skipped.length) out.skipped_notes = skipped.join(" | ");
      const { error } = await admin.from("premarket_dashboard").upsert(out, { onConflict: "trade_date" });
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true, phase, written: out, skipped }), { headers: { "Content-Type": "application/json" } });
    }

    if (phase === "open") {
      const out: Record<string, unknown> = { trade_date: tradeDate };
      const legRowsToUpsert: any[] = [];

      for (const [label, key] of [["nifty", INSTR.NIFTY], ["sensex", INSTR.SENSEX]] as const) {
        try {
          const q = await quote(key, upstoxToken);
          const d = await instrumentChainData(key, upstoxToken);
          const open = q?.ohlc?.open;
          const prevClose = q?.ohlc?.close;
          out[`spot_${label}`] = d.spot;
          out[`atm_iv_${label}`] = d.atmIV;
          out[`atm_straddle_price_${label}`] = d.straddlePrice;
          out[`atm_straddle_delta_${label}`] = d.straddleDelta;
          out[`atm_straddle_theta_${label}`] = d.straddleTheta;
          out[`pcr_${label}`] = d.pcr;
          out[`max_pain_${label}`] = d.maxPain;
          if (prevClose) out[`prev_close_${label}`] = prevClose;
          if (open != null && prevClose) {
            const gap = +(open - prevClose).toFixed(2);
            out[`gap_points_${label}`] = gap;
            if (label === "nifty") out.nifty_opening_points = gap;
          }

          try {
            const rows = legPremiumRows(tradeDate, label.toUpperCase() as "NIFTY" | "SENSEX", d.chain, d.atmStrike);
            legRowsToUpsert.push(...rows);
          } catch (e) { skipped.push(`${label} leg premiums: ${e}`); }

          if (out[`gap_points_${label}`] != null && d.pcr != null && d.maxPain != null) {
            const gapPct = +(((open - prevClose) / prevClose) * 100).toFixed(3);
            const { label: biasLabel } = computeMarketBiasV(gapPct, d.pcr, d.oiSupportChange, d.oiResistanceChange, d.spot, d.maxPain, d.dte);
            out[`market_bias_${label}`] = biasLabel;
            (out as any)[`__bandFor_${label}`] = { band: biasLabel, dte: d.dte, atmIV: d.atmIV };
          }
        } catch (e) { skipped.push(`${label} open: ${e}`); }
      }

      let vixVal: number | null = null;
      try {
        const vix = await quote(INSTR.VIX, upstoxToken);
        vixVal = vix?.last_price ?? null;
        for (const label of ["nifty", "sensex"] as const) {
          const meta = (out as any)[`__bandFor_${label}`];
          if (meta && vixVal) {
            const readiness = computeOptionReadinessV(vixVal, meta.atmIV ?? vixVal, meta.dte);
            const rec = computeStrategyRecommendationV(meta.band, readiness.ivCondition, vixVal, meta.dte);
            out[`suggested_strategy_${label}`] = rec.recommendation;
          }
          delete (out as any)[`__bandFor_${label}`];
        }
      } catch (e) { skipped.push(`strategy suggestion (needs VIX): ${e}`); }

      skipped.push("advance_decline_ratio: no direct Upstox endpoint found — left unfilled, needs separate source");

      if (legRowsToUpsert.length) {
        const { error: legError } = await admin.from("leg_premiums").upsert(legRowsToUpsert, { onConflict: "trade_date,instrument,strike" });
        if (legError) skipped.push(`leg_premiums upsert: ${legError.message}`);
      }

      if (skipped.length) out.skipped_notes = skipped.join(" | ");
      // Stamp updated_at so the dashboard's "UPDATED hh:mm" label reflects the open write, and
      // so a missing 9:30 write is visible from the row itself.
      out.updated_at = new Date().toISOString();
      const { error } = await admin.from("premarket_dashboard").upsert(out, { onConflict: "trade_date" });
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true, phase, written: out, legPremiumsStored: legRowsToUpsert.length, skipped }), { headers: { "Content-Type": "application/json" } });
    }

    if (phase === "entry") {
      const results: Record<string, unknown> = {};

      const vix = await quote(INSTR.VIX, upstoxToken).catch((e) => { skipped.push(`entry vix: ${e}`); return null; });
      const vixVal = vix?.last_price ?? null;

      for (const [label, key] of [["nifty", INSTR.NIFTY], ["sensex", INSTR.SENSEX]] as const) {
        const instrument = label.toUpperCase() as "NIFTY" | "SENSEX";
        try {
          const { data: existing } = await admin
            .from("auto_trades")
            .select("id")
            .eq("trade_date", tradeDate)
            .eq("instrument", instrument)
            .eq("source", "system")
            .maybeSingle();
          if (existing) { results[label] = { skipped: "already logged today" }; continue; }

          if (vixVal == null) { skipped.push(`${label} entry: no VIX, deferring to poll phase`); continue; }

          const q = await quote(key, upstoxToken);
          const d = await instrumentChainData(key, upstoxToken);
          const open = q?.ohlc?.open;
          const prevClose = q?.ohlc?.close;
          if (open == null || !prevClose) { skipped.push(`${label} entry: no open/prevClose yet, deferring to poll phase`); continue; }

          const gapPct = +(((open - prevClose) / prevClose) * 100).toFixed(3);
          const { label: biasLabel } = computeMarketBiasV(gapPct, d.pcr ?? 0, d.oiSupportChange, d.oiResistanceChange, d.spot, d.maxPain, d.dte);
          const readiness = computeOptionReadinessV(vixVal, d.atmIV ?? vixVal, d.dte);
          const rec = computeStrategyRecommendationV(biasLabel, readiness.ivCondition, vixVal, d.dte);
          const mapped = mapRecommendationToStrategyV(rec.recommendation);

          if (mapped.noTrade || mapped.strategy === "No Trade") { results[label] = { skipped: "No Trade recommended today" }; continue; }

          const side: SideT = mapped.side ?? (biasLabel === "Bearish" ? "Put" : "Call");
          const legs = legsForStrategyV(mapped.strategy, biasLabel, side);
          const strikeStep = STRIKE_STEP[instrument];
          const atmSpot = roundedStrikeV(d.spot, strikeStep);
          const offset = defaultOffsetForStrategyV(mapped.strategy);
          const callStrike = atmSpot + offset * strikeStep;
          const putStrike = atmSpot - offset * strikeStep;
          const hedgeWidth = DEFAULT_HEDGE_WIDTH[instrument];

          const legRows = legs.map((leg) => {
            const strike = roundedStrikeV(computeLegStrike(leg, mapped.strategy, side, callStrike, putStrike, hedgeWidth), strikeStep);
            const isPut = leg.label.toLowerCase().includes("put");
            const premium = premiumFromChain(d.chain, strike, isPut);
            return { ...leg, strike, isPut, premium };
          });

          if (legRows.some((l) => l.premium == null)) {
            skipped.push(`${label} entry: missing live premium for one or more legs, deferring to poll phase`);
            continue;
          }

          const netPremium = legRows.reduce((sum, l) => sum + (l.premium! * (l.side === "Sell" ? 1 : -1)), 0);
          const isCredit = netPremium >= 0;
          const qty = LOT_SIZE[instrument];

          const isNetSeller = mapped.strategy === "Credit Spread" || mapped.strategy === "Iron Condor";
          const straddle = d.straddlePrice;
          const avg5d = await avgDailyRange5d(key, upstoxToken).catch(() => null);
          const estimateA = straddle / Math.sqrt(Math.max(d.dte, 1));
          const estimateB = avg5d ?? estimateA;
          const conservative = Math.min(estimateA, estimateB);
          const aggressive = Math.max(estimateA, estimateB);
          const pointTarget = conservative * 0.6;
          const pointStop = conservative * 0.3;
          const pointAggrTarget = aggressive * 0.6;
          const pointAggrStop = aggressive * 0.3;
          const deltaAtOffset0 = 0.5;

          let targetCons: number, stopCons: number, targetAggr: number, stopAggr: number;
          if (isNetSeller) {
            const isSpreadSeller = mapped.strategy === "Credit Spread";
            targetCons = isSpreadSeller ? netPremium * 0.6 : Math.max(0, netPremium * 0.4);
            stopCons = isSpreadSeller ? netPremium * 0.4 : netPremium * 1.5;
            targetAggr = isSpreadSeller ? netPremium * 0.75 : Math.max(0, netPremium * 0.4);
            stopAggr = isSpreadSeller ? netPremium * 0.25 : netPremium * 1.5;
          } else {
            targetCons = pointTarget * deltaAtOffset0;
            stopCons = pointStop * deltaAtOffset0;
            targetAggr = pointAggrTarget * deltaAtOffset0;
            stopAggr = pointAggrStop * deltaAtOffset0;
          }

          const { data: inserted, error: insertError } = await admin
            .from("auto_trades")
            .insert({
              trade_date: tradeDate,
              instrument,
              strategy: mapped.strategy,
              source: "system",
              filled_at: new Date().toISOString(),
              qty,
              net_premium: +netPremium.toFixed(2),
              is_credit: isCredit,
              outcome: "open",
              state: "running",
              entry_premium: +netPremium.toFixed(2),
              target_price_cons: +targetCons.toFixed(2),
              stop_price_cons: +stopCons.toFixed(2),
              target_price_aggr: +targetAggr.toFixed(2),
              stop_price_aggr: +stopAggr.toFixed(2),
              dte: d.dte,
              last_checked_at: new Date().toISOString(),
            })
            .select("id")
            .single();
          if (insertError) { skipped.push(`${label} entry insert: ${insertError.message}`); continue; }

          const legInsertRows = legRows.map((l) => ({
            auto_trade_id: inserted.id,
            leg_key: l.key,
            side: l.side,
            strike: l.strike,
            premium: l.premium,
          }));
          const { error: legInsertError } = await admin.from("auto_trade_legs").insert(legInsertRows);
          if (legInsertError) skipped.push(`${label} entry legs insert: ${legInsertError.message}`);

          results[label] = { strategy: mapped.strategy, netPremium, targetCons, stopCons, targetAggr, stopAggr, id: inserted.id };
        } catch (e) { skipped.push(`${label} entry: ${e}`); }
      }

      return new Response(JSON.stringify({ ok: true, phase, results, skipped }), { headers: { "Content-Type": "application/json" } });
    }

    if (phase === "poll") {
      if (!isMarketHoursIST()) {
        return new Response(JSON.stringify({ ok: true, phase, skipped: ["outside market hours, no-op"] }), { headers: { "Content-Type": "application/json" } });
      }

      const { data: openTrades, error: openTradesError } = await admin
        .from("auto_trades")
        .select("id, instrument, strategy, source, state, net_premium, target_price_cons, stop_price_cons, target_price_aggr, stop_price_aggr")
        .eq("trade_date", tradeDate)
        .neq("state", "closed");
      if (openTradesError) throw openTradesError;

      const results: Record<string, unknown> = {};

      for (const trade of openTrades ?? []) {
        const instrument = trade.instrument as "NIFTY" | "SENSEX";
        const instrKey = instrument === "NIFTY" ? INSTR.NIFTY : INSTR.SENSEX;
        try {
          const { data: legs, error: legsError } = await admin
            .from("auto_trade_legs")
            .select("leg_key, side, strike")
            .eq("auto_trade_id", trade.id);
          if (legsError) throw legsError;
          if (!legs || legs.length === 0) { skipped.push(`${instrument} poll: no legs on record, skipping`); continue; }

          let d;
          try {
            d = await instrumentChainData(instrKey, upstoxToken);
          } catch (e) {
            skipped.push(`${instrument} poll: quote fetch failed, skip this cycle — ${e}`);
            continue;
          }

          let netPremiumNow = 0;
          let premiumMissing = false;
          for (const leg of legs) {
            const guessPut = leg.leg_key === "sp" || leg.leg_key === "lp" || (trade.strategy === "Naked Put" && leg.leg_key === "p");
            let premium = premiumFromChain(d.chain, Number(leg.strike), guessPut);
            if (premium == null) premium = premiumFromChain(d.chain, Number(leg.strike), !guessPut);
            if (premium == null) { premiumMissing = true; break; }
            netPremiumNow += premium * (leg.side === "Sell" ? 1 : -1);
          }

          if (premiumMissing) { skipped.push(`${instrument} poll: missing leg premium in chain, skip this cycle`); continue; }

          const now = new Date().toISOString();
          const targetCons = trade.target_price_cons != null ? Number(trade.target_price_cons) : null;
          const stopCons = trade.stop_price_cons != null ? Number(trade.stop_price_cons) : null;
          const targetAggr = trade.target_price_aggr != null ? Number(trade.target_price_aggr) : null;

          const isNetSeller = trade.strategy === "Credit Spread" || trade.strategy === "Iron Condor";
          const targetTouched = targetCons != null && (isNetSeller ? netPremiumNow <= targetCons : netPremiumNow >= targetCons);
          const stopTouched = stopCons != null && (isNetSeller ? netPremiumNow >= stopCons : netPremiumNow <= stopCons);
          const aggrTouched = targetAggr != null && (isNetSeller ? netPremiumNow <= targetAggr : netPremiumNow >= targetAggr);

          if (trade.state === "running") {
            if (stopTouched && targetTouched) {
              await admin.from("auto_trades").update({
                state: "closed", outcome: "stop", outcome_at: now,
                exit_reason: "stop_conservative", exit_premium: stopCons, exit_time: now,
                ambiguous_resolution: true, last_checked_at: now,
              }).eq("id", trade.id);
              results[instrument] = { resolved: "stop_conservative (ambiguous)" };
            } else if (stopTouched) {
              await admin.from("auto_trades").update({
                state: "closed", outcome: "stop", outcome_at: now,
                exit_reason: "stop_conservative", exit_premium: stopCons, exit_time: now,
                last_checked_at: now,
              }).eq("id", trade.id);
              results[instrument] = { resolved: "stop_conservative" };
            } else if (targetTouched) {
              await admin.from("auto_trades").update({
                state: "locked_conservative", locked_conservative_at: now, last_checked_at: now,
              }).eq("id", trade.id);
              results[instrument] = { advanced: "locked_conservative" };
            } else {
              await admin.from("auto_trades").update({ last_checked_at: now }).eq("id", trade.id);
              results[instrument] = { state: "running" };
            }
          } else if (trade.state === "locked_conservative") {
            const fellBelowFloor = targetCons != null && (isNetSeller ? netPremiumNow > targetCons : netPremiumNow < targetCons);
            if (aggrTouched && fellBelowFloor) {
              await admin.from("auto_trades").update({
                state: "closed", outcome: "target", outcome_at: now,
                exit_reason: "target_conservative", exit_premium: targetCons, exit_time: now,
                ambiguous_resolution: true, last_checked_at: now,
              }).eq("id", trade.id);
              results[instrument] = { resolved: "target_conservative (ambiguous)" };
            } else if (aggrTouched) {
              await admin.from("auto_trades").update({
                state: "closed", outcome: "target", outcome_at: now,
                exit_reason: "target_aggressive", exit_premium: targetAggr, exit_time: now,
                last_checked_at: now,
              }).eq("id", trade.id);
              results[instrument] = { resolved: "target_aggressive" };
            } else if (fellBelowFloor) {
              await admin.from("auto_trades").update({
                state: "closed", outcome: "target", outcome_at: now,
                exit_reason: "target_conservative", exit_premium: targetCons, exit_time: now,
                last_checked_at: now,
              }).eq("id", trade.id);
              results[instrument] = { resolved: "target_conservative" };
            } else {
              await admin.from("auto_trades").update({ last_checked_at: now }).eq("id", trade.id);
              results[instrument] = { state: "locked_conservative" };
            }
          }
        } catch (e) {
          skipped.push(`${instrument} poll: ${e}`);
        }
      }

      return new Response(JSON.stringify({ ok: true, phase, results, skipped }), { headers: { "Content-Type": "application/json" } });
    }

    if (phase === "mid") {
      const out: Record<string, unknown> = { trade_date: tradeDate, checkpoint: checkpoint ?? "1245" };
      const legRowsToUpsert: any[] = [];

      const { data: morning } = await admin
        .from("premarket_dashboard")
        .select("market_bias_nifty, market_bias_sensex, suggested_strategy_nifty, suggested_strategy_sensex")
        .eq("trade_date", tradeDate)
        .maybeSingle();

      let vixVal: number | null = null;
      try {
        const vix = await quote(INSTR.VIX, upstoxToken);
        vixVal = vix?.last_price ?? null;
      } catch (e) { skipped.push(`india_vix: ${e}`); }

      for (const [label, key] of [["nifty", INSTR.NIFTY], ["sensex", INSTR.SENSEX]] as const) {
        try {
          const d = await instrumentChainData(key, upstoxToken);
          out[`spot_${label}`] = d.spot;
          out[`atm_iv_${label}_mid`] = d.atmIV;
          out[`atm_straddle_price_${label}_mid`] = d.straddlePrice;
          out[`atm_straddle_delta_${label}_mid`] = d.straddleDelta;
          out[`atm_straddle_theta_${label}_mid`] = d.straddleTheta;
          out[`pcr_${label}_mid`] = d.pcr;
          out[`max_pain_${label}_mid`] = d.maxPain;

          try {
            const rows = legPremiumRows(tradeDate, label.toUpperCase() as "NIFTY" | "SENSEX", d.chain, d.atmStrike);
            legRowsToUpsert.push(...rows);
          } catch (e) { skipped.push(`${label} mid leg premiums: ${e}`); }

          const { data: prevRow } = await admin
            .from("premarket_dashboard")
            .select(`prev_close_${label}, gap_points_${label}`)
            .eq("trade_date", tradeDate)
            .maybeSingle();
          const prevClose = (prevRow as any)?.[`prev_close_${label}`];
          if (prevClose) out[`intraday_change_pct_${label}`] = +(((d.spot - prevClose) / prevClose) * 100).toFixed(3);

          if (vixVal && d.pcr != null && d.maxPain != null) {
            const gapPct = (out[`intraday_change_pct_${label}`] as number) ?? 0;
            const { label: band } = computeMarketBiasV(gapPct, d.pcr, d.oiSupportChange, d.oiResistanceChange, d.spot, d.maxPain, d.dte);
            const readiness = computeOptionReadinessV(vixVal, d.atmIV ?? vixVal, d.dte);
            const rec = computeStrategyRecommendationV(band, readiness.ivCondition, vixVal, d.dte);
            out[`market_bias_${label}_mid`] = band;
            out[`iv_vs_vix_${label}_mid`] = readiness.ivCondition;
            out[`pcr_reading_${label}_mid`] = d.pcr > 1.3 ? "Bullish (high PCR)" : d.pcr < 0.8 ? "Bearish (low PCR)" : "Neutral";
            out[`suggested_strategy_${label}_mid`] = rec.recommendation;

            const morningBias = (morning as any)?.[`market_bias_${label}`];
            const morningStrat = (morning as any)?.[`suggested_strategy_${label}`];
            out[`bias_shifted_${label}`] = morningBias ? morningBias !== band : null;
            out[`strategy_shifted_${label}`] = morningStrat ? morningStrat !== rec.recommendation : null;
            out[`shift_note_${label}`] = morningBias
              ? (morningBias === band ? `Unchanged: still ${band}` : `Shifted: ${morningBias} (morning) -> ${band} (midday)`)
              : "No morning bias on record to compare";
          }
        } catch (e) { skipped.push(`${label} mid: ${e}`); }
      }

      if (legRowsToUpsert.length) {
        const { error: legError } = await admin.from("leg_premiums").upsert(legRowsToUpsert, { onConflict: "trade_date,instrument,strike" });
        if (legError) skipped.push(`leg_premiums upsert: ${legError.message}`);
      }

      if (skipped.length) out.skipped_notes = skipped.join(" | ");
      const { error } = await admin.from("midmarket_snapshot").upsert(out, { onConflict: "trade_date,checkpoint" });
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true, phase, checkpoint: out.checkpoint, written: out, legPremiumsStored: legRowsToUpsert.length, skipped }), { headers: { "Content-Type": "application/json" } });
    }

    if (phase === "post-close") {
      const out: Record<string, unknown> = { trade_date: tradeDate };
      for (const [label, key] of [["nifty", INSTR.NIFTY], ["sensex", INSTR.SENSEX]] as const) {
        try {
          const q = await quote(key, upstoxToken);
          const close = q?.last_price;
          const high = q?.ohlc?.high;
          const low = q?.ohlc?.low;
          out[`close_${label}`] = close ?? null;
          out[`day_high_${label}`] = high ?? null;
          out[`day_low_${label}`] = low ?? null;
          if (q?.net_change != null && close) out[`day_change_pct_${label}`] = +((q.net_change / close) * 100).toFixed(3);

          const { data: tradeRow } = await admin
            .from("trades")
            .select("target_price_cons, stop_price_cons, target_price_aggr, stop_price_aggr")
            .eq("trade_date", tradeDate)
            .eq("instrument", label.toUpperCase())
            .maybeSingle();
          if (tradeRow && high != null && low != null) {
            const t = tradeRow as any;
            const targetHit = [t.target_price_cons, t.target_price_aggr].some((v) => v != null && high >= v);
            const slHit = [t.stop_price_cons, t.stop_price_aggr].some((v) => v != null && low <= v);
            out[`target_hit_${label}`] = targetHit;
            out[`sl_hit_${label}`] = slHit;
            out[`outcome_note_${label}`] = targetHit ? "Target reached intraday" : slHit ? "Stop-loss reached intraday" : "Neither target nor stop hit";
          } else {
            skipped.push(`${label} target/SL check: no trade row on record for today`);
          }
        } catch (e) { skipped.push(`${label} post-close: ${e}`); }
      }

      const autoResolve: Record<string, unknown> = {};
      try {
        const { data: stillOpen, error: openErr } = await admin
          .from("auto_trades")
          .select("id, instrument, net_premium, target_price_cons, stop_price_cons, state, strategy, source")
          .eq("trade_date", tradeDate)
          .neq("state", "closed");
        if (openErr) throw openErr;

        for (const trade of stillOpen ?? []) {
          const label = trade.instrument === "NIFTY" ? "nifty" : "sensex";
          const closeVal = out[`close_${label}`] as number | null;
          const now = new Date().toISOString();
          const isNetSeller = trade.strategy === "Credit Spread" || trade.strategy === "Iron Condor";
          const targetCons = trade.target_price_cons != null ? Number(trade.target_price_cons) : null;

          if (closeVal == null) {
            skipped.push(`${label} EOD resolve: no closing price available, leaving open for manual review`);
            continue;
          }

          if (trade.state === "running") {
            await admin.from("auto_trades").update({
              state: "closed", outcome: "open", outcome_at: now,
              exit_reason: "eod_unresolved", exit_premium: closeVal, exit_time: now,
              last_checked_at: now,
            }).eq("id", trade.id);
            autoResolve[label] = "eod_unresolved";
          } else if (trade.state === "locked_conservative") {
            const stillAtOrAbove = targetCons != null && (isNetSeller ? closeVal <= targetCons : closeVal >= targetCons);
            if (stillAtOrAbove) {
              await admin.from("auto_trades").update({
                state: "closed", outcome: "target", outcome_at: now,
                exit_reason: "eod_at_or_above_conservative", exit_premium: closeVal, exit_time: now,
                last_checked_at: now,
              }).eq("id", trade.id);
              autoResolve[label] = "eod_at_or_above_conservative";
            } else {
              await admin.from("auto_trades").update({
                state: "closed", outcome: "target", outcome_at: now,
                exit_reason: "target_conservative", exit_premium: targetCons, exit_time: now,
                ambiguous_resolution: true, last_checked_at: now,
              }).eq("id", trade.id);
              autoResolve[label] = "target_conservative (late-session reversal, poll missed the crossing)";
            }
          }
        }
      } catch (e) { skipped.push(`auto_trades EOD resolve: ${e}`); }

      // v16 adds recap_story_nifty/sensex: a 2-3 sentence plain-English recap of the day's
      // open -> mid-market arc -> close, generated once here at post-close and read by the
      // Pre-market page's "Yesterday recap" banner the next morning. The underlying analysis
      // (open bias, gap%, the sequence of mid-market checkpoint flips with their times and
      // strategy calls, close%, target/stop outcome) is all computed deterministically below
      // in plain JS/TS -- that structured result is what's actually reusable for any future
      // analysis and is not thrown away. Haiku's only job is to turn that structured object
      // into readable prose; it is never given raw data to compute from and never asked to
      // decide anything -- just rephrase the facts it's handed. If the AI call fails or the
      // anthropic_api_key vault secret isn't set, this cleanly no-ops (leaves the column null)
      // rather than failing the post-close run, since the underlying data write above already
      // succeeded and is more important than the recap sentence.
      try {
        const { data: anthropicKey } = await admin.rpc("get_vault_secret", { secret_name: "anthropic_api_key" });
        if (!anthropicKey) {
          skipped.push("recap_story: anthropic_api_key not configured in vault -- skipping recap phrasing");
        } else {
          const { data: openRow } = await admin
            .from("premarket_dashboard")
            .select("gap_points_nifty, gap_points_sensex, prev_close_nifty, prev_close_sensex, market_bias_nifty, market_bias_sensex")
            .eq("trade_date", tradeDate)
            .maybeSingle();
          const { data: midRows } = await admin
            .from("midmarket_snapshot")
            .select("checkpoint, market_bias_nifty_mid, market_bias_sensex_mid, suggested_strategy_nifty_mid, suggested_strategy_sensex_mid")
            .eq("trade_date", tradeDate);

          const CHECKPOINT_LABELS: Record<string, string> = { "1030": "10:30", "1130": "11:30", "1230": "12:30", "1330": "1:30", "1430": "2:30" };
          const CHECKPOINT_ORDER = ["1030", "1130", "1230", "1330", "1430", "1245"];
          const sortedMid = [...(midRows ?? [])].sort((a, b) => CHECKPOINT_ORDER.indexOf(String(a.checkpoint)) - CHECKPOINT_ORDER.indexOf(String(b.checkpoint)));

          // Builds the same deterministic { openBias, gapPct, flips, closePct, outcome } shape
          // per instrument -- the actual "story" data -- independent of any AI call, so it's
          // available for future analysis regardless of whether phrasing succeeds.
          function buildRecapStruct(label: "nifty" | "sensex") {
            const gapPts = (openRow as any)?.[`gap_points_${label}`];
            const prevClose = (openRow as any)?.[`prev_close_${label}`];
            const gapPct = gapPts != null && prevClose ? +((Number(gapPts) / Number(prevClose)) * 100).toFixed(3) : null;
            const openBias = (openRow as any)?.[`market_bias_${label}`] ?? null;

            const sequence = sortedMid
              .map((cp: any) => ({ at: CHECKPOINT_LABELS[String(cp.checkpoint)] ?? "midday", bias: cp[`market_bias_${label}_mid`] ?? null, strategy: cp[`suggested_strategy_${label}_mid`] ?? null }))
              .filter((s) => s.bias != null);

            const flips: { at: string; from: string; to: string; strategy: string | null }[] = [];
            let running = openBias ?? sequence[0]?.bias ?? null;
            for (const step of sequence) {
              if (running != null && step.bias !== running) flips.push({ at: step.at, from: running, to: step.bias, strategy: step.strategy });
              running = step.bias;
            }

            const closePct = out[`day_change_pct_${label}`] ?? null;
            const outcome = out[`target_hit_${label}`] ? "target hit" : out[`sl_hit_${label}`] ? "stop hit" : (out[`target_hit_${label}`] != null || out[`sl_hit_${label}`] != null) ? "neither target nor stop hit" : null;

            return { openBias, gapPct, checkpoints: sequence, flips, finalBias: running, closePct, outcome };
          }

          for (const label of ["nifty", "sensex"] as const) {
            const struct = buildRecapStruct(label);
            if (struct.openBias == null && struct.checkpoints.length === 0 && struct.closePct == null) {
              skipped.push(`recap_story_${label}: no data available to summarize today`);
              continue;
            }

            const prompt = `You write a short recap sentence (2-3 sentences max) describing one trading day's arc for an options-trading dashboard. `
              + `You are given a structured JSON summary of what already happened -- do not invent, guess, or add any fact, number, or time that is not present in the JSON. `
              + `Your only job is phrasing: turn this structured data into natural, readable prose covering the open, how the mid-market bias moved through the day's checkpoints (name the actual checkpoint time if a flip happened), and how the day closed. `
              + `Do not use bullet points, do not use headers, do not recommend a strategy, plain sentences only.\n\n`
              + `JSON: ${JSON.stringify(struct)}`;

            try {
              const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
                method: "POST",
                headers: { "x-api-key": anthropicKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
                body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 220, temperature: 0.7, messages: [{ role: "user", content: prompt }] }),
              });
              if (!aiRes.ok) {
                skipped.push(`recap_story_${label}: Anthropic API ${aiRes.status} ${await aiRes.text()}`);
              } else {
                const aiJson = await aiRes.json();
                const text = aiJson?.content?.[0]?.text?.trim();
                if (text) out[`recap_story_${label}`] = text;
                else skipped.push(`recap_story_${label}: empty response from model`);
              }
            } catch (e) { skipped.push(`recap_story_${label}: ${e}`); }
          }
        }
      } catch (e) { skipped.push(`recap_story: ${e}`); }

      if (skipped.length) out.skipped_notes = skipped.join(" | ");
      const { error } = await admin.from("postmarket_summary").upsert(out, { onConflict: "trade_date" });
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true, phase, written: out, autoResolve, skipped }), { headers: { "Content-Type": "application/json" } });
    }

    if (phase === "post-fii") {
      const out: Record<string, unknown> = { trade_date: tradeDate };
      try {
        const fii = await fiiDiiCash("fii", upstoxToken);
        if (fii) {
          out.fii_net_cash_cr = fii.netCr;
          out.fii_dii_data_date = fii.date;
        } else {
          skipped.push("fii: no rows returned");
        }
      } catch (e) { skipped.push(`fii: ${e}`); }

      try {
        const dii = await fiiDiiCash("dii", upstoxToken);
        if (dii) {
          out.dii_net_cash_cr = dii.netCr;
          if (!out.fii_dii_data_date) out.fii_dii_data_date = dii.date;
        } else {
          skipped.push("dii: no rows returned");
        }
      } catch (e) { skipped.push(`dii: ${e}`); }

      if (skipped.length) out.skipped_notes = skipped.join(" | ");
      const { error } = await admin.from("postmarket_summary").upsert(out, { onConflict: "trade_date" });
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true, phase, written: out, skipped }), { headers: { "Content-Type": "application/json" } });
    }

    if (phase === "blog") {
      // v9: generates Nifty Today / Sensex Today public posts from the day's already-captured
      // market data. Requires an "anthropic_api_key" secret in the vault -- if it's not there
      // yet (it isn't, as of this deploy), this phase cleanly no-ops rather than failing hard
      // or writing placeholder junk into the public blog_posts table.
      const blogPhase = body.blogPhase === "postmarket" ? "postmarket" : "premarket";
      const { data: anthropicKey } = await admin.rpc("get_vault_secret", { secret_name: "anthropic_api_key" });
      if (!anthropicKey) {
        return new Response(JSON.stringify({ ok: true, phase, blogPhase, skipped: ["anthropic_api_key not yet configured in vault -- skipping content generation"] }), { headers: { "Content-Type": "application/json" } });
      }

      let result: Record<string, unknown> = { skipped: true };

      try {
        const { data: existing } = await admin
          .from("blog_posts")
          .select("id")
          .eq("trade_date", tradeDate)
          .eq("phase", blogPhase)
          .maybeSingle();
        if (existing) {
          result = { skipped: "already published today" };
        } else {
          let sourceRow: Record<string, unknown> | null = null;
          // v18: explicit field allowlists instead of select("*"), matching exactly what the
          // dashboard's own Pre-market / Post-market pages show. premarket_dashboard is one row
          // per day that gets progressively filled in by later phases (open, mid, etc.), so
          // select("*") risked a late-running or re-triggered pre-market blog call leaking
          // open-phase-only fields (spot, PCR, max pain, market_bias, suggested_strategy) into
          // what's supposed to be a pre-market-only read. postmarket_summary is written once by
          // the post-close phase so has no such leakage risk, but the allowlist is kept anyway
          // for consistency and so a future schema addition doesn't silently start flowing into
          // the prompt without a deliberate decision to include it.
          const PREMARKET_BLOG_FIELDS = [
            "india_vix", "gift_nifty_gap_pct", "gift_nifty_gap_pts",
            "days_to_expiry_nifty", "days_to_expiry_sensex",
            "avg_move_5d_nifty", "avg_move_5d_sensex",
            "prev_day_change_pct_nifty", "prev_day_change_pct_sensex",
            "prev_day_change_pts_nifty", "prev_day_change_pts_sensex",
            "chart_support_nifty", "chart_support_sensex",
            "chart_resistance_nifty", "chart_resistance_sensex",
            "oi_support_nifty", "oi_support_sensex",
            "oi_resistance_nifty", "oi_resistance_sensex",
            "oi_change_support_nifty", "oi_change_support_sensex",
            "oi_change_resistance_nifty", "oi_change_resistance_sensex",
            "event_today",
          ] as const;
          const POSTMARKET_BLOG_FIELDS = [
            "close_nifty", "close_sensex",
            "day_change_pct_nifty", "day_change_pct_sensex",
            "day_high_nifty", "day_low_nifty",
            "day_high_sensex", "day_low_sensex",
            "recap_story_nifty", "recap_story_sensex",
          ] as const;
          if (blogPhase === "premarket") {
            const { data } = await admin.from("premarket_dashboard").select(PREMARKET_BLOG_FIELDS.join(", ")).eq("trade_date", tradeDate).maybeSingle();
            sourceRow = data;
          } else {
            const { data } = await admin.from("postmarket_summary").select(POSTMARKET_BLOG_FIELDS.join(", ")).eq("trade_date", tradeDate).maybeSingle();
            sourceRow = data;
          }

          if (!sourceRow) {
            skipped.push(`blog ${blogPhase}: no source data row for today yet`);
          } else {
            const dateSlugPart = new Date(`${tradeDate}T00:00:00`).toLocaleDateString("en-US", { timeZone: "Asia/Kolkata", month: "long", day: "numeric", year: "numeric" })
              .replace(",", "").toLowerCase().replace(/\s+/g, "-");
            const slug = `${blogPhase}-${dateSlugPart}`;
            const phaseLabel = blogPhase === "premarket" ? "Pre-Market" : "Post-Market";
            const dayName = dayNameIST();

            // v18: separate, phase-aware prompts (2026-08-27, per publisher instruction) --
            // previously both premarket and postmarket shared one generic prompt/data-dump, with
            // no guidance on what's actually known at each point in the session. Pre-market (runs
            // 8:58/9:00 AM, before the 9:30 AM open phase) genuinely has no PCR, max pain, spot
            // price, or computed bias/strategy yet -- OI support/resistance IS available (it
            // comes from the live options chain, not the cash-market open) but must not be turned
            // into a directional call. Post-market has the full day's arc plus the AI-phrased
            // recap_story already built by the post-close phase, and is the one point where
            // continuity with the prior day is fair game. Both prompts also now explicitly
            // forbid "yesterday"/"today" in favor of naming the actual weekday, since a post may
            // be read on any later date and relative day words are ambiguous out of context.
            const sharedRules = `Never say "yesterday" or "today" -- always name the actual weekday, e.g. "the prior session (Wednesday)" or "Thursday's close." This post may be read on any later date, so relative day words are ambiguous out of context.\n`
              + `No template feel -- vary opening line, which index leads, sentence rhythm, and paragraph order each day. Don't reuse "today's session shows" or "the data indicates" as a crutch.\n`
              + `Cover both Nifty and Sensex with genuine substance -- don't let one dominate and reduce the other to an afterthought sentence. Weave them together where the picture is similar, contrast where it differs.\n`
              + `Write a headline first, then the body. Start the headline with "Nifty" for search purposes, keep it under 70 characters, and do not include the word "MarketCue" in it (that gets appended separately). Never invent a number that isn't in the data provided.\n\n`
              + `Return your answer in exactly this format, nothing else:\n`
              + `HEADLINE: <your headline>\n`
              + `BODY: <your body text>\n\n`;

            const prompt = blogPhase === "premarket"
              ? `You are writing a short pre-market setup post for a Nifty/Sensex trading platform, using the same data already shown on the platform's own Pre-market dashboard page. This runs before the market opens -- there is no live open-market data yet (no spot price, no PCR, no max pain, no computed market bias/strategy). You DO have open-interest support/resistance levels and their recent change (Addition/Unwinding), since those come from the live options chain, which trades independently of the cash market opening. This is a "what to watch for" setup read, not a verdict.\n\n`
                + `No strategy recommendation and no market bias/verdict language ("bullish", "bearish", "neutral" as a call) -- those terms describe a computed score that does not exist yet at this time of day. You may describe what the OI positioning suggests market participants are doing, but do not turn that into a directional call or a trade recommendation.\n`
                + sharedRules
                + `Headline should capture the day's actual pre-market character (e.g. a GIFT Nifty gap-up signal, an expiry-week setup, elevated/muted VIX, notable OI build-up) rather than being a generic dated title. Body: 280-380 words, plain prose paragraphs, no headers, no bullet points, no markdown.\n\n`
                + `What you can talk about (matches what the Pre-market dashboard page itself shows): GIFT Nifty is a live, actively trading instrument during this pre-market window, not a static prediction -- phrase it as "GIFT Nifty is trading at +X% (+Y points)" rather than a vaguer "signal" or "indicator" framing, since it genuinely is trading right now, ahead of the NIFTY cash market's own open. Also cover how the prior session actually closed (named by weekday) and its point/percent move, India VIX level, days to expiry for each index, the 5-day average daily move, the prior day's chart support/resistance pivot levels, and the options chain's OI support/resistance strikes plus whether recent activity there is Addition or Unwinding. Do not use PCR, max pain, or spot price -- those fields are intentionally excluded from the data below because they don't exist yet at this point in the session.\n\n`
                + `Data for ${tradeDate} (${dayName}) -- pre-market fields only, fields suffixed _nifty are Nifty, fields suffixed _sensex are Sensex, shared fields like india_vix apply to both: ${JSON.stringify(sourceRow)}`
              : `You are writing a short post-market recap post for a Nifty/Sensex trading platform, using the same data already shown on the platform's own Post-market dashboard page. This runs after the market has closed -- the full session's data is available. You also have a pre-built structured recap (recap_story) that already traces the day's bias arc (open -> mid-market shifts -> close) -- use it as your factual backbone, then write your own prose around it rather than copying it verbatim.\n\n`
                + `No strategy recommendation. This is a recap of what happened, not advice on what to trade next. Never use words like "recommend", "should trade", "buy this", "consider entering". You may describe the day's character (e.g. "closed at session lows, extending the bearish tilt that set in mid-morning") without turning it into forward-looking trade advice -- point to the dashboard's Verdict page for the system's own call heading into the next session. Do not state or imply tomorrow's opening bias.\n`
                + sharedRules
                + `Headline should capture the day's actual character (a reversal, a grind lower, a breakout, a divergence between the two indices) rather than a generic dated title. Body: 320-450 words (fuller than the pre-market post, since a whole session needs covering), plain prose paragraphs, no headers, no bullet points, no markdown.\n\n`
                + `What you can talk about (matches what the Post-market dashboard page itself shows): the close price and the day's percent and point change for each index, the day's high and low and where the close landed relative to that range, the shape of the day's bias arc as given in recap_story_nifty/sensex, and -- since post-market is the one point where continuity is fair game -- how today's move compares with or continues from the prior day's close.\n\n`
                + `Data for ${tradeDate} (${dayName}) -- post-market fields only, fields suffixed _nifty are Nifty, fields suffixed _sensex are Sensex: ${JSON.stringify(sourceRow)}`;

            const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
              method: "POST",
              headers: {
                "x-api-key": anthropicKey,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
              },
              body: JSON.stringify({
                model: "claude-haiku-4-5-20251001",
                max_tokens: 900,
                temperature: 1,
                messages: [{ role: "user", content: prompt }],
              }),
            });

            if (!aiRes.ok) {
              skipped.push(`blog ${blogPhase}: Anthropic API ${aiRes.status} ${await aiRes.text()}`);
            } else {
              const aiJson = await aiRes.json();
              const rawText = aiJson?.content?.[0]?.text?.trim();
              if (!rawText) {
                skipped.push(`blog ${blogPhase}: empty response from model`);
              } else {
                const headlineMatch = rawText.match(/HEADLINE:\s*(.+?)(?:\n|$)/);
                const bodyMatch = rawText.match(/BODY:\s*([\s\S]+)$/);
                const generatedHeadline = headlineMatch?.[1]?.trim();
                const body_text = bodyMatch?.[1]?.trim() ?? rawText;
                const title = generatedHeadline
                  ? `${generatedHeadline} | MarketCue`
                  : `Nifty & Sensex Today: ${phaseLabel} | MarketCue`;

                const { error: insertError } = await admin.from("blog_posts").insert({
                  trade_date: tradeDate,
                  instrument: "BOTH",
                  phase: blogPhase,
                  slug,
                  title,
                  body: body_text,
                  badges: [blogPhase],
                });
                if (insertError) {
                  skipped.push(`blog ${blogPhase} insert: ${insertError.message}`);
                } else {
                  result = { published: true, slug, title };
                }
              }
            }
          }
        }
      } catch (e) { skipped.push(`blog ${blogPhase}: ${e}`); }

      return new Response(JSON.stringify({ ok: true, phase, blogPhase, result, skipped }), { headers: { "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: `unknown phase: ${phase}` }), { status: 400 });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e), skipped }), { status: 500 });
  }
})
