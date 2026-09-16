// news-sync: configuration. Feeds, the entity dictionary, clustering and analysis gates, and
// the model. Everything tunable is here; index.ts carries no numbers of its own.

export type Region = "global" | "india" | "official";
export type Feed = { source: string; url: string; region: Region; kind: "wire" | "official" };

// All verified to respond with fresh items on 2026-09-16. Moneycontrol's feeds stopped in 2024.
export const FEEDS: Feed[] = [
  // global wires
  { source: "CNBC", url: "https://www.cnbc.com/id/100727362/device/rss/rss.html", region: "global", kind: "wire" },
  { source: "MarketWatch", url: "https://feeds.marketwatch.com/marketwatch/topstories/", region: "global", kind: "wire" },
  { source: "Yahoo Finance", url: "https://finance.yahoo.com/news/rssindex", region: "global", kind: "wire" },
  // global official
  { source: "Federal Reserve", url: "https://www.federalreserve.gov/feeds/press_monetary.xml", region: "official", kind: "official" },
  { source: "EIA", url: "https://www.eia.gov/rss/todayinenergy.xml", region: "official", kind: "official" },
  // india desks
  { source: "Economic Times", url: "https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms", region: "india", kind: "wire" },
  { source: "ET Economy", url: "https://economictimes.indiatimes.com/news/economy/rssfeeds/1373380680.cms", region: "india", kind: "wire" },
  { source: "Livemint", url: "https://www.livemint.com/rss/markets", region: "india", kind: "wire" },
  { source: "NDTV Profit", url: "https://feeds.feedburner.com/ndtvprofit-latest", region: "india", kind: "wire" },
  // india official
  { source: "RBI", url: "https://www.rbi.org.in/pressreleases_rss.xml", region: "official", kind: "official" },
];

// Finnhub general market news is used when `finnhub_api_key` exists in the vault. Free tier.
export const FINNHUB = { url: "https://finnhub.io/api/v1/news?category=general", source: "Finnhub", region: "global" as Region, maxItems: 40 };

// Entity dictionary: a keyword (matched case-insensitively as a whole word or phrase) maps to
// the basket instruments it touches and a theme. `india` is how much the theme typically matters
// for Indian equities, used for the relevance score before any model call.
export type Entity = { key: string; label: string; patterns: string[]; assets: string[]; theme: string; india: number };
export const ENTITIES: Entity[] = [
  { key: "fed", label: "Federal Reserve", patterns: ["fed ", "federal reserve", "fomc", "powell", "rate cut", "rate hike", "fed funds"], assets: ["^TNX", "2YY=F", "DX-Y.NYB", "^GSPC"], theme: "rates", india: 0.8 },
  { key: "treasury", label: "US yields", patterns: ["treasury yield", "10-year", "10 year", "bond yield", "yields rise", "yields fall", "yields climb"], assets: ["^TNX", "2YY=F"], theme: "rates", india: 0.8 },
  { key: "inflation_us", label: "US inflation", patterns: ["cpi", "inflation", "pce", "consumer prices"], assets: ["^TNX", "DX-Y.NYB"], theme: "macro", india: 0.6 },
  { key: "jobs_us", label: "US jobs", patterns: ["payrolls", "jobs report", "unemployment", "jobless claims"], assets: ["^GSPC", "^TNX"], theme: "macro", india: 0.5 },
  { key: "dollar", label: "Dollar", patterns: ["dollar index", "dollar strength", "greenback", "dxy", "dollar rises", "dollar falls"], assets: ["DX-Y.NYB", "USDINR=X"], theme: "currency", india: 0.8 },
  { key: "oil", label: "Crude oil", patterns: ["crude", "brent", "wti", "oil price", "opec", "barrel"], assets: ["BZ=F", "CL=F", "USDINR=X"], theme: "commodities", india: 0.9 },
  { key: "gold", label: "Gold", patterns: ["gold price", "gold rises", "gold falls", "bullion"], assets: ["GC=F"], theme: "commodities", india: 0.4 },
  { key: "vix", label: "Volatility", patterns: ["vix", "volatility index", "fear gauge"], assets: ["^VIX"], theme: "volatility", india: 0.7 },
  { key: "wallst", label: "Wall Street", patterns: ["wall street", "s&p 500", "nasdaq", "dow jones", "us stocks", "stock futures"], assets: ["^GSPC", "^IXIC", "^DJI", "ES=F", "NQ=F"], theme: "equities", india: 0.7 },
  { key: "china", label: "China", patterns: ["china", "beijing", "pboc", "yuan", "hang seng", "shanghai"], assets: ["000001.SS", "^HSI"], theme: "asia", india: 0.5 },
  { key: "japan", label: "Japan", patterns: ["nikkei", "bank of japan", "boj", "yen"], assets: ["^N225"], theme: "asia", india: 0.4 },
  { key: "tariff", label: "Tariffs / trade", patterns: ["tariff", "trade war", "trade deal", "sanction", "export ban"], assets: ["^GSPC", "USDINR=X"], theme: "geopolitics", india: 0.8 },
  { key: "geopolitics", label: "Geopolitics", patterns: ["middle east", "iran", "israel", "russia", "ukraine", "missile", "ceasefire", "strait of hormuz", "red sea"], assets: ["BZ=F", "GC=F", "^VIX"], theme: "geopolitics", india: 0.8 },
  { key: "ecb", label: "ECB / Europe", patterns: ["ecb", "lagarde", "eurozone", "euro zone", "bank of england"], assets: ["^STOXX50E", "^FTSE", "^GDAXI"], theme: "rates", india: 0.4 },
  // india
  { key: "rbi", label: "RBI", patterns: ["rbi", "reserve bank of india", "repo rate", "monetary policy committee", "mpc"], assets: ["^NSEI", "^NSEBANK", "USDINR=X"], theme: "policy_india", india: 1.0 },
  { key: "rupee", label: "Rupee", patterns: ["rupee", "usd/inr", "inr"], assets: ["USDINR=X"], theme: "currency", india: 1.0 },
  { key: "fii", label: "Foreign flows", patterns: ["fii", "fpi", "foreign investors", "foreign portfolio", "foreign outflow", "foreign inflow"], assets: ["^NSEI"], theme: "flows", india: 1.0 },
  { key: "dii", label: "Domestic flows", patterns: ["dii", "domestic institutional", "mutual fund inflow", "sip inflow"], assets: ["^NSEI"], theme: "flows", india: 0.8 },
  { key: "nifty", label: "Nifty / Sensex", patterns: ["nifty", "sensex", "dalal street", "d-street", "indian equities", "indian stocks", "indian market"], assets: ["^NSEI", "^BSESN"], theme: "equities_india", india: 1.0 },
  { key: "banks_india", label: "Indian banks", patterns: ["bank nifty", "hdfc bank", "icici bank", "sbi", "axis bank", "kotak", "psu bank", "private bank"], assets: ["^NSEBANK"], theme: "sector_india", india: 0.9 },
  { key: "india_macro", label: "India macro", patterns: ["india cpi", "india inflation", "wpi", "iip", "gst collection", "gdp growth", "fiscal deficit", "current account"], assets: ["^NSEI", "USDINR=X"], theme: "macro_india", india: 0.9 },
  { key: "sebi", label: "SEBI / exchanges", patterns: ["sebi", "nse ", "bse ", "f&o", "futures and options", "expiry", "lot size", "margin rules"], assets: ["^NSEI"], theme: "policy_india", india: 0.8 },
  { key: "budget", label: "Government / budget", patterns: ["union budget", "finance ministry", "finance minister", "sitharaman", "pib", "cabinet approves", "disinvestment"], assets: ["^NSEI"], theme: "policy_india", india: 0.9 },
  { key: "it_sector", label: "IT sector", patterns: ["infosys", "tcs", "wipro", "hcl tech", "it stocks", "nifty it"], assets: ["^NSEI"], theme: "sector_india", india: 0.7 },
  { key: "earnings_india", label: "Earnings", patterns: ["q1 results", "q2 results", "q3 results", "q4 results", "quarterly results", "net profit", "earnings season"], assets: ["^NSEI"], theme: "earnings", india: 0.7 },
];

// Routine notices that carry an entity keyword but no market information. Relevance is forced to
// zero so they are stored for the record and never clustered or analysed.
export const NOISE: RegExp[] = [
  /variable rate (reverse )?repo|vrrr|auction under laf|treasury bill auction|tender/i,
  /enforcement action|approval of the application|announces termination|appointment of|appoints|resigns/i,
  /horoscope|astrology|photos:|in pics|watch:|podcast/i,
  /top gainers|top losers|stocks to watch|stocks in news|buy or sell|multibagger|penny stock|technical view/i,
];

// Clustering: articles inside the window whose title tokens overlap this much, or that share
// two entities and overlap at least the lower bar, are one candidate event.
export const CLUSTER = { windowHours: 8, jaccard: 0.35, jaccardWithSharedEntities: 0.18, minTokenLen: 4 };

// A cluster is sent to the model when any of these hold. Everything else waits (and is still
// visible on the Data & reference tab as a raw headline).
export const ANALYSE = {
  minRelevance: 0.5,            // best article relevance in the cluster
  minSources: 2,                // distinct outlets, OR
  officialCounts: true,         // an official source alone qualifies, OR
  linkedMoveCounts: true,       // an entity whose instrument has a price_move event in the window ...
  linkedMoveMinArticles: 2,     // ... but only for clusters with at least this many articles
  maxModelCallsPerRun: 3,
  moveLookbackHours: 36,
};

export const MODEL = { name: "claude-sonnet-4-5-20250929", timeoutMs: 30_000, maxTokens: 900 };

export const CATEGORIES = ["macro", "rates", "currency", "commodities", "geopolitics", "equities", "policy_india", "flows", "earnings", "sector", "other"] as const;
export const DIRECTIONS = ["risk_on", "risk_off", "neutral"] as const;

export const STOPWORDS = new Set(["the", "and", "for", "with", "that", "this", "from", "into", "after", "over", "amid", "says", "said", "will", "have", "has", "are", "was", "were", "been", "than", "more", "most", "some", "what", "when", "where", "which", "while", "about", "their", "there", "these", "those", "your", "just", "also", "here", "live", "updates", "today", "latest", "news", "stock", "stocks", "market", "markets", "share", "shares", "price", "prices", "week", "day", "year", "ahead", "could", "would", "should", "still", "back", "down", "high", "low"]);
