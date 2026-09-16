// news-sync: the pure part of the pipeline. Parsing, tagging, clustering and output validation.
// No Deno or Supabase imports, so it runs under Node for tests as well as in the edge runtime.

import { CATEGORIES, CLUSTER, DIRECTIONS, ENTITIES, FINNHUB, NOISE, STOPWORDS, type Region } from "./config.ts";

const UA = "Mozilla/5.0 (compatible; MarketCue/1.0; +https://marketcue.in)";
const FETCH_TIMEOUT_MS = 12_000;

export type Article = { url: string; provider: string; source: string; region: Region; kind: "wire" | "official"; title: string; summary: string | null; published_at: string | null };
export type Tagged = Article & { entities: { key: string; label: string; assets: string[]; theme: string }[]; relevance: number; tokens: Set<string> };
export type Cluster = { key: string; articles: Tagged[]; entities: Map<string, { key: string; label: string; assets: string[]; theme: string }>; sources: Set<string>; official: boolean; relevance: number; region: Region };

// ------------------------------------------------------------------------------ ingest
export async function fetchText(url: string): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "*/*" }, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally { clearTimeout(t); }
}

function decode(s: string): string {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/\s+/g, " ").trim();
}
function tag(item: string, name: string): string | null {
  const m = item.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"));
  return m ? decode(m[1]) : null;
}

export function parseFeed(xml: string, f: { source: string; region: Region; kind: "wire" | "official" }): Article[] {
  const out: Article[] = [];
  const items = [...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi), ...xml.matchAll(/<entry(?:\s[^>]*)?>([\s\S]*?)<\/entry>/gi)];
  for (const m of items) {
    const it = m[1];
    const title = tag(it, "title");
    let link = tag(it, "link") || tag(it, "guid");
    if (!link) { const href = it.match(/<link[^>]*href="([^"]+)"/i); link = href ? href[1] : null; }
    if (!title || !link || !/^https?:\/\//i.test(link)) continue;
    const pub = tag(it, "pubDate") || tag(it, "dc:date") || tag(it, "published") || tag(it, "updated");
    const ts = pub ? Date.parse(pub) : NaN;
    const summary = tag(it, "description") || tag(it, "summary") || tag(it, "content");
    out.push({ url: link.split("?utm")[0].split("#")[0], provider: "rss", source: f.source, region: f.region, kind: f.kind, title, summary: summary ? summary.slice(0, 600) : null, published_at: Number.isFinite(ts) ? new Date(ts).toISOString() : null });
  }
  return out;
}

export async function fetchFinnhub(apiKey: string): Promise<Article[]> {
  const json = JSON.parse(await fetchText(`${FINNHUB.url}&token=${encodeURIComponent(apiKey)}`));
  if (!Array.isArray(json)) return [];
  return json.slice(0, FINNHUB.maxItems).filter((n) => n?.url && n?.headline).map((n) => ({
    url: String(n.url).split("?utm")[0], provider: "finnhub", source: String(n.source || FINNHUB.source), region: FINNHUB.region, kind: "wire" as const,
    title: String(n.headline), summary: n.summary ? String(n.summary).slice(0, 600) : null, published_at: typeof n.datetime === "number" ? new Date(n.datetime * 1000).toISOString() : null,
  }));
}

// --------------------------------------------------------------------------------- tag
export function tokens(title: string): Set<string> {
  return new Set(title.toLowerCase().replace(/[^a-z0-9\s&]/g, " ").split(/\s+/).filter((w) => w.length >= CLUSTER.minTokenLen && !STOPWORDS.has(w)));
}
export function tagArticle(a: Article): Tagged {
  const text = ` ${a.title} ${a.summary ?? ""} `.toLowerCase();
  const hits = NOISE.some((rx) => rx.test(a.title)) ? [] : ENTITIES.filter((e) => e.patterns.some((p) => text.includes(p.toLowerCase())));
  const relevance = hits.length ? Math.min(1, Math.max(...hits.map((h) => h.india)) * (a.kind === "official" ? 1 : 0.9) + Math.min(0.2, (hits.length - 1) * 0.05)) : 0;
  return { ...a, entities: hits.map((h) => ({ key: h.key, label: h.label, assets: h.assets, theme: h.theme })), relevance: +relevance.toFixed(2), tokens: tokens(a.title) };
}

// ----------------------------------------------------------------------------- cluster
const jaccard = (a: Set<string>, b: Set<string>) => { let i = 0; for (const x of a) if (b.has(x)) i++; const u = a.size + b.size - i; return u ? i / u : 0; };
async function hash(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].slice(0, 8).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function clusterArticles(arts: Tagged[]): Promise<Cluster[]> {
  const sorted = arts.filter((a) => a.entities.length > 0).sort((a, b) => (a.published_at ?? "").localeCompare(b.published_at ?? ""));
  const clusters: Cluster[] = [];
  for (const a of sorted) {
    const keys = new Set(a.entities.map((e) => e.key));
    let home: Cluster | null = null;
    for (const c of clusters) {
      const shared = [...keys].filter((k) => c.entities.has(k)).length;
      const best = Math.max(...c.articles.map((x) => jaccard(a.tokens, x.tokens)));
      if (best >= CLUSTER.jaccard || (shared >= 2 && best >= CLUSTER.jaccardWithSharedEntities)) { home = c; break; }
    }
    if (!home) home = { key: a.url.includes("cluster:") ? a.url : await hash(a.url), articles: [], entities: new Map(), sources: new Set(), official: false, relevance: 0, region: a.region === "official" ? "global" : a.region };
    if (!clusters.includes(home)) clusters.push(home);
    home.articles.push(a);
    for (const e of a.entities) home.entities.set(e.key, e);
    home.sources.add(a.source);
    home.official ||= a.kind === "official";
    home.relevance = Math.max(home.relevance, a.relevance);
    if (a.region === "india") home.region = "india";
  }
  return clusters;
}


export type Analysis = { event_title: string; category: string; market_direction: string; affected_assets: string[]; global_relevance: number; india_relevance: number; confidence: number; summary: string; why_it_matters: string; india_impact: string };

export function validate(o: Record<string, unknown>, allowedAssets: string[]): { ok: Analysis } | { reason: string } {
  const str = (k: string, max: number) => { const v = o[k]; if (typeof v !== "string" || !v.trim()) return null; const t = v.trim().replace(/\s+/g, " "); return t.split(" ").length <= max ? t : null; };
  const num = (k: string) => { const v = Number(o[k]); return Number.isFinite(v) && v >= 0 && v <= 1 ? +v.toFixed(2) : null; };
  const title = str("event_title", 16), summary = str("summary", 90), why = str("why_it_matters", 60), india = str("india_impact", 60);
  if (!title || !summary || !why || !india) return { reason: "missing or over-length text field" };
  if (!(CATEGORIES as readonly string[]).includes(String(o.category))) return { reason: `category ${o.category}` };
  if (!(DIRECTIONS as readonly string[]).includes(String(o.market_direction))) return { reason: `direction ${o.market_direction}` };
  const g = num("global_relevance"), i = num("india_relevance"), c = num("confidence");
  if (g == null || i == null || c == null) return { reason: "relevance/confidence out of range" };
  const assets = Array.isArray(o.affected_assets) ? o.affected_assets.map(String).filter((a) => allowedAssets.includes(a)) : [];
  return { ok: { event_title: title, category: String(o.category), market_direction: String(o.market_direction), affected_assets: [...new Set(assets)], global_relevance: g, india_relevance: i, confidence: c, summary, why_it_matters: why, india_impact: india } };
}

