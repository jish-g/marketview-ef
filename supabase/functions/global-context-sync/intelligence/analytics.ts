// MarketCue intelligence engine: history analytics.
//
// Everything here is computed from stored daily closes (market_daily). Momentum, realised
// volatility and z-scores per instrument; measured Global → India transmission from the 20-day
// correlation and beta of Nifty's daily return against the prior US session; and quantitative
// "significant move" events. Deterministic, config-driven, no LLM.

import { BASKET, CORRELATION, HISTORY, INDIA_IMPACT, MOVE_THRESHOLDS, RELEVANCE } from "./config.ts";

export type DailyBar = { asset: string; day: string; close: number; changePct: number | null };

export type AssetStats = {
  asset: string; label: string; group: string;
  sessions: number;
  ret5: number | null;        // % over the last 5 sessions
  ret20: number | null;       // % over the last 20 sessions
  vol20: number | null;       // stdev of daily % changes over 20 sessions
  z: number | null;           // today's % change / vol20
  lastDay: string | null;
};

export type Measured = {
  correlation20: number | null;  // Nifty daily return vs prior-session S&P daily return
  beta20: number | null;
  pairs: number;
  relPerf20: number | null;      // Nifty 20d return minus S&P 20d return, % points
  niftyRet20: number | null; spxRet20: number | null;
  label: "Strong" | "Moderate" | "Weak" | "Unknown";
  reading: string;
};

export type MoveEvent = {
  dedupeKey: string;
  eventTime: string;
  category: "price_move";
  title: string;
  summary: string;
  affectedAssets: string[];
  marketDirection: "risk_on" | "risk_off" | "neutral";
  assetDirection: "up" | "down";
  globalRelevance: number;
  indiaRelevance: number;
  confidence: number;
  indiaImpact: string;
  evidence: { asset: string; changePct: number; z: number; vol20: number; sessions: number };
};

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const stdev = (xs: number[]) => { if (xs.length < 2) return null; const m = mean(xs); return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1)); };

function byAsset(bars: DailyBar[]): Map<string, DailyBar[]> {
  const m = new Map<string, DailyBar[]>();
  for (const b of bars) { if (!Number.isFinite(b.close)) continue; const arr = m.get(b.asset) ?? []; arr.push(b); m.set(b.asset, arr); }
  for (const arr of m.values()) arr.sort((a, b) => a.day.localeCompare(b.day));
  return m;
}

// Daily % changes derived from consecutive closes, so a null change_pct in a stored row never
// breaks the series.
function dailyReturns(bars: DailyBar[]): { day: string; ret: number }[] {
  const out: { day: string; ret: number }[] = [];
  for (let i = 1; i < bars.length; i++) {
    const p = bars[i - 1].close, c = bars[i].close;
    if (p > 0) out.push({ day: bars[i].day, ret: ((c - p) / p) * 100 });
  }
  return out;
}

// ---------------------------------------------------------------------------- per-asset stats
// `todayChangePct` is the live quote's change (already vs prior close) so intraday moves are
// scored against history before the day's bar is final.
export function computeStats(bars: DailyBar[], liveChange: Map<string, number | null>): AssetStats[] {
  const m = byAsset(bars);
  return BASKET.map((b) => {
    const arr = m.get(b.symbol) ?? [];
    const rets = dailyReturns(arr);
    const n = HISTORY.lookbackDays;
    const last = arr.length ? arr[arr.length - 1] : null;
    const back = (k: number) => (arr.length > k ? ((last!.close - arr[arr.length - 1 - k].close) / arr[arr.length - 1 - k].close) * 100 : null);
    const window = rets.slice(-n).map((r) => r.ret);
    const vol20 = window.length >= HISTORY.minPairs ? stdev(window) : null;
    const chg = liveChange.get(b.symbol) ?? (rets.length ? rets[rets.length - 1].ret : null);
    return {
      asset: b.symbol, label: b.label, group: b.group, sessions: arr.length,
      ret5: back(HISTORY.shortDays), ret20: back(n),
      vol20: vol20 == null ? null : +vol20.toFixed(3),
      z: vol20 && chg != null && vol20 > 0 ? +(chg / vol20).toFixed(2) : null,
      lastDay: last?.day ?? null,
    };
  });
}

// ---------------------------------------------------------------------- measured transmission
// India trades after the US closes, so Nifty's return on day D is paired with the S&P return of
// the most recent US session strictly before D.
export function measureTransmission(bars: DailyBar[]): Measured {
  const m = byAsset(bars);
  const nifty = dailyReturns(m.get("^NSEI") ?? []);
  const spx = dailyReturns(m.get("^GSPC") ?? []);
  const pairs: [number, number][] = [];
  let j = 0;
  for (const d of nifty.slice(-HISTORY.lookbackDays * 2)) {
    while (j < spx.length && spx[j].day < d.day) j++;
    const prior = j > 0 ? spx[j - 1] : null;
    if (prior) pairs.push([d.ret, prior.ret]);
  }
  const win = pairs.slice(-HISTORY.lookbackDays);
  const n = win.length;
  let correlation20: number | null = null, beta20: number | null = null;
  if (n >= HISTORY.minPairs) {
    const xs = win.map((p) => p[1]), ys = win.map((p) => p[0]);
    const mx = mean(xs), my = mean(ys);
    let cov = 0, vx = 0, vy = 0;
    for (let i = 0; i < n; i++) { cov += (xs[i] - mx) * (ys[i] - my); vx += (xs[i] - mx) ** 2; vy += (ys[i] - my) ** 2; }
    correlation20 = vx > 0 && vy > 0 ? +(cov / Math.sqrt(vx * vy)).toFixed(2) : null;
    beta20 = vx > 0 ? +(cov / vx).toFixed(2) : null;
  }
  const ret20 = (a: string) => { const arr = m.get(a) ?? []; const k = HISTORY.lookbackDays; return arr.length > k ? +(((arr[arr.length - 1].close - arr[arr.length - 1 - k].close) / arr[arr.length - 1 - k].close) * 100).toFixed(2) : null; };
  const niftyRet20 = ret20("^NSEI"), spxRet20 = ret20("^GSPC");
  const relPerf20 = niftyRet20 != null && spxRet20 != null ? +(niftyRet20 - spxRet20).toFixed(2) : null;
  const label: Measured["label"] = correlation20 == null ? "Unknown" : Math.abs(correlation20) >= CORRELATION.strong ? "Strong" : Math.abs(correlation20) >= CORRELATION.moderate ? "Moderate" : "Weak";
  const reading = correlation20 == null
    ? `Not enough aligned sessions yet (${n} of ${HISTORY.minPairs} needed) to measure how closely Nifty follows the US.`
    : `Over the last ${n} sessions Nifty's daily move has a ${correlation20 >= 0 ? "" : "negative "}${label.toLowerCase()} correlation of ${correlation20} with the prior US session (beta ${beta20}).` +
      (relPerf20 != null ? ` India has ${relPerf20 >= 0 ? "outperformed" : "underperformed"} the S&P 500 by ${Math.abs(relPerf20).toFixed(1)} points over 20 sessions.` : "");
  return { correlation20, beta20, pairs: n, relPerf20, niftyRet20, spxRet20, label, reading };
}

// -------------------------------------------------------------------------- significant moves
const RISK_NEGATIVE_UP = new Set(["volatility", "rates", "dollar", "crude"]);

export function detectMoves(stats: AssetStats[], liveChange: Map<string, number | null>, now: Date): MoveEvent[] {
  const day = now.toISOString().slice(0, 10);
  const out: MoveEvent[] = [];
  for (const s of stats) {
    const chg = liveChange.get(s.asset);
    if (chg == null || s.z == null || s.vol20 == null) continue;
    if (Math.abs(s.z) < MOVE_THRESHOLDS.significant || Math.abs(chg) < MOVE_THRESHOLDS.minAbsPct) continue;
    const up = chg > 0;
    const extreme = Math.abs(s.z) >= MOVE_THRESHOLDS.extreme;
    const verb = up ? (extreme ? "surges" : "rises") : (extreme ? "slides" : "falls");
    const rel = RELEVANCE[s.group] ?? { india: 0.5, global: 0.5 };
    const impact = INDIA_IMPACT[s.group]?.[up ? "up" : "down"] ?? "";
    const riskUp = RISK_NEGATIVE_UP.has(s.group) ? !up : up;
    out.push({
      dedupeKey: `${s.asset}:${day}:${up ? "up" : "down"}`,
      eventTime: now.toISOString(),
      category: "price_move",
      title: `${s.label} ${verb} ${chg > 0 ? "+" : ""}${chg.toFixed(2)}%`,
      summary: `${s.label} moved ${chg > 0 ? "+" : ""}${chg.toFixed(2)}%, about ${Math.abs(s.z).toFixed(1)}× its typical daily move of ${s.vol20.toFixed(2)}% over the last ${HISTORY.lookbackDays} sessions${s.ret5 != null ? `; ${s.ret5 >= 0 ? "+" : ""}${s.ret5.toFixed(1)}% over 5 sessions` : ""}.`,
      affectedAssets: [s.asset],
      marketDirection: riskUp ? "risk_on" : "risk_off",
      assetDirection: up ? "up" : "down",
      globalRelevance: rel.global,
      indiaRelevance: rel.india,
      confidence: +Math.min(1, Math.abs(s.z) / 3).toFixed(2),
      indiaImpact: impact,
      evidence: { asset: s.asset, changePct: chg, z: s.z, vol20: s.vol20, sessions: s.sessions },
    });
  }
  return out.sort((a, b) => b.indiaRelevance * Math.abs(b.evidence.z) - a.indiaRelevance * Math.abs(a.evidence.z));
}
