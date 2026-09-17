// global-context-sync
// v2: the quantitative half of the Global → India intelligence engine, now with history.
//
// Every run: pull the basket in ./intelligence/config.ts from Yahoo Finance's free chart
// endpoint (one call per symbol returns the live quote AND the last few daily bars), upsert the
// live quote into market_snapshots and the daily bars into market_daily, read the India-side
// inputs the existing pipeline already stores, run the deterministic engine plus the history
// analytics (momentum, realised vol, z-scores, measured Nifty-vs-US correlation), raise
// quantitative 'price_move' events for moves beyond the configured multiple of an instrument's
// own volatility, and append one global_context row. No LLM here.
//
// Self-healing backfill: an asset with fewer than HISTORY.minSessions stored days is fetched with
// the long range on that run, so the first run after deploy fills six months by itself.
//
// Nothing else in the pipeline is touched: reads premarket_dashboard / postmarket_summary only.
// POST body: {} or {"mode":"backfill"} -- same x-cron-secret as the other cron'd functions.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { BASKET, GLOBAL_COMPONENTS, HISTORY, MAX_ABS_CHANGE_PCT, NEWS } from "./intelligence/config.ts";
import { computeContext, type IndiaInputs, type Quote } from "./intelligence/engine.ts";
import { computeStats, detectMoves, measureTransmission, scoreNews, type DailyBar, type NewsEventLite } from "./intelligence/analytics.ts";
import { NARRATIVE_VERSION, writeNarrative, type Narrative, type TimeContext } from "./intelligence/narrative.ts";

// The narrative is re-written only when the picture it describes has changed, or after this long.
const NARRATIVE_MAX_AGE_MS = 90 * 60_000;

const FETCH_TIMEOUT_MS = 12_000;
const UA = "Mozilla/5.0 (compatible; MarketCue/1.0; +https://marketcue.in)";

function todayIST(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

type Fetched = { quote: Quote; bars: DailyBar[] };

async function fetchChart(symbol: string, range: string): Promise<Fetched> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d`, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const r = json?.chart?.result?.[0];
    const meta = r?.meta;
    if (!meta || typeof meta.regularMarketPrice !== "number") throw new Error(json?.chart?.error?.description ?? "no meta");
    const last = meta.regularMarketPrice as number;
    let changePct: number | null = typeof meta.regularMarketChangePercent === "number" ? meta.regularMarketChangePercent : null;
    if (changePct == null && typeof meta.previousClose === "number" && meta.previousClose > 0) changePct = ((last - meta.previousClose) / meta.previousClose) * 100;
    const sourceTs = typeof meta.regularMarketTime === "number" ? new Date(meta.regularMarketTime * 1000).toISOString() : null;
    const quote: Quote = { symbol, last, changePct: changePct == null ? null : +changePct.toFixed(3), sourceTs };

    // Daily bars: timestamp is the session open in the exchange's zone; the session date is
    // taken in that zone so a Tokyo bar and a New York bar both land on their own calendar day.
    const tz = typeof meta.exchangeTimezoneName === "string" ? meta.exchangeTimezoneName : "UTC";
    const dayOf = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
    const ts: number[] = r.timestamp ?? [];
    const closes: (number | null)[] = r.indicators?.quote?.[0]?.close ?? [];
    const bars: DailyBar[] = [];
    let prev: number | null = null;
    for (let i = 0; i < ts.length; i++) {
      const c = closes[i];
      if (c == null || !Number.isFinite(c)) continue;
      bars.push({ asset: symbol, day: dayOf.format(new Date(ts[i] * 1000)), close: c, changePct: prev && prev > 0 ? +(((c - prev) / prev) * 100).toFixed(3) : null });
      prev = c;
    }
    return { quote, bars };
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

  let body: { mode?: string } = {};
  try { body = await req.json(); } catch { /* no body */ }
  const forceBackfill = body.mode === "backfill";

  const now = new Date();
  const skipped: string[] = [];

  // 0. How much history each asset already has, to decide the fetch range per symbol.
  const { data: counts, error: countErr } = await admin.rpc("market_daily_counts");
  if (countErr) skipped.push(`market_daily_counts: ${countErr.message}`);
  const have = new Map<string, number>(((counts ?? []) as { asset: string; n: number }[]).map((c) => [c.asset, Number(c.n)]));

  // 1. Quotes + bars, each symbol isolated.
  const settled = await Promise.all(BASKET.map(async (b) => {
    const range = forceBackfill || (have.get(b.symbol) ?? 0) < HISTORY.minSessions ? HISTORY.backfillRange : "5d";
    try { return await fetchChart(b.symbol, range); } catch (e) { skipped.push(`${b.symbol}: ${e instanceof Error ? e.message : e}`); return null; }
  }));
  const fetched = settled.filter((f): f is Fetched => f != null);
  // Plausibility gate: a change beyond the group's bound is a feed glitch, not a move. Drop the
  // quote (and its bars) for this run so it reaches neither the score nor move detection.
  const sane: Fetched[] = [];
  for (const f of fetched) {
    const b = BASKET.find((x) => x.symbol === f.quote.symbol)!;
    const bound = MAX_ABS_CHANGE_PCT[b.group] ?? 12;
    if (f.quote.changePct != null && Math.abs(f.quote.changePct) > bound) { skipped.push(`${f.quote.symbol}: implausible change ${f.quote.changePct}% (bound ${bound}%), quote dropped as a bad tick`); continue; }
    sane.push(f);
  }
  const quotes = sane.map((f) => f.quote);

  if (quotes.length) {
    const rows = quotes.map((q) => {
      const b = BASKET.find((x) => x.symbol === q.symbol)!;
      return { asset: q.symbol, source_ts: q.sourceTs ?? now.toISOString(), label: b.label, cue_group: b.group, price: q.last, change_pct: q.changePct, source: "yahoo", ingested_at: now.toISOString() };
    });
    const { error } = await admin.from("market_snapshots").upsert(rows, { onConflict: "asset,source_ts" });
    if (error) skipped.push(`market_snapshots upsert: ${error.message}`);
  }
  const newBars = sane.flatMap((f) => f.bars);
  if (newBars.length) {
    const rows = newBars.map((b) => ({ asset: b.asset, day: b.day, close: b.close, change_pct: b.changePct, source: "yahoo", ingested_at: now.toISOString() }));
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await admin.from("market_daily").upsert(rows.slice(i, i + 500), { onConflict: "asset,day" });
      if (error) { skipped.push(`market_daily upsert: ${error.message}`); break; }
    }
  }

  // 2. History for analytics: the stored series, which now includes what was just written.
  //    PostgREST caps any single response at 1000 rows whatever `limit` asks for, so this pages
  //    in 1000-row chunks. The window is 45 calendar days: enough for the 20-session lookback
  //    on every exchange with holidays, and small enough that the read stays to a page or two.
  const since = new Date(now.getTime() - 45 * 86400_000).toISOString().slice(0, 10);
  const bars: DailyBar[] = [];
  for (let from = 0; ; from += 1000) {
    const { data: page, error: histErr } = await admin.from("market_daily").select("asset, day, close, change_pct").gte("day", since).order("day", { ascending: true }).order("asset", { ascending: true }).range(from, from + 999);
    if (histErr) { skipped.push(`market_daily read: ${histErr.message}`); break; }
    for (const h of page ?? []) bars.push({ asset: String(h.asset), day: String(h.day), close: Number(h.close), changePct: h.change_pct == null ? null : Number(h.change_pct) });
    if (!page || page.length < 1000) break;
  }

  // 3. India-side inputs from the existing pipeline. Today's row when it exists, else the most
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
  // The midday checkpoints refresh breadth and PCR through the session; the pre-market row is
  // frozen at 09:38. Take the newest checkpoint for today when there is one, so the India read
  // (and its as-of, which drives confidence) tracks the session rather than the open.
  const { data: midRows } = await admin.from("midmarket_snapshot").select("updated_at, advance_decline_ratio_mid, pcr_nifty_mid").eq("trade_date", today).order("updated_at", { ascending: false }).limit(1);
  const mid = (midRows?.[0] as Record<string, unknown> | undefined) ?? null;
  const num = (v: unknown) => (v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);
  const midAd = parseAdRatio(mid?.advance_decline_ratio_mid), midPcr = num(mid?.pcr_nifty_mid);
  const india: IndiaInputs = {
    asOf: (mid?.updated_at as string | undefined) ?? (pre?.updated_at as string | undefined) ?? null,
    advanceDeclineRatio: midAd ?? parseAdRatio(pre?.advance_decline_ratio),
    indiaVix: num(pre?.india_vix),
    indiaVixChangePct: num(pre?.india_vix_change_pct),
    fiiNetCr: num(post?.fii_net_cash_cr),
    diiNetCr: num(post?.dii_net_cash_cr),
    giftGapPct: String(pre?.trade_date ?? "") === today ? num(pre?.gift_nifty_gap_pct) : null, // a stale GIFT gap is not today's open
    pcrNifty: midPcr ?? num(pre?.pcr_nifty),
  };

  // 3b. Analysed news events (written by news-sync) become the News component on both sides.
  const { data: newsRows } = await admin.from("market_events").select("title, region, market_direction, global_relevance, india_relevance, confidence, event_time").eq("status", "active").not("cluster_key", "is", null).gte("event_time", new Date(now.getTime() - NEWS.lookbackHours * 3600_000).toISOString()).limit(60);
  const newsEvents: NewsEventLite[] = (newsRows ?? []).map((r) => ({ title: String(r.title), region: String(r.region), market_direction: String(r.market_direction), global_relevance: Number(r.global_relevance), india_relevance: Number(r.india_relevance), confidence: Number(r.confidence), event_time: String(r.event_time) }));
  const news = scoreNews(newsEvents, now, GLOBAL_COMPONENTS.news.scale);

  // 4. Analytics + engine.
  const liveChange = new Map(quotes.map((q) => [q.symbol, q.changePct]));
  const stats = computeStats(bars, liveChange);
  const measured = measureTransmission(bars);
  const moves = detectMoves(stats, liveChange, now);
  const ctx = computeContext(quotes, india, now, measured, news);

  // 5. Persist events (upsert on dedupe key so an evolving intraday move updates, not duplicates).
  if (moves.length) {
    const { error } = await admin.from("market_events").upsert(moves.map((m) => ({
      dedupe_key: m.dedupeKey, event_time: m.eventTime, updated_at: now.toISOString(), category: m.category, title: m.title, summary: m.summary,
      affected_assets: m.affectedAssets, market_direction: m.marketDirection, global_relevance: m.globalRelevance, india_relevance: m.indiaRelevance,
      confidence: m.confidence, india_impact: m.indiaImpact, why_it_matters: m.indiaImpact, sources: [{ type: "quant", source: "yahoo", detail: "MarketCue move detection" }], evidence: m.evidence, status: "active",
    })), { onConflict: "dedupe_key" });
    if (error) skipped.push(`market_events upsert: ${error.message}`);
  }

  // 5b. Narrative: four paragraphs from the model, explaining the numbers above and nothing else.
  //     Reused from the previous row while the verdicts, regime and event set are unchanged and
  //     the previous narrative is younger than NARRATIVE_MAX_AGE_MS; otherwise re-written.
  const narrativeKey = [`n${NARRATIVE_VERSION}`, ctx.global.band, ctx.india.band, ctx.transmission.label, ctx.regime, ...moves.map((m) => m.dedupeKey)].join("|");
  let narrative: Narrative | null = null;
  const { data: prevRow } = await admin.from("global_context").select("narrative, narrative_key").order("calculated_at", { ascending: false }).limit(1).maybeSingle();
  const prev = prevRow?.narrative as Narrative | null | undefined;
  if (prev && prevRow?.narrative_key === narrativeKey && Date.now() - Date.parse(prev.written_at) < NARRATIVE_MAX_AGE_MS) {
    narrative = prev;
  } else {
    const { data: anthropicKey } = await admin.rpc("get_vault_secret", { secret_name: "anthropic_api_key" });
    if (!anthropicKey) skipped.push("narrative: anthropic_api_key not in vault");
    else {
      // Time context: what "now" is in IST, whether the Indian session is open, and the previous
      // session's Nifty close from stored history, so "yesterday" can only mean that.
      const hmIST = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false }).format(now);
      const niftyDays = bars.filter((b) => b.asset === "^NSEI").sort((a, b) => b.day.localeCompare(a.day));
      const prevDay = niftyDays.find((b) => b.day < today) ?? null;
      const time: TimeContext = {
        now_ist: `${today} ${hmIST} IST`,
        india_session: hmIST < "09:15" ? "pre-open" : hmIST < "15:30" ? "open" : "closed",
        previous_session: prevDay ? { day: prevDay.day, nifty_change_pct: prevDay.changePct } : null,
      };
      try { narrative = await writeNarrative(String(anthropicKey), ctx, measured, moves, india.asOf, time); if (narrative.dropped.length) skipped.push(`narrative: dropped ${narrative.dropped.join(", ")} (cited a figure not in the input or wrong length)`); }
      catch (e) { skipped.push(`narrative: ${e instanceof Error ? e.message : e}`); narrative = prev ?? null; }
    }
  }

  // 6. Persist context.
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
    measured, asset_stats: stats,
    narrative, narrative_key: narrativeKey,
    inputs: { quotes, india, news_events: newsEvents.length, news, premarket_trade_date: pre?.trade_date ?? null, midmarket_updated_at: mid?.updated_at ?? null, postmarket_trade_date: post?.trade_date ?? null, history_days: bars.length, skipped },
  });
  if (ctxErr) skipped.push(`global_context insert: ${ctxErr.message}`);

  // 7. Public-page archive: freeze exactly one row per IST trading day, the first run after the
  //    Indian session has closed, for the public /global-cues-today/[date] pages. Never more than
  //    once a day -- a duplicate insert on trade_date is skipped, not overwritten, so the archived
  //    day reads whatever the session's first post-close narrative said.
  let archived = false;
  if (!narrative) {
    // no narrative this run (e.g. missing API key) -- nothing worth freezing as the day's page
  } else {
    const hmIST = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false }).format(now);
    if (hmIST >= "15:30") {
      const dateLabel = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", day: "numeric", month: "long", year: "numeric" }).format(now);
      const { data: already } = await admin.from("global_cues_daily").select("trade_date").eq("trade_date", today).maybeSingle();
      if (!already) {
        const slug = dateLabel.toLowerCase().replace(/\s+/g, "-");
        const { error: archErr } = await admin.from("global_cues_daily").insert({
          trade_date: today, slug, narrative, global_band: ctx.global.band, india_band: ctx.india.band,
          transmission_label: ctx.transmission.label, regime: ctx.regime, calculated_at: ctx.calculatedAt,
        });
        if (archErr) skipped.push(`global_cues_daily insert: ${archErr.message}`); else archived = true;
      }

      // 7b. Public changelog: one automated row per IST trading day, so /changelog's content
      //     changes every day even with no manual entry -- a plain freshness signal for crawlers.
      // Independent of the archive-dedupe above (its own unique index backstops a race), so a
      // day that already archived earlier still gets logged if this is the first run to try.
      const { data: alreadyLogged } = await admin.from("changelog_entries").select("id").eq("entry_date", today).eq("kind", "daily").maybeSingle();
      if (!alreadyLogged) {
        const { error: logErr } = await admin.from("changelog_entries").insert({
          entry_date: today, kind: "daily",
          title: `Global cues updated for ${dateLabel}`,
          body: `Global read: ${ctx.global.band.toLowerCase()}. India read: ${ctx.india.band.toLowerCase()}. ${ctx.transmission.label}. Regime: ${ctx.regime.toLowerCase()}.`,
        });
        if (logErr) skipped.push(`changelog_entries insert: ${logErr.message}`);
      }
    }
  }

  return new Response(JSON.stringify({ ok: !ctxErr, quotes: quotes.length, bars_written: newBars.length, history_rows: bars.length, events: moves.length, narrative: narrative ? (narrative === prev ? "reused" : "written") : "none", archived, global: ctx.global.band, india: ctx.india.band, transmission: ctx.transmission.label, measured: measured.label, regime: ctx.regime, confidence: ctx.confidence.level, skipped }), { status: 200, headers: { "Content-Type": "application/json" } });
});
