// oi-snapshot-log
// v1: dense (1-min) option-chain summary history for NIFTY and SENSEX, feeding oi_snapshot_log.
//
// Deliberately isolated from market-data-sync: it never reads or writes premarket_dashboard,
// midmarket_snapshot, agent_calls, trades, or blog_posts, and market-data-sync is not touched or
// imported by this file. That function's premarket/open/mid checkpoints already back the
// Verdict/dashboard screens and must keep working exactly as they do today. This function exists
// solely to log the same kind of option-chain summary far more often, so the Chart screen can
// later plot OI/PCR/max-pain history instead of only today's handful of checkpoints.
//
// Every helper below (upstoxGet, nearestExpiry, optionChain, computePCR, computeMaxPain,
// findATMRow, oiSupportResistance) is a deliberate copy of the equivalent logic in
// market-data-sync/index.ts, not a shared import -- two independently deployable Edge Functions
// should not share a module that could change one's behavior while deploying the other.
//
// Runs every minute during market hours (see the pg_cron entry in the accompanying migration);
// no-ops outside 09:15-15:30 IST. No mode/phase in the POST body -- there is only one thing this
// function does.

import { createClient } from "jsr:@supabase/supabase-js@2";

const UPSTOX_BASE = "https://api.upstox.com/v2";
const UPSTOX_TIMEOUT_MS = 15_000;

const INSTR = {
  NIFTY: "NSE_INDEX|Nifty 50",
  SENSEX: "BSE_INDEX|SENSEX",
} as const;

function nowIST(): Date {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
}

function todayIST(): string {
  return nowIST().toISOString().slice(0, 10);
}

function isMarketHoursIST(): boolean {
  const now = nowIST();
  const day = now.getDay();
  if (day === 0 || day === 6) return false;
  const minutes = now.getHours() * 60 + now.getMinutes();
  return minutes >= 9 * 60 + 15 && minutes <= 15 * 60 + 30;
}

async function upstoxGet(path: string, token: string) {
  const res = await fetch(`${UPSTOX_BASE}${path}`, {
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

async function nearestExpiry(instrumentKey: string, token: string): Promise<string> {
  const data = await upstoxGet(`/option/contract?instrument_key=${encodeURIComponent(instrumentKey)}`, token);
  const today = todayIST();
  const expiries = [...new Set(data.map((c: any) => c.expiry))].sort() as string[];
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

async function snapshotFor(instrument: "NIFTY" | "SENSEX", token: string) {
  const instrumentKey = INSTR[instrument];
  const expiry = await nearestExpiry(instrumentKey, token);
  const chain = await optionChain(instrumentKey, expiry, token);
  const spot = chain[0]?.underlying_spot_price ?? null;
  if (spot == null) throw new Error(`${instrument}: no underlying_spot_price in chain response`);
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
    instrument,
    captured_at: new Date().toISOString(),
    trade_date: today,
    expiry,
    dte,
    spot,
    atm_strike: atmRow.strike_price,
    pcr,
    max_pain: maxPain,
    atm_iv: atmIV,
    straddle_price: +straddlePrice.toFixed(2),
    straddle_delta: +straddleDelta.toFixed(4),
    straddle_theta: +straddleTheta.toFixed(2),
    oi_support: supportStrike,
    oi_resistance: resistanceStrike,
    oi_support_change: supportChange,
    oi_resistance_change: resistanceChange,
  };
}

Deno.serve(async (req: Request) => {
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const cronSecret = req.headers.get("x-cron-secret");
  const { data: expectedSecret } = await admin.rpc("get_vault_secret", { secret_name: "edge_function_cron_secret" });
  if (!cronSecret || cronSecret !== expectedSecret) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }

  if (!isMarketHoursIST()) {
    return new Response(JSON.stringify({ skipped: "outside market hours" }), { status: 200 });
  }

  const { data: upstoxToken } = await admin.rpc("get_vault_secret", { secret_name: "upstox_analytics_token" });
  if (!upstoxToken) {
    return new Response(JSON.stringify({ error: "upstox_analytics_token not found in vault" }), { status: 500 });
  }

  const results: Record<string, "ok" | string> = {};
  const rows: any[] = [];

  for (const instrument of ["NIFTY", "SENSEX"] as const) {
    try {
      rows.push(await snapshotFor(instrument, upstoxToken));
      results[instrument] = "ok";
    } catch (e) {
      results[instrument] = String(e);
    }
  }

  if (rows.length) {
    const { error } = await admin.from("oi_snapshot_log").upsert(rows, { onConflict: "instrument,captured_at" });
    if (error) {
      return new Response(JSON.stringify({ results, dbError: error.message }), { status: 500 });
    }
  }

  return new Response(JSON.stringify({ results, logged: rows.length }), { status: 200 });
});
