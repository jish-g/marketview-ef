// news-sync
// v1: the news half of the Global → India intelligence engine.
//
// Every run (5 min by day, 30 min by night):
//   1. ingest    every feed in config.ts (plus Finnhub general news when a key is in the vault),
//                normalised into news_articles, keyed on URL so nothing is stored twice.
//   2. tag       each new article with the market entities it mentions (config ENTITIES) and a
//                relevance score; articles with no entity are kept but never analysed.
//   3. cluster   articles from the last CLUSTER.windowHours whose titles overlap, or that share
//                entities, into one candidate event with a stable cluster_key.
//   4. gate      a cluster earns analysis when it has an official source, or several outlets, or
//                an entity whose instrument already has a price_move event in the window.
//   5. analyse   one model call per qualifying new cluster, returning the event schema from the
//                product spec through a tool; validated (enums, ranges, asset whitelist, lengths)
//                before it is stored in market_events with its sources in event_sources.
//   6. link      the event to a confirming price_move event when an affected instrument moved.
//
// The model sees only the cluster's own headlines and summaries plus the linked move. It writes
// the explanation; it never decides that an event exists or which instruments it touches beyond
// the whitelist it is handed. Same x-cron-secret as the other functions.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { ANALYSE, CATEGORIES, CLUSTER, DIRECTIONS, FEEDS, MODEL, type Region } from "./config.ts";
import { clusterArticles, fetchFinnhub, fetchText, parseFeed, tagArticle, tokens, validate, type Analysis, type Cluster, type Tagged } from "./pipeline.ts";

// ------------------------------------------------------------------------------ analyse
const SYSTEM = `You are MarketCue's event analyst. You receive ONE clustered news event: its headlines and summaries from one or more outlets, the market entities it was tagged with, and, when present, a confirming price move the quantitative engine already detected.

Return the event record. Rules, all hard:
- Describe only what the headlines say. Do not add facts, numbers, names or outcomes that are not in them. If the headlines conflict or are thin, say so in the summary and lower confidence.
- Hedged language for consequences: "tends to", "consistent with", "likely", "appears to". Never assert causation.
- india_impact explains the plausible route into Indian equities, the rupee or flows, in one or two sentences, or says "No clear route into Indian markets from this event" when there is none.
- affected_assets may only contain symbols from the allowed list you are given.
- No advice, no price targets, no adjectives like "massive" or "crash". Plain prose, no markdown.`;

const SCHEMA = {
  type: "object",
  properties: {
    event_title: { type: "string", description: "<= 12 words, what happened" },
    category: { type: "string", enum: [...CATEGORIES] },
    market_direction: { type: "string", enum: [...DIRECTIONS], description: "for global risk appetite" },
    affected_assets: { type: "array", items: { type: "string" } },
    global_relevance: { type: "number" }, india_relevance: { type: "number" }, confidence: { type: "number" },
    summary: { type: "string", description: "2-3 sentences, what happened" },
    why_it_matters: { type: "string", description: "1-2 sentences" },
    india_impact: { type: "string", description: "1-2 sentences" },
  },
  required: ["event_title", "category", "market_direction", "affected_assets", "global_relevance", "india_relevance", "confidence", "summary", "why_it_matters", "india_impact"],
};

async function analyse(apiKey: string, c: Cluster, linkedMove: { title: string; summary: string } | null): Promise<{ ok: Analysis } | { reason: string }> {
  const allowedAssets = [...new Set([...c.entities.values()].flatMap((e) => e.assets))];
  const input = {
    region: c.region,
    entities: [...c.entities.values()].map((e) => ({ label: e.label, theme: e.theme })),
    allowed_assets: allowedAssets,
    headlines: c.articles.slice(0, 8).map((a) => ({ source: a.source, official: a.kind === "official", published_at: a.published_at, title: a.title, summary: a.summary })),
    confirming_price_move: linkedMove,
  };
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    signal: AbortSignal.timeout(MODEL.timeoutMs),
    body: JSON.stringify({
      model: MODEL.name, max_tokens: MODEL.maxTokens, temperature: 0.2, system: SYSTEM,
      tools: [{ name: "record_event", description: "Record the analysed event.", input_schema: SCHEMA }],
      tool_choice: { type: "tool", name: "record_event" },
      messages: [{ role: "user", content: `Clustered event (JSON):\n${JSON.stringify(input)}` }],
    }),
  });
  if (!res.ok) return { reason: `Anthropic ${res.status} ${(await res.text()).slice(0, 160)}` };
  const json = await res.json();
  const block = (json.content ?? []).find((b: { type: string }) => b.type === "tool_use") as { input?: Record<string, unknown> } | undefined;
  if (!block?.input) return { reason: "no tool_use block" };
  return validate(block.input, allowedAssets);
}

// --------------------------------------------------------------------------------- serve
Deno.serve(async (req: Request) => {
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const cronSecret = req.headers.get("x-cron-secret");
  const { data: expectedSecret } = await admin.rpc("get_vault_secret", { secret_name: "edge_function_cron_secret" });
  if (!cronSecret || cronSecret !== expectedSecret) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });

  const now = new Date();
  const skipped: string[] = [];
  const stats = { fetched: 0, stored: 0, tagged: 0, clusters: 0, analysed: 0, rejected: 0, linked: 0 };

  // 1. Ingest, each feed isolated.
  const batches = await Promise.all(FEEDS.map(async (f) => { try { return parseFeed(await fetchText(f.url), f); } catch (e) { skipped.push(`${f.source}: ${e instanceof Error ? e.message : e}`); return []; } }));
  const { data: finnhubKey } = await admin.rpc("get_vault_secret", { secret_name: "finnhub_api_key" });
  if (finnhubKey) { try { batches.push(await fetchFinnhub(String(finnhubKey))); } catch (e) { skipped.push(`Finnhub: ${e instanceof Error ? e.message : e}`); } }
  const seen = new Set<string>();
  const fresh = batches.flat().filter((a) => { if (seen.has(a.url)) return false; seen.add(a.url); return true; });
  stats.fetched = fresh.length;

  // Only articles not already stored get tagged and written.
  const { data: existing } = await admin.from("news_articles").select("url").in("url", fresh.map((a) => a.url).slice(0, 500));
  const known = new Set((existing ?? []).map((r) => String(r.url)));
  const newOnes = fresh.filter((a) => !known.has(a.url)).map(tagArticle);
  stats.tagged = newOnes.filter((a) => a.entities.length > 0).length;
  if (newOnes.length) {
    const rows = newOnes.map((a) => ({ url: a.url, provider: a.provider, source: a.source, region: a.region, kind: a.kind, title: a.title, summary: a.summary, published_at: a.published_at, fetched_at: now.toISOString(), entities: a.entities, relevance: a.relevance }));
    const { error } = await admin.from("news_articles").upsert(rows, { onConflict: "url", ignoreDuplicates: true });
    if (error) skipped.push(`news_articles upsert: ${error.message}`); else stats.stored = rows.length;
  }

  // 2. Cluster the window: everything tagged in the last CLUSTER.windowHours, stored or new.
  const since = new Date(now.getTime() - CLUSTER.windowHours * 3600_000).toISOString();
  // Window on publication time, not fetch time: the first run of a feed ingests its whole
  // backlog, and month-old FOMC statements must not cluster with today's.
  const { data: windowRows } = await admin.from("news_articles").select("url, provider, source, region, kind, title, summary, published_at, entities, relevance, cluster_key, analysed").gte("published_at", since).gt("relevance", 0).order("published_at", { ascending: true }).limit(400);
  const windowArts: (Tagged & { cluster_key?: string | null; analysed?: boolean })[] = (windowRows ?? []).map((r) => ({
    url: String(r.url), provider: String(r.provider), source: String(r.source), region: r.region as Region, kind: r.kind as "wire" | "official", title: String(r.title), summary: r.summary == null ? null : String(r.summary), published_at: r.published_at == null ? null : String(r.published_at),
    entities: (r.entities ?? []) as Tagged["entities"], relevance: Number(r.relevance), tokens: tokens(String(r.title)), cluster_key: r.cluster_key as string | null, analysed: Boolean(r.analysed),
  }));
  const clusters = await clusterArticles(windowArts);
  stats.clusters = clusters.length;

  // Existing cluster keys win, so a cluster keeps its identity as new articles join it.
  for (const c of clusters) {
    const prior = c.articles.map((a) => (a as { cluster_key?: string | null }).cluster_key).find((k) => k);
    if (prior) c.key = prior;
  }
  const keyUpdates = clusters.flatMap((c) => c.articles.filter((a) => (a as { cluster_key?: string | null }).cluster_key !== c.key).map((a) => ({ url: a.url, cluster_key: c.key })));
  for (const u of keyUpdates) await admin.from("news_articles").update({ cluster_key: u.cluster_key }).eq("url", u.url);

  // 3. Gate + analyse. A cluster already turned into an event is skipped unless it gained an
  //    official source or doubled its outlets since (re-analysis is cheap insurance, capped).
  const { data: moveRows } = await admin.from("market_events").select("dedupe_key, title, summary, affected_assets, event_time").eq("category", "price_move").gte("event_time", new Date(now.getTime() - ANALYSE.moveLookbackHours * 3600_000).toISOString());
  const moves = (moveRows ?? []) as { dedupe_key: string; title: string; summary: string; affected_assets: string[] }[];
  const { data: eventRows } = await admin.from("market_events").select("id, cluster_key, sources").not("cluster_key", "is", null).gte("event_time", since);
  const eventByCluster = new Map((eventRows ?? []).map((e) => [String(e.cluster_key), { id: Number(e.id), nSources: Array.isArray(e.sources) ? e.sources.length : 0 }]));

  const { data: anthropicKey } = await admin.rpc("get_vault_secret", { secret_name: "anthropic_api_key" });
  let calls = 0;
  const candidates = clusters
    .filter((c) => c.relevance >= ANALYSE.minRelevance)
    .map((c) => {
      const assets = new Set([...c.entities.values()].flatMap((e) => e.assets));
      const linked = moves.find((m) => (m.affected_assets ?? []).some((a) => assets.has(a))) ?? null;
      const qualifies = (ANALYSE.officialCounts && c.official) || c.sources.size >= ANALYSE.minSources || (ANALYSE.linkedMoveCounts && linked != null);
      const prev = eventByCluster.get(c.key);
      const changed = prev ? c.articles.length >= prev.nSources * 2 : true;
      return { c, linked, qualifies, prev, changed };
    })
    .filter((x) => x.qualifies && x.changed)
    .sort((a, b) => b.c.relevance - a.c.relevance || b.c.sources.size - a.c.sources.size);

  for (const { c, linked, prev } of candidates) {
    if (calls >= ANALYSE.maxModelCallsPerRun) break;
    if (!anthropicKey) { skipped.push("anthropic_api_key not in vault"); break; }
    calls++;
    const result = await analyse(String(anthropicKey), c, linked ? { title: linked.title, summary: linked.summary } : null);
    if ("reason" in result) { stats.rejected++; skipped.push(`cluster ${c.key}: ${result.reason}`); continue; }
    const a = result.ok;
    const sources = c.articles.slice(0, 10).map((x) => ({ type: x.kind, source: x.source, url: x.url, published_at: x.published_at }));
    const row = {
      dedupe_key: `news:${c.key}`, cluster_key: c.key, region: c.region,
      event_time: c.articles[c.articles.length - 1].published_at ?? now.toISOString(), updated_at: now.toISOString(),
      category: a.category, title: a.event_title, summary: a.summary, affected_assets: a.affected_assets, market_direction: a.market_direction,
      global_relevance: a.global_relevance, india_relevance: a.india_relevance, confidence: linked ? Math.min(1, a.confidence + 0.1) : a.confidence,
      india_impact: a.india_impact, why_it_matters: a.why_it_matters, sources, linked_move: linked?.dedupe_key ?? null,
      evidence: { entities: [...c.entities.keys()], outlets: c.sources.size, official: c.official, model: MODEL.name, linked_move: linked?.dedupe_key ?? null, prior_event: prev?.id ?? null },
      status: "active",
    };
    const { data: ev, error } = await admin.from("market_events").upsert(row, { onConflict: "dedupe_key" }).select("id").maybeSingle();
    if (error) { skipped.push(`market_events upsert ${c.key}: ${error.message}`); continue; }
    stats.analysed++;
    if (linked) stats.linked++;
    if (ev?.id) {
      await admin.from("event_sources").upsert(c.articles.map((x) => ({ event_id: ev.id, url: x.url })), { onConflict: "event_id,url", ignoreDuplicates: true });
      await admin.from("news_articles").update({ analysed: true }).in("url", c.articles.map((x) => x.url));
    }
  }

  // 4. Age out: news events older than the window are superseded so the screen stays current.
  await admin.from("market_events").update({ status: "superseded" }).eq("status", "active").not("cluster_key", "is", null).lt("event_time", new Date(now.getTime() - 36 * 3600_000).toISOString());

  return new Response(JSON.stringify({ ok: true, ...stats, model_calls: calls, skipped }), { status: 200, headers: { "Content-Type": "application/json" } });
});
