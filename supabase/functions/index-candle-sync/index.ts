// index-candle-sync
// v2: logs into Kite itself (TOTP), no manual step, no separate access-token secret.
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
//
// THE LOGIN
// The vault holds kite_user_id / kite_password / kite_totp_secret / kite_api_key /
// kite_api_secret -- not a pre-minted access_token. So this function performs Kite's full
// programmatic login (password -> TOTP -> request_token -> access_token exchange) itself,
// rather than depending on a manual daily step the way the original v1 assumed. It logs in at
// most once a session: the resulting token is cached in public.kite_session for the day and
// reused by every later minute's invocation, since Kite treats a login as a meaningful account
// event and re-authenticating every minute would be both slow and the kind of pattern that gets
// an account flagged.
//
// If any login step fails (wrong TOTP window, Kite UI change, temporary lockout), the function
// writes nothing and returns ok:false with the failing step named, at HTTP 200 so a minutely
// cron job does not fill the logs with failures. The chart shows the gap in words.
//
// Modes (POST body { mode, days? }, same x-cron-secret as market-data-sync):
//   session    every minute 09:15-15:30 IST -> today's bars from 09:15 to now. No-ops off-session.
//   backfill   run by hand (or once before the open) -> the last `days` sessions.

import { createClient } from "jsr:@supabase/supabase-js@2";

const KITE_LOGIN_BASE = "https://kite.zerodha.com";
const KITE_API_BASE = "https://api.kite.trade";

// Vault secret names, as they actually exist in this project's vault (confirmed 2026-09-15).
const SECRET_NAMES = {
  userId: "kite_user_id",
  password: "kite_password",
  totpSecret: "kite_totp_secret",
  apiKey: "kite_api_key",
  apiSecret: "kite_api_secret",
} as const;

// Instrument tokens from Kite's public instruments dump (https://api.kite.trade/instruments),
// verified live 2026-09-15: NIFTY 50 = 256265 (NSE, INDICES), SENSEX = 265 (BSE, INDICES).
// Index spots, so the candles carry no meaningful volume -- the chart does not draw any.
const INSTRUMENTS: { instrument: "NIFTY" | "SENSEX"; token: number }[] = [
  { instrument: "NIFTY", token: Number(Deno.env.get("KITE_TOKEN_NIFTY") ?? 256265) },
  { instrument: "SENSEX", token: Number(Deno.env.get("KITE_TOKEN_SENSEX") ?? 265) },
];

type Candle = { instrument: string; bucket: string; trade_date: string; open: number; high: number; low: number; close: number };

// ---------------------------------------------------------------------------------------------
// IST helpers. Same Intl-based approach the rest of the pipeline uses (todayIST in
// market-data-sync, lib/market-data.ts) rather than manual offset arithmetic.
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

function kiteStamp(dateISO: string, time: string): string {
  return `${dateISO} ${time}`;
}

function istMinuteOfDay(d = new Date()): number {
  const p = istParts(d);
  return Number(p.hour) * 60 + Number(p.minute);
}

function withinSessionIST(d = new Date()): boolean {
  const p = istParts(d);
  if (p.weekday === "Sat" || p.weekday === "Sun") return false;
  const m = istMinuteOfDay(d);
  return m >= 9 * 60 + 15 && m <= 15 * 60 + 35;
}

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
// TOTP (RFC 6238, SHA-1, 30s step, 6 digits) -- Kite's second factor. Deno's Web Crypto covers
// HMAC-SHA1 natively; base32 is not a built-in codec anywhere in the stdlib, so it is decoded
// by hand from the alphabet Kite (and every other TOTP issuer) uses.
// ---------------------------------------------------------------------------------------------
function base32Decode(input: string): Uint8Array {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const clean = input.replace(/=+$/, "").toUpperCase();
  let bits = "";
  for (const char of clean) {
    const val = alphabet.indexOf(char);
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return new Uint8Array(bytes);
}

async function totp(secretBase32: string): Promise<string> {
  const key = base32Decode(secretBase32);
  const counter = Math.floor(Date.now() / 1000 / 30);
  const buf = new ArrayBuffer(8);
  new DataView(buf).setUint32(4, counter); // high 32 bits stay 0 -- fine until year 2106
  const cryptoKey = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const hmac = new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, buf));
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = ((hmac[offset] & 0x7f) << 24) | ((hmac[offset + 1] & 0xff) << 16) | ((hmac[offset + 2] & 0xff) << 8) | (hmac[offset + 3] & 0xff);
  return (code % 1_000_000).toString().padStart(6, "0");
}

async function sha256Hex(input: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------------------------------------------------------------------------------------------
// Cookie handling. fetch() has no cookie jar, and Kite's login is three sequential requests
// that must carry the cookies each prior response set -- hand-rolled rather than pulled in as a
// dependency for something this small.
// ---------------------------------------------------------------------------------------------
function collectCookies(res: Response, into: Record<string, string>) {
  const getSetCookie = (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie;
  const raw = typeof getSetCookie === "function" ? getSetCookie.call(res.headers) : (res.headers.get("set-cookie") ? [res.headers.get("set-cookie")!] : []);
  for (const line of raw) {
    const pair = line.split(";")[0];
    const idx = pair.indexOf("=");
    if (idx === -1) continue;
    into[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim();
  }
}
function cookieHeader(cookies: Record<string, string>): string {
  return Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join("; ");
}

// ---------------------------------------------------------------------------------------------
// The login itself: password -> TOTP -> connect redirect chain (yields request_token) -> token
// exchange (yields access_token). Each step's failure is named distinctly so a broken run says
// which request didn't behave, rather than a bare "login failed".
//
// THE REDIRECT CHAIN (the v1 bug)
// /connect/login does NOT return request_token in its first 302. Kite's real flow, confirmed
// against the official pykiteconnect library and several independent implementations, is TWO
// hops: /connect/login?api_key=.. -> 302 carrying sess_id -> /connect/finish?...&sess_id=.. ->
// 302 carrying request_token. v1 read request_token off that first Location, which never has it,
// so every login threw at this step. This follows the chain: at each hop, if the Location has
// request_token we are done; if it has only sess_id we hit /connect/finish; cookies are carried
// across every hop. A UA header is sent throughout -- kite.zerodha.com sits behind Cloudflare
// (it sets __cf_bm), which can 403 an agent with no User-Agent.
// ---------------------------------------------------------------------------------------------
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

async function kiteLogin(creds: { userId: string; password: string; totpSecret: string; apiKey: string; apiSecret: string }): Promise<string> {
  const cookies: Record<string, string> = {};

  const loginRes = await fetch(`${KITE_LOGIN_BASE}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": UA },
    body: new URLSearchParams({ user_id: creds.userId, password: creds.password }),
  });
  collectCookies(loginRes, cookies);
  const loginBody = await loginRes.json().catch(() => null);
  const requestId = loginBody?.data?.request_id;
  if (!requestId) throw new Error(`password step (status ${loginRes.status}): ${JSON.stringify(loginBody).slice(0, 200)}`);

  const code = await totp(creds.totpSecret);
  const twofaRes = await fetch(`${KITE_LOGIN_BASE}/api/twofa`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: cookieHeader(cookies), "User-Agent": UA },
    body: new URLSearchParams({ user_id: creds.userId, request_id: requestId, twofa_value: code, twofa_type: "totp" }),
  });
  collectCookies(twofaRes, cookies);
  const twofaBody = await twofaRes.json().catch(() => null);
  if (twofaBody?.status !== "success") throw new Error(`totp step (status ${twofaRes.status}): ${JSON.stringify(twofaBody).slice(0, 200)}`);

  // Follow the connect redirect chain until a Location carries request_token. Bounded so a
  // loop or an unexpected shape fails fast rather than hanging. Never log a full Location: after
  // the final hop it CONTAINS the request_token, which is a short-lived credential.
  let next = `${KITE_LOGIN_BASE}/connect/login?api_key=${encodeURIComponent(creds.apiKey)}&v=3`;
  let requestToken = "";
  let lastStatus = 0;
  for (let hop = 0; hop < 6 && !requestToken; hop++) {
    const res = await fetch(next, { redirect: "manual", headers: { Cookie: cookieHeader(cookies), "User-Agent": UA } });
    collectCookies(res, cookies);
    lastStatus = res.status;
    const location = res.headers.get("location") ?? "";
    if (!location) throw new Error(`connect chain hop ${hop}: no Location (status ${res.status})`);

    const rt = location.match(/request_token=([^&]+)/);
    if (rt) { requestToken = decodeURIComponent(rt[1]); break; }

    const sess = location.match(/sess_id=([^&]+)/);
    if (sess) {
      next = `${KITE_LOGIN_BASE}/connect/finish?api_key=${encodeURIComponent(creds.apiKey)}&sess_id=${encodeURIComponent(sess[1])}&v=3`;
      continue;
    }
    // A relative or absolute Location that is neither -- follow it as-is (resolved against Kite).
    next = location.startsWith("http") ? location : `${KITE_LOGIN_BASE}${location.startsWith("/") ? "" : "/"}${location}`;
  }
  if (!requestToken) throw new Error(`connect chain: no request_token after redirects (last status ${lastStatus})`);

  const checksum = await sha256Hex(creds.apiKey + requestToken + creds.apiSecret);
  const tokenRes = await fetch(`${KITE_API_BASE}/session/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "X-Kite-Version": "3", "User-Agent": UA },
    body: new URLSearchParams({ api_key: creds.apiKey, request_token: requestToken, checksum }),
  });
  const tokenBody = await tokenRes.json().catch(() => null);
  const accessToken = tokenBody?.data?.access_token;
  if (!accessToken) throw new Error(`token exchange (status ${tokenRes.status}): ${JSON.stringify(tokenBody).slice(0, 200)}`);
  return accessToken;
}

// One login per IST day, cached in a table rather than the vault: the vault is for long-lived
// static secrets, and re-writing a vault secret from an Edge Function on every cold day is a
// heavier operation than an upsert into a plain table this function already owns.
async function getAccessToken(admin: ReturnType<typeof createClient>, apiKey: string, apiSecret: string): Promise<string> {
  const today = todayIST();
  const { data: cached } = await admin.from("kite_session").select("access_token").eq("trade_date", today).maybeSingle();
  if (cached?.access_token) return cached.access_token as string;

  const [{ data: userId }, { data: password }, { data: totpSecret }] = await Promise.all([
    admin.rpc("get_vault_secret", { secret_name: SECRET_NAMES.userId }),
    admin.rpc("get_vault_secret", { secret_name: SECRET_NAMES.password }),
    admin.rpc("get_vault_secret", { secret_name: SECRET_NAMES.totpSecret }),
  ]);
  if (!userId || !password || !totpSecret) throw new Error("kite_user_id / kite_password / kite_totp_secret not in vault");

  const accessToken = await kiteLogin({ userId, password, totpSecret, apiKey, apiSecret });
  await admin.from("kite_session").upsert({ trade_date: today, access_token: accessToken, created_at: new Date().toISOString() });
  return accessToken;
}

// ---------------------------------------------------------------------------------------------
// Kite historical fetch.
// ---------------------------------------------------------------------------------------------
type FetchResult = { candles: Candle[] } | { sessionInvalid: true } | { error: string };

async function fetchCandles(instrument: "NIFTY" | "SENSEX", token: number, from: string, to: string, apiKey: string, accessToken: string): Promise<FetchResult> {
  const url = `${KITE_API_BASE}/instruments/historical/${token}/minute?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  let res: Response;
  try {
    res = await fetch(url, { headers: { "X-Kite-Version": "3", Authorization: `token ${apiKey}:${accessToken}` } });
  } catch (e) {
    return { error: `network: ${e}` };
  }

  if (res.status === 403) return { sessionInvalid: true };
  if (!res.ok) return { error: `kite ${res.status}: ${(await res.text()).slice(0, 200)}` };

  let body: { data?: { candles?: unknown[][] } };
  try { body = await res.json(); } catch (e) { return { error: `parse: ${e}` }; }

  const raw = body?.data?.candles ?? [];
  const candles: Candle[] = [];
  for (const c of raw) {
    const at = new Date(String(c[0]));
    if (Number.isNaN(at.getTime())) continue;
    const [open, high, low, close] = [Number(c[1]), Number(c[2]), Number(c[3]), Number(c[4])];
    if (![open, high, low, close].every(Number.isFinite)) continue;
    candles.push({ instrument, bucket: at.toISOString(), trade_date: todayIST(at), open, high, low, close });
  }
  return { candles };
}

// Only write what actually changed -- see v1 note: re-upserting a whole session's bars every
// minute would fire a Realtime event per row per minute at every open chart.
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
  // Default 30 (the user's requested history window); capped at 60, Kite's per-request limit for
  // minute candles.
  const days = Math.min(Math.max(Number(body.days ?? 30), 1), 60);

  if (mode === "session" && !withinSessionIST()) {
    return new Response(JSON.stringify({ ok: true, mode, skipped: "outside market hours" }), { status: 200 });
  }

  const [{ data: apiKey }, { data: apiSecret }] = await Promise.all([
    admin.rpc("get_vault_secret", { secret_name: SECRET_NAMES.apiKey }),
    admin.rpc("get_vault_secret", { secret_name: SECRET_NAMES.apiSecret }),
  ]);
  if (!apiKey || !apiSecret) {
    return new Response(JSON.stringify({ ok: false, mode, reason: "kite_credentials_missing", detail: "kite_api_key / kite_api_secret not in vault" }), { status: 200 });
  }

  let accessToken: string;
  try {
    accessToken = await getAccessToken(admin, apiKey, apiSecret);
  } catch (e) {
    const detail = String(e).slice(0, 400);
    // Same best-effort run-log as the success path, so a login failure is visible without reading
    // Edge Function logs. detail is a named step + HTTP status by construction (see kiteLogin) and
    // never contains a token or a redirect URL.
    try { await admin.from("candle_sync_runs").insert({ mode, ok: false, written: {}, skipped: [detail], reason: "kite_login_failed", range_from: null, range_to: null }); } catch { /* ignore */ }
    return new Response(JSON.stringify({ ok: false, mode, reason: "kite_login_failed", detail }), { status: 200 });
  }

  const today = todayIST();
  const nowIST = istParts(new Date());
  const from = mode === "backfill" ? kiteStamp(sessionsBackIST(days), "09:15:00") : kiteStamp(today, "09:15:00");
  const to = kiteStamp(today, `${nowIST.hour}:${nowIST.minute}:${nowIST.second}`);

  const written: Record<string, number> = {};
  const skipped: string[] = [];
  let sessionInvalid = false;

  for (const { instrument, token } of INSTRUMENTS) {
    let result = await fetchCandles(instrument, token, from, to, apiKey, accessToken);

    // A cached token from earlier today can go stale (Kite-side logout, expiry edge case).
    // One retry with a fresh login before giving up on this instrument.
    if ("sessionInvalid" in result) {
      try {
        accessToken = await kiteLogin({
          userId: (await admin.rpc("get_vault_secret", { secret_name: SECRET_NAMES.userId })).data,
          password: (await admin.rpc("get_vault_secret", { secret_name: SECRET_NAMES.password })).data,
          totpSecret: (await admin.rpc("get_vault_secret", { secret_name: SECRET_NAMES.totpSecret })).data,
          apiKey, apiSecret,
        });
        await admin.from("kite_session").upsert({ trade_date: today, access_token: accessToken, created_at: new Date().toISOString() });
        result = await fetchCandles(instrument, token, from, to, apiKey, accessToken);
      } catch (e) {
        sessionInvalid = true;
        skipped.push(`${instrument}: re-login failed: ${String(e).slice(0, 300)}`);
        continue;
      }
    }

    if ("sessionInvalid" in result) { sessionInvalid = true; skipped.push(`${instrument}: Kite session still invalid after re-login`); continue; }
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

    const { error: writeError } = await admin.from("index_candles").upsert(rows.map((r) => ({ ...r, updated_at: new Date().toISOString() })), { onConflict: "instrument,bucket" });
    if (writeError) { skipped.push(`${instrument}: upsert: ${writeError.message}`); continue; }
    written[instrument] = rows.length;
  }

  const payload = {
    ok: !sessionInvalid,
    mode,
    range: { from, to },
    written,
    ...(sessionInvalid ? { reason: "kite_session_invalid" } : {}),
    ...(skipped.length ? { skipped } : {}),
  };

  // Durable, inspectable run record. The caller (pg_net/cron) may time out before this returns,
  // and Edge Function logs are awkward to read, so every run leaves a row readable with the
  // publishable key. Deliberately sanitized: mode, counts, and skip REASONS only -- never the
  // access_token, cookies, raw Kite bodies, or any redirect URL (which can carry request_token).
  // skipped strings are login/fetch step names and HTTP statuses by construction, not secrets.
  try {
    await admin.from("candle_sync_runs").insert({
      mode,
      ok: payload.ok,
      written,
      skipped: skipped.length ? skipped : null,
      reason: sessionInvalid ? "kite_session_invalid" : null,
      range_from: from,
      range_to: to,
    });
  } catch { /* run-log is best-effort; never fail the sync because logging failed */ }

  return new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } });
});
