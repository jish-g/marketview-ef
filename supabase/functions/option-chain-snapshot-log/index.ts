// option-chain-snapshot-log
// v1: per-strike option-chain history (ATM +/- 20 strikes) for NIFTY and SENSEX, feeding
// option_chain_snapshot. Backs two features: Options Print (per-strike OI/volume) and Greeks at
// a glance (per-strike delta/theta/gamma/vega) -- both read this one table.
//
// Deliberately isolated from market-data-sync and oi-snapshot-log: no shared imports, no table
// either of those writes is touched here, and this function is not imported by them. Every
// helper below is a copy of the equivalent logic elsewhere in the pipeline, not a shared module --
// three independently deployable Edge Functions should not share code that could change one's
// behavior while deploying another.
//
// Runs every 3 minutes during market hours (see the pg_cron entry in the accompanying
// migration); no-ops outside 09:15-15:30 IST.

import { createClient } from "jsr:@supabase/supabase-js@2";

const UPSTOX_BASE = "https://api.upstox.com/v2";
const UPSTOX_TIMEOUT_MS = 15_000;

const INSTR = {
  NIFTY: "NSE_INDEX|Nifty 50",
  SENSEX: "BSE_INDEX|SENSEX",
} as const;

const STRIKE_STEP: Record<"NIFTY" | "SENSEX", number> = { NIFTY: 50, SENSEX: 100 };
// ATM +/- this many steps. Verified against a live NIFTY chain (2026-09-19, 96 strikes): +/-20
// only captured ~74% of total OI (concentration extends further than market-data-sync's
// legPremiumRows window, which serves a different purpose -- leg pricing near ATM, not chain
// coverage). +/-30 captures ~89% combined CE+PE OI, a representative picture without pulling in
// the long, thin far-OTM tail.
const STRIKE_WINDOW = 30;

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

function findATMStrike(chain: any[], spot: number): number {
  return chain.reduce((best, row) =>
    Math.abs(row.strike_price - spot) < Math.abs(best - spot) ? row.strike_price : best
  , chain[0].strike_price);
}

async function snapshotRowsFor(instrument: "NIFTY" | "SENSEX", token: string) {
  const instrumentKey = INSTR[instrument];
  const expiry = await nearestExpiry(instrumentKey, token);
  const chain = await optionChain(instrumentKey, expiry, token);
  const spot = chain[0]?.underlying_spot_price ?? null;
  if (spot == null) throw new Error(`${instrument}: no underlying_spot_price in chain response`);

  const step = STRIKE_STEP[instrument];
  const atmStrike = findATMStrike(chain, spot);
  const lo = atmStrike - STRIKE_WINDOW * step;
  const hi = atmStrike + STRIKE_WINDOW * step;

  const capturedAt = new Date().toISOString();
  const tradeDate = todayIST();

  return chain
    .filter((row: any) => row.strike_price >= lo && row.strike_price <= hi)
    .map((row: any) => ({
      instrument,
      captured_at: capturedAt,
      trade_date: tradeDate,
      expiry,
      strike: row.strike_price,
      ce_oi: row.call_options?.market_data?.oi ?? null,
      ce_prev_oi: row.call_options?.market_data?.prev_oi ?? null,
      ce_volume: row.call_options?.market_data?.volume ?? null,
      ce_ltp: row.call_options?.market_data?.ltp ?? null,
      ce_delta: row.call_options?.option_greeks?.delta ?? null,
      ce_theta: row.call_options?.option_greeks?.theta ?? null,
      ce_gamma: row.call_options?.option_greeks?.gamma ?? null,
      ce_vega: row.call_options?.option_greeks?.vega ?? null,
      ce_iv: row.call_options?.option_greeks?.iv ?? null,
      ce_pop: row.call_options?.option_greeks?.pop ?? null,
      pe_oi: row.put_options?.market_data?.oi ?? null,
      pe_prev_oi: row.put_options?.market_data?.prev_oi ?? null,
      pe_volume: row.put_options?.market_data?.volume ?? null,
      pe_ltp: row.put_options?.market_data?.ltp ?? null,
      pe_delta: row.put_options?.option_greeks?.delta ?? null,
      pe_theta: row.put_options?.option_greeks?.theta ?? null,
      pe_gamma: row.put_options?.option_greeks?.gamma ?? null,
      pe_vega: row.put_options?.option_greeks?.vega ?? null,
      pe_iv: row.put_options?.option_greeks?.iv ?? null,
      pe_pop: row.put_options?.option_greeks?.pop ?? null,
    }));
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
      rows.push(...await snapshotRowsFor(instrument, upstoxToken));
      results[instrument] = "ok";
    } catch (e) {
      results[instrument] = String(e);
    }
  }

  if (rows.length) {
    const { error } = await admin.from("option_chain_snapshot").upsert(rows, { onConflict: "instrument,captured_at,strike" });
    if (error) {
      return new Response(JSON.stringify({ results, dbError: error.message }), { status: 500 });
    }
  }

  return new Response(JSON.stringify({ results, logged: rows.length }), { status: 200 });
});
