// global-context-sync
// v1: the quantitative half of the Global → India intelligence engine.
//
// Every run: pull the basket in ./intelligence/config.ts from Yahoo Finance's free chart
// endpoint, upsert each quote into market_snapshots (keyed on the exchange's own quote time, so a
// closed market adds no rows), read the India-side inputs the existing pipeline already stores,
// run the deterministic engine, and append one global_context row. No LLM here: numbers, bands,
// transmission and regime all come from engine.ts and are traceable to the inputs column.
//
// Nothing else in the pipeline is touched: never reads or writes agent_calls, trades, blog_posts;
// reads premarket_dashboard / postmarket_summary / gift_nifty_staging only.
//
// POST body: {} -- same x-cron-secret as the other cron'd functions. Safe to re-run any time.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { BASKET } from "./intelligence/config.ts";
import { computeContext, type IndiaInputs, type Quote } from "./intelligence/engine.ts";

const FETCH_TIMEOUT_MS = 12_000;
const UA = "Mozilla/5.0 (compatible; MarketCue/1.0; +https://marketcue.in)";

function todayIST(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

async function fetchQuote(symbol: string): Promise<Quote> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const meta = json?.chart?.result?.[0]?.meta;
    if (!meta || typeof meta.regularMarketPrice !== "number") throw new Error(json?.chart?.error?.description ?? "no meta");
    const last = meta.regularMarketPrice as number;
    let changePct: number | null = typeof meta.regularMarketChangePercent === "number" ? meta.regularMarketChangePercent : null;
    if (changePct == null && typeof meta.chartPreviousClose === "number" && meta.chartPreviousClose > 0) changePct = ((last - meta.chartPreviousClose) / meta.chartPreviousClose) * 100;
    const sourceTs = typeof meta.regularMarketTime === "number" ? new Date(meta.regularMarketTime * 1000).toISOString() : null;
    return { symbol, last, changePct: changePct == null ? null : +changePct.toFixed(3), sourceTs };
  } finally { clearTimeout(t); }
}

// advance_decline_ratio is stored as text by market-data-sync: either "1.42" or "1234:567".
function parseAdRatio(v: unknown): number | null {
  if (v == null) return null;
  const s = String(v).trim();
  const m = s.match(/^(\d+(?:\.\d+)?)\s*[:/]\s*(\d+(?:\.\d+)?)$/);
  if (m) { const d = Number(m[2]); return d > 0 ? Number(m[1]) / d : null; }
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

Deno.serve(async (req: Request) => {
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const cronSecret = req.headers.get("x-cron-secret");
  const { data: expectedSecret } = await admin.rpc("get_vault_secret", { secret_name: "edge_function_cron_secret" });
  if (!cronSecret || cronSecret !== expectedSecret) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });

  const now = new Date();
  const skipped: string[] = [];

  // 1. Quotes, each isolated.
  const settled = await Promise.all(BASKET.map(async (b) => {
    try { return await fetchQuote(b.symbol); } catch (e) { skipped.push(`${b.symbol}: ${e instanceof Error ? e.message : e}`); return null; }
  }));
  const quotes = settled.filter((q): q is Quote => q != null);

  if (quotes.length) {
    const rows = quotes.map((q) => {
      const b = BASKET.find((x) => x.symbol === q.symbol)!;
      return { asset: q.symbol, source_ts: q.sourceTs ?? now.toISOString(), label: b.label, cue_group: b.group, price: q.last, change_pct: q.changePct, source: "yahoo", ingested_at: now.toISOString() };
    });
    const { error } = await admin.from("market_snapshots").upsert(rows, { onConflict: "asset,source_ts" });
    if (error) skipped.push(`market_snapshots upsert: ${error.message}`);
  }

  // 2. India-side inputs from the existing pipeline. Today's row when it exists, else the most
  //    recent, and the engine is told how old that is.
  const today = todayIST();
  const pick = async (table: string, cols: string) => {
    const t = await admin.from(table).select(cols).eq("trade_date", today).maybeSingle();
    if (t.data) return t.data as Record<string, unknown>;
    const l = await admin.from(table).select(cols).order("trade_date", { ascending: false }).limit(1).maybeSingle();
    return (l.data as Record<string, unknown> | null) ?? null;
  };
  const pre = await pick("premarket_dashboard", "trade_date, updated_at, india_vix, india_vix_change_pct, gift_nifty_gap_pct, advance_decline_ratio, pcr_nifty");
  const post = await pick("postmarket_summary", "trade_date, updated_at, fii_net_cash_cr, dii_net_cash_cr, fii_dii_data_date");
  const num = (v: unknown) => (v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);
  const india: IndiaInputs = {
    asOf: (pre?.updated_at as string | undefined) ?? null,
    advanceDeclineRatio: parseAdRatio(pre?.advance_decline_ratio),
    indiaVix: num(pre?.india_vix),
    indiaVixChangePct: num(pre?.india_vix_change_pct),
    fiiNetCr: num(post?.fii_net_cash_cr),
    diiNetCr: num(post?.dii_net_cash_cr),
    giftGapPct: String(pre?.trade_date ?? "") === today ? num(pre?.gift_nifty_gap_pct) : null, // a stale GIFT gap is not today's open
    pcrNifty: num(pre?.pcr_nifty),
  };

  // 3. Engine.
  const ctx = computeContext(quotes, india, now);

  // 4. Persist.
  const { error: ctxErr } = await admin.from("global_context").insert({
    calculated_at: ctx.calculatedAt,
    data_as_of: ctx.dataAsOf,
    global_score: ctx.global.score, global_band: ctx.global.band,
    india_score: ctx.india.score, india_band: ctx.india.band,
    transmission_label: ctx.transmission.label, transmission_tone: ctx.transmission.tone,
    regime: ctx.regime,
    confidence: ctx.confidence.level, confidence_detail: ctx.confidence,
    global_drivers: ctx.global.drivers, india_drivers: ctx.india.drivers,
    channels: ctx.transmission.channels, counterforces: ctx.transmission.counterforces,
    what_is_driving: ctx.whatIsDriving, explanation: ctx.explanation,
    inputs: { quotes, india, premarket_trade_date: pre?.trade_date ?? null, postmarket_trade_date: post?.trade_date ?? null, skipped },
  });
  if (ctxErr) skipped.push(`global_context insert: ${ctxErr.message}`);

  return new Response(JSON.stringify({ ok: !ctxErr, quotes: quotes.length, global: ctx.global.band, india: ctx.india.band, transmission: ctx.transmission.label, regime: ctx.regime, confidence: ctx.confidence.level, skipped }), { status: 200, headers: { "Content-Type": "application/json" } });
});
