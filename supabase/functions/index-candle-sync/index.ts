// index-candle-sync
// v1: the candle series behind the Chart screen.
//
// Pulls one-minute OHLC for Nifty 50 and Sensex from Zerodha Kite Connect's historical API and
// upserts it into index_candles. Nothing else in the pipeline is touched: this function never
// reads or writes premarket_dashboard, midmarket_snapshot, agent_calls, trades or blog_posts.
//
// WHY A POLLER AND NOT KiteTicker
// Kite's live feed is a WebSocket authenticated with api_key + access_token. Neither can go near
// a browser, and neither a Supabase Edge Function nor a Vercel function can hold a socket open
// for a six-hour session -- both are request-scoped. A once-a-minute pull of the historical
// endpoint gives the same minute bars the ticker would aggregate to, with no process to host.
// It is also strictly better than stitching bars out of repeated LTP quotes: these are the
// exchange's own OHLC, so a wick between two polls is not lost.
//
// THE DAILY TOKEN
// Kite access tokens expire every morning and are re-minted by the existing interactive login.
// The token is already persisted in kite_session, which is the shared session source used by the
// rest of the Kite pipeline. This function reads that session instead of maintaining a second
// Vault copy that could drift from the token refreshed by the daily login.
//
// Modes (POST body { mode, days? }, same x-cron-secret as market-data-sync):
//   session    every minute 09:15-15:30 IST -> today's bars from 09:15 to now. No-ops off-session.
//   backfill   once at ~09:10 IST, or by hand after an outage -> the last `days` sessions.

import { createClient } from "jsr:@supabase/supabase-js@2";

const KITE_BASE = "https://api.kite.trade";

// API key and cron secret remain in Vault. The daily access token lives in kite_session because
// the interactive login refreshes that row each morning.
const KITE_API_KEY_SECRET = "kite_api_key";

// Instrument tokens from Kite's instruments dump (https://api.kite.trade/instruments). Index
// spots, so the candles carry no meaningful volume -- the chart does not draw any.
// Verify against a fresh dump before trusting a changed value; both are overridable by env so a
// correction does not need a redeploy of this file.
const INSTRUMENTS: { instrument: "NIFTY" | "SENSEX"; token: number }[] = [
  { instrument: "NIFTY", token: Number(Deno.env.get("KITE_TOKEN_NIFTY") ?? 256265) },
  { instrument: "SENSEX", token: Number(Deno.env.get("KITE_TOKEN_SENSEX") ?? 265) },
];

type Candle = { instrument: string; bucket: string; trade_date: string; open: number; high: number; low: number; close: number };

// ---------------------------------------------------------------------------------------------
// IST helpers. Same Intl-based approach the rest of the pipeline uses (todayIST in
// market-data-sync, lib/market-data.ts) rather than manual offset arithmetic, so a DST-free
// +05:30 stays correct without this file owning a second definition of "today".
// ---------------------------------------------------------------------------------------------
function istParts(d: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
    weekday: "short",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute"), second: get("second"), weekday: get("weekday") };
}

function todayIST(d = new Date()): string {
  const p = istParts(d);
  return `${p.year}-${p.month}-${p.day}`;
}

// Kite's from/to want "yyyy-mm-dd hh:mm:ss" in IST, not ISO/UTC.
function kiteStamp(dateISO: string, time: string): string {
  return `${dateISO} ${time}`;
}

function istMinuteOfDay(d = new Date()): number {
  const p = istParts(d);
  return Number(p.hour) * 60 + Number(p.minute);
}

// 09:15-15:30 IST, weekdays. A market holiday is not detectable here without a calendar, and does
// not need to be: Kite simply returns no candles for that day and nothing is written.
function withinSessionIST(d = new Date()): boolean {
  const p = istParts(d);
  if (p.weekday === "Sat" || p.weekday === "Sun") return false;
  const m = istMinuteOfDay(d);
  // Five minutes of tail so the 15:29 bar is fetched after it closes.
  return m >= 9 * 60 + 15 && m <= 15 * 60 + 35;
}

// Prior IST trading day, N weekdays back. Holidays are not skipped -- an extra empty day in the
// backfill range costs nothing, a missing one would leave the chart short of context.
function sessionsBackIST(days: number): string {
  const d = new Date();
  let remaining = days;
  while (remaining > 0) {
    d.setUTCDate(d.getUTCDate() - 1);
    const wd = istParts(d).weekday;
    if (wd !== "Sat" && wd !== "Sun") remaining--;
  }
  return todayIST(d);
}

// ---------------------------------------------------------------------------------------------
// Kite historical fetch. Returns null (rather than throwing) when the day's login has not
// happened, so the caller can report that distinctly from a genuine fault.
// ---------------------------------------------------------------------------------------------
type FetchResult = { candles: Candle[] } | { tokenMissing: true } | { error: string };

async function fetchCandles(
  instrument: "NIFTY" | "SENSEX",
  token: number,
  from: string,
  to: string,
  apiKey: string,
  accessToken: string,
): Promise<FetchResult> {
  const url = `${KITE_BASE}/instruments/historical/${token}/minute?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        "X-Kite-Version": "3",
        Authorization: `token ${apiKey}:${accessToken}`,
      },
    });
  } catch (e) {
    return { error: `network: ${e}` };
  }

  if (res.status === 403) return { tokenMissing: true };
  if (!res.ok) return { error: `kite ${res.status}: ${(await res.text()).slice(0, 200)}` };

  let body: { data?: { candles?: unknown[][] } };
  try { body = await res.json(); } catch (e) { return { error: `parse: ${e}` }; }

  const raw = body?.data?.candles ?? [];
  const candles: Candle[] = [];
  for (const c of raw) {
    // [ "2026-09-15T09:15:00+0530", open, high, low, close, volume ]
    const stamp = String(c[0]);
    const at = new Date(stamp);
    if (Number.isNaN(at.getTime())) continue;
    const [open, high, low, close] = [Number(c[1]), Number(c[2]), Number(c[3]), Number(c[4])];
    if (![open, high, low, close].every(Number.isFinite)) continue;
    candles.push({
      instrument,
      bucket: at.toISOString(),
      // The candle's own IST date, not today's -- a backfill spans several sessions.
      trade_date: todayIST(at),
      open, high, low, close,
    });
  }
  return { candles };
}

// ---------------------------------------------------------------------------------------------
// Only write what actually changed. Re-upserting all 375 of a session's bars every minute would
// fire a Realtime event per row per minute at every open chart, for bars that closed hours ago.
// One read of the range we just fetched, a diff in memory, and the write is typically the one
// forming bar.
// ---------------------------------------------------------------------------------------------
function changedRows(fetched: Candle[], existing: Map<string, Candle>): Candle[] {
  const out: Candle[] = [];
  for (const c of fetched) {
    const prev = existing.get(`${c.instrument}|${c.bucket}`);
    if (!prev) { out.push(c); continue; }
    if (Number(prev.open) !== c.open || Number(prev.high) !== c.high || Number(prev.low) !== c.low || Number(prev.close) !== c.close) out.push(c);
  }
  return out;
}

Deno.serve(async (req: Request) => {
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const cronSecret = req.headers.get("x-cron-secret");
  const { data: expectedSecret } = await admin.rpc("get_vault_secret", { secret_name: "edge_function_cron_secret" });
  if (!cronSecret || cronSecret !== expectedSecret) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }

  let body: { mode?: string; days?: number } = {};
  try { body = await req.json(); } catch { /* no body -> session mode */ }
  const mode = body.mode === "backfill" ? "backfill" : "session";
  const days = Math.min(Math.max(Number(body.days ?? 5), 1), 30);

  if (mode === "session" && !withinSessionIST()) {
    return new Response(JSON.stringify({ ok: true, mode, skipped: "outside market hours" }), { status: 200 });
  }

  const { data: apiKey } = await admin.rpc("get_vault_secret", { secret_name: KITE_API_KEY_SECRET });

  // Reuse the token produced by the existing daily Kite login. This is intentionally read from
  // the table rather than Vault: kite_session is the source of truth that gets refreshed each day.
  const { data: sessionRow, error: sessionError } = await admin
    .from("kite_session")
    .select("access_token, updated_at")
    .eq("id", true)
    .maybeSingle();

  const accessToken = sessionRow?.access_token;
  if (sessionError || !apiKey || !accessToken) {
    return new Response(JSON.stringify({
      ok: false,
      mode,
      reason: "kite_session_missing",
      detail: sessionError ? `kite_session read failed: ${sessionError.message}` : "daily Kite session is not available",
    }), { status: 200 });
  }

  const today = todayIST();
  const nowIST = istParts(new Date());
  const from = mode === "backfill"
    ? kiteStamp(sessionsBackIST(days), "09:15:00")
    : kiteStamp(today, "09:15:00");
  const to = kiteStamp(today, `${nowIST.hour}:${nowIST.minute}:${nowIST.second}`);

  const written: Record<string, number> = {};
  const skipped: string[] = [];
  let tokenMissing = false;

  for (const { instrument, token } of INSTRUMENTS) {
    const result = await fetchCandles(instrument, token, from, to, String(apiKey), String(accessToken));

    if ("tokenMissing" in result) { tokenMissing = true; skipped.push(`${instrument}: Kite session not established for today`); continue; }
    if ("error" in result) { skipped.push(`${instrument}: ${result.error}`); continue; }
    if (result.candles.length === 0) { skipped.push(`${instrument}: no candles in range (market holiday, or session not open yet)`); continue; }

    const first = result.candles[0].bucket;
    const last = result.candles[result.candles.length - 1].bucket;
    const { data: existingRows, error: readError } = await admin
      .from("index_candles")
      .select("instrument, bucket, open, high, low, close")
      .eq("instrument", instrument)
      .gte("bucket", first)
      .lte("bucket", last);
    if (readError) { skipped.push(`${instrument}: read existing: ${readError.message}`); continue; }

    const existing = new Map<string, Candle>();
    for (const r of (existingRows ?? []) as Candle[]) existing.set(`${r.instrument}|${new Date(r.bucket).toISOString()}`, r);

    const rows = changedRows(result.candles, existing);
    if (rows.length === 0) { written[instrument] = 0; continue; }

    const { error: writeError } = await admin
      .from("index_candles")
      .upsert(rows.map((r) => ({ ...r, updated_at: new Date().toISOString() })), { onConflict: "instrument,bucket" });
    if (writeError) { skipped.push(`${instrument}: upsert: ${writeError.message}`); continue; }
    written[instrument] = rows.length;
  }

  return new Response(JSON.stringify({
    ok: !tokenMissing,
    mode,
    range: { from, to },
    written,
    ...(tokenMissing ? { reason: "kite_session_missing" } : {}),
    ...(skipped.length ? { skipped } : {}),
  }), { status: 200, headers: { "Content-Type": "application/json" } });
});
