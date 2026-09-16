// global-cues-fetch
// v1: the overnight basket and the morning headlines behind the GlobalCue/News screen.
//
// Free and keyless by design. Quotes come from Yahoo Finance's public chart endpoint (one call
// per symbol, no auth); headlines come from the public RSS feeds of three Indian market desks.
// Nothing else in the pipeline is touched: this function never reads or writes
// premarket_dashboard, midmarket_snapshot, agent_calls, trades or blog_posts.
//
// Both sources are unofficial or best-effort, so every fetch is isolated: one symbol or one
// feed failing is recorded in `skipped` and the rest still land. A symbol that fails is simply
// absent for that trade_date, and the screen says so in words rather than showing yesterday's
// number as today's.
//
// POST body: {} -- same x-cron-secret as market-data-sync. Safe to re-run: both writes upsert.

import { createClient } from "jsr:@supabase/supabase-js@2";

type CueGroup = "us" | "asia" | "commodity" | "fx" | "rates";

// Order here is the order on the screen.
const BASKET: { symbol: string; label: string; group: CueGroup }[] = [
  { symbol: "ES=F",     label: "S&P 500 futures",  group: "us" },
  { symbol: "NQ=F",     label: "Nasdaq futures",   group: "us" },
  { symbol: "^DJI",     label: "Dow Jones",        group: "us" },
  { symbol: "^N225",    label: "Nikkei 225",       group: "asia" },
  { symbol: "^HSI",     label: "Hang Seng",        group: "asia" },
  { symbol: "BZ=F",     label: "Brent crude",      group: "commodity" },
  { symbol: "DX-Y.NYB", label: "Dollar index",     group: "fx" },
  { symbol: "USDINR=X", label: "USD/INR",          group: "fx" },
  { symbol: "^TNX",     label: "US 10Y yield",     group: "rates" },
];

// Moneycontrol's feed stopped updating in 2024 and is deliberately not here.
const FEEDS: { source: string; url: string }[] = [
  { source: "Economic Times", url: "https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms" },
  { source: "Livemint",       url: "https://www.livemint.com/rss/markets" },
  { source: "NDTV Profit",    url: "https://feeds.feedburner.com/ndtvprofit-latest" },
];

const HEADLINES_PER_FEED = 6;
const HEADLINE_MAX_AGE_HOURS = 24;
const FETCH_TIMEOUT_MS = 12_000;
const UA = "Mozilla/5.0 (compatible; MarketCue/1.0; +https://marketcue.in)";

function todayIST(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

async function fetchText(url: string): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "*/*" }, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally { clearTimeout(t); }
}

// ------------------------------------------------------------------------------- quotes
async function fetchQuote(symbol: string): Promise<{ last: number; changePct: number | null; quoteTime: string | null }> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`;
  const json = JSON.parse(await fetchText(url));
  const meta = json?.chart?.result?.[0]?.meta;
  if (!meta || typeof meta.regularMarketPrice !== "number") throw new Error(json?.chart?.error?.description ?? "no meta in response");
  const last = meta.regularMarketPrice as number;
  let changePct: number | null = typeof meta.regularMarketChangePercent === "number" ? meta.regularMarketChangePercent : null;
  if (changePct == null && typeof meta.chartPreviousClose === "number" && meta.chartPreviousClose > 0) {
    changePct = ((last - meta.chartPreviousClose) / meta.chartPreviousClose) * 100;
  }
  const quoteTime = typeof meta.regularMarketTime === "number" ? new Date(meta.regularMarketTime * 1000).toISOString() : null;
  return { last, changePct: changePct == null ? null : +changePct.toFixed(3), quoteTime };
}

// ------------------------------------------------------------------------------- headlines
function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ").trim();
}

function tag(item: string, name: string): string | null {
  const m = item.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"));
  return m ? decodeEntities(m[1]) : null;
}

type Headline = { url: string; title: string; publishedAt: string | null };

function parseRss(xml: string): Headline[] {
  const out: Headline[] = [];
  for (const m of xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)) {
    const item = m[1];
    const title = tag(item, "title");
    // <link> is sometimes empty with the URL in <guid>; fall back rather than drop.
    const link = tag(item, "link") || tag(item, "guid");
    if (!title || !link || !/^https?:\/\//i.test(link)) continue;
    const pub = tag(item, "pubDate") || tag(item, "dc:date");
    const ts = pub ? Date.parse(pub) : NaN;
    out.push({ url: link.split("?utm")[0], title, publishedAt: Number.isFinite(ts) ? new Date(ts).toISOString() : null });
  }
  return out;
}

// --------------------------------------------------------------------------------- serve
Deno.serve(async (req: Request) => {
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const cronSecret = req.headers.get("x-cron-secret");
  const { data: expectedSecret } = await admin.rpc("get_vault_secret", { secret_name: "edge_function_cron_secret" });
  if (!cronSecret || cronSecret !== expectedSecret) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }

  const tradeDate = todayIST();
  const fetchedAt = new Date().toISOString();
  const skipped: string[] = [];

  // Quotes: all symbols in parallel, each isolated.
  const quoteResults = await Promise.all(BASKET.map(async (b, i) => {
    try {
      const q = await fetchQuote(b.symbol);
      return { trade_date: tradeDate, symbol: b.symbol, label: b.label, cue_group: b.group, sort_order: i, last: q.last, change_pct: q.changePct, quote_time: q.quoteTime, fetched_at: fetchedAt };
    } catch (e) { skipped.push(`${b.symbol}: ${e instanceof Error ? e.message : e}`); return null; }
  }));
  const cueRows = quoteResults.filter((r): r is NonNullable<typeof r> => r != null);
  if (cueRows.length) {
    const { error } = await admin.from("global_cues").upsert(cueRows, { onConflict: "trade_date,symbol" });
    if (error) skipped.push(`global_cues upsert: ${error.message}`);
  }

  // Headlines: per feed, newest first, capped, and no older than a day so a quiet feed does not
  // resurface last week's items as this morning's news.
  const cutoff = Date.now() - HEADLINE_MAX_AGE_HOURS * 3600 * 1000;
  const newsResults = await Promise.all(FEEDS.map(async (f) => {
    try {
      const items = parseRss(await fetchText(f.url))
        .filter((h) => h.publishedAt == null || Date.parse(h.publishedAt) >= cutoff)
        .sort((a, b) => (b.publishedAt ? Date.parse(b.publishedAt) : 0) - (a.publishedAt ? Date.parse(a.publishedAt) : 0))
        .slice(0, HEADLINES_PER_FEED);
      if (items.length === 0) skipped.push(`${f.source}: no items in the last ${HEADLINE_MAX_AGE_HOURS}h`);
      return items.map((h) => ({ url: h.url, trade_date: tradeDate, source: f.source, title: h.title, published_at: h.publishedAt, fetched_at: fetchedAt }));
    } catch (e) { skipped.push(`${f.source}: ${e instanceof Error ? e.message : e}`); return []; }
  }));
  const newsRows = newsResults.flat();
  if (newsRows.length) {
    // url is the primary key: a headline already stored keeps its original trade_date.
    const { error } = await admin.from("market_news").upsert(newsRows, { onConflict: "url", ignoreDuplicates: true });
    if (error) skipped.push(`market_news upsert: ${error.message}`);
  }

  return new Response(JSON.stringify({ ok: true, trade_date: tradeDate, cues: cueRows.length, headlines: newsRows.length, skipped }), {
    status: 200, headers: { "Content-Type": "application/json" },
  });
});
