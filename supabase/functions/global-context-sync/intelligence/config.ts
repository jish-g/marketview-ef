// MarketCue intelligence engine: configuration.
//
// Everything tunable lives here: the instrument basket, per-component normalisation scales,
// component weights, band thresholds and regime rules. engine.ts contains no numbers of its own.
// Pure TypeScript with no runtime imports so the same file compiles under Deno (edge function)
// and Next.js (frontend labels).

export type CueGroup = "us_equity" | "us_futures" | "volatility" | "rates" | "dollar" | "crude" | "metals" | "asia" | "europe" | "china" | "india";

export type Instrument = { symbol: string; label: string; group: CueGroup; unit?: "pct" | "level" };

// Yahoo Finance chart-endpoint symbols. All verified to respond on the free endpoint 2026-09-16.
export const BASKET: Instrument[] = [
  { symbol: "^GSPC", label: "S&P 500", group: "us_equity" },
  { symbol: "^IXIC", label: "Nasdaq", group: "us_equity" },
  { symbol: "^DJI", label: "Dow Jones", group: "us_equity" },
  { symbol: "^RUT", label: "Russell 2000", group: "us_equity" },
  { symbol: "ES=F", label: "S&P 500 futures", group: "us_futures" },
  { symbol: "NQ=F", label: "Nasdaq futures", group: "us_futures" },
  { symbol: "^VIX", label: "VIX", group: "volatility", unit: "level" },
  { symbol: "^TNX", label: "US 10Y yield", group: "rates", unit: "level" },
  { symbol: "2YY=F", label: "US 2Y yield", group: "rates", unit: "level" },
  { symbol: "DX-Y.NYB", label: "Dollar index", group: "dollar" },
  { symbol: "BZ=F", label: "Brent crude", group: "crude" },
  { symbol: "CL=F", label: "WTI crude", group: "crude" },
  { symbol: "GC=F", label: "Gold", group: "metals" },
  { symbol: "HG=F", label: "Copper", group: "metals" },
  { symbol: "^N225", label: "Nikkei 225", group: "asia" },
  { symbol: "^HSI", label: "Hang Seng", group: "asia" },
  { symbol: "^KS11", label: "KOSPI", group: "asia" },
  { symbol: "000001.SS", label: "Shanghai Composite", group: "china" },
  { symbol: "^STOXX50E", label: "Euro Stoxx 50", group: "europe" },
  { symbol: "^FTSE", label: "FTSE 100", group: "europe" },
  { symbol: "^GDAXI", label: "DAX", group: "europe" },
  { symbol: "^NSEI", label: "Nifty 50", group: "india" },
  { symbol: "^BSESN", label: "Sensex", group: "india" },
  { symbol: "^NSEBANK", label: "Bank Nifty", group: "india" },
  { symbol: "USDINR=X", label: "USD/INR", group: "india" },
];

// A component score is change / scale, clamped to [-1, 1], with sign flipped where the raw
// move is *negative* for risk appetite (yields up, dollar up, crude up, VIX up, INR weaker).
// `scale` is the size of move (in the unit noted) that counts as a full ±1.
export const GLOBAL_COMPONENTS = {
  us_equities:  { weight: 0.20, scale: 1.2,  label: "US equities" },        // avg % change of cash indices
  us_futures:   { weight: 0.15, scale: 0.8,  label: "US futures" },         // overnight % move
  volatility:   { weight: 0.15, scale: 8,    label: "VIX" },                // % change in VIX, inverted; level adj below
  rates:        { weight: 0.12, scale: 10,   label: "US yields" },          // bps change in 10Y, inverted
  dollar:       { weight: 0.10, scale: 0.5,  label: "Dollar" },             // % change DXY, inverted
  crude:        { weight: 0.10, scale: 2.5,  label: "Crude" },              // avg % change, inverted (India imports)
  metals:       { weight: 0.03, scale: 2.0,  label: "Gold / copper" },      // copper minus gold: growth vs fear
  asia:         { weight: 0.08, scale: 1.2,  label: "Asia" },
  china:        { weight: 0.02, scale: 1.5,  label: "China" },
  europe:       { weight: 0.05, scale: 1.0,  label: "Europe" },
} as const;

// VIX level adjustment: a VIX at or above `high` pulls the volatility component down even when
// unchanged on the day; at or below `low` it adds support.
export const VIX_LEVEL = { low: 14, high: 22, weight: 0.5 };

export const INDIA_COMPONENTS = {
  nifty:        { weight: 0.20, scale: 1.2,  label: "Nifty 50" },
  sensex:       { weight: 0.05, scale: 1.2,  label: "Sensex" },
  bank_nifty:   { weight: 0.15, scale: 1.5,  label: "Bank Nifty" },
  breadth:      { weight: 0.15, scale: 2.5,  label: "Breadth" },            // ln(adv/dec) / ln(scale)
  india_vix:    { weight: 0.12, scale: 10,   label: "India VIX" },          // % change, inverted; level adj
  fii:          { weight: 0.10, scale: 3000, label: "FII flows" },          // net cash crore
  dii:          { weight: 0.05, scale: 3000, label: "DII flows" },
  inr:          { weight: 0.08, scale: 0.4,  label: "INR" },                // % change USDINR, inverted
  gift:         { weight: 0.05, scale: 0.8,  label: "GIFT Nifty" },         // gap % vs prior close
  options:      { weight: 0.05, scale: 0.4,  label: "Options positioning" }, // PCR - 1
} as const;

export const INDIA_VIX_LEVEL = { low: 12, high: 18, weight: 0.5 };

// Aggregate score in [-1, 1] mapped to a band. Checked top-down.
export const BANDS: { min: number; band: Band; tone: Tone }[] = [
  { min: 0.50, band: "Strongly Positive", tone: "up" },
  { min: 0.30, band: "Positive", tone: "up" },
  { min: 0.12, band: "Constructive", tone: "up" },
  { min: -0.12, band: "Neutral", tone: "neutral" },
  { min: -0.30, band: "Cautious", tone: "caution" },
  { min: -0.50, band: "Negative", tone: "down" },
  { min: -Infinity, band: "Strongly Negative", tone: "down" },
];
export type Band = "Strongly Positive" | "Positive" | "Constructive" | "Neutral" | "Cautious" | "Negative" | "Strongly Negative";
export type Tone = "up" | "neutral" | "caution" | "down";

// Below this magnitude a score is treated as "no clear direction".
export const QUIET = 0.12;

// Transmission: India's score relative to the global score when both point the same way.
export const TRANSMISSION = { strongRatio: 0.6, moderateRatio: 0.25 };

// Regime rules, evaluated in order on component scores (each in [-1, 1]).
export const REGIME_RULES: { regime: Regime; when: (c: Record<string, number | null>, raw: RawGlobal) => boolean }[] = [
  { regime: "Event-driven",     when: (_c, r) => (r.vixChangePct ?? 0) >= 15 || Math.abs(r.usEquityAvgPct ?? 0) >= 2 },
  { regime: "Risk-Off",         when: (c) => (c.us_equities ?? 0) <= -0.3 && (c.volatility ?? 0) <= -0.3 },
  { regime: "Inflationary",     when: (c) => (c.crude ?? 0) <= -0.3 && (c.rates ?? 0) <= -0.3 },
  { regime: "Defensive",        when: (c, ) => (c.metals ?? 0) <= -0.3 && (c.us_equities ?? 0) <= -0.2 },
  { regime: "Risk-On",          when: (c) => (c.us_equities ?? 0) >= 0.3 && (c.volatility ?? 0) >= 0.2 },
  { regime: "Liquidity-driven", when: (c) => (c.dollar ?? 0) >= 0.3 && (c.rates ?? 0) >= 0.3 && (c.us_equities ?? 0) >= 0 },
  { regime: "Mixed",            when: () => true },
];
export type Regime = "Risk-On" | "Risk-Off" | "Mixed" | "Defensive" | "Inflationary" | "Liquidity-driven" | "Event-driven";

export type RawGlobal = { vixChangePct: number | null; usEquityAvgPct: number | null };

// Confidence from data coverage and age.
export const CONFIDENCE = { highCoverage: 0.8, mediumCoverage: 0.6, highMaxAgeMin: 60, mediumMaxAgeMin: 180 };

// Cadence the sync is expected to run at; the frontend uses this to label a row as stale.
export const EXPECTED_REFRESH_MIN = 15;

// ------------------------------------------------------------------ history & analytics
// Daily history behind momentum, realised volatility, z-scores and measured transmission.
export const HISTORY = {
  backfillRange: "6mo",      // Yahoo range used when an asset has too little history on record
  minSessions: 30,           // below this many stored days an asset is backfilled on the next run
  lookbackDays: 20,          // window for realised vol, correlation, beta, relative performance
  shortDays: 5,              // short momentum window
  minPairs: 12,              // minimum aligned India/US pairs before a correlation is trusted
};

// A day's move is "significant" when |z| (today's % change over 20-day realised daily vol)
// crosses these. Events are only raised for significant moves.
export const MOVE_THRESHOLDS = { significant: 1.5, extreme: 2.5, minAbsPct: 0.5 };

// Measured transmission: 20-day correlation of Nifty's daily return with the prior US session.
export const CORRELATION = { strong: 0.5, moderate: 0.3 };

// How much a move in each group typically matters for India (0..1), and for the world.
export const RELEVANCE: Record<string, { india: number; global: number }> = {
  us_equity: { india: 0.7, global: 0.9 }, us_futures: { india: 0.7, global: 0.8 }, volatility: { india: 0.7, global: 0.9 },
  rates: { india: 0.8, global: 0.9 }, dollar: { india: 0.8, global: 0.8 }, crude: { india: 0.9, global: 0.7 },
  metals: { india: 0.3, global: 0.5 }, asia: { india: 0.5, global: 0.6 }, china: { india: 0.4, global: 0.6 },
  europe: { india: 0.4, global: 0.6 }, india: { india: 1.0, global: 0.3 },
};

// Hedged one-liners on why a move in this group matters for India. Templates, not claims.
export const INDIA_IMPACT: Record<string, { up: string; down: string }> = {
  crude:      { up: "Higher crude tends to widen India's import bill and pressure the rupee and rate-sensitive sectors.", down: "Softer crude is usually supportive for India's trade balance, inflation outlook and OMC margins." },
  rates:      { up: "Rising US yields tend to weigh on FII flows into Indian equities and on the rupee.", down: "Falling US yields usually ease pressure on FII flows and emerging-market currencies including the rupee." },
  dollar:     { up: "A stronger dollar is typically associated with rupee weakness and foreign outflows from India.", down: "A weaker dollar usually supports the rupee and risk appetite for emerging markets." },
  volatility: { up: "A jump in the VIX often precedes risk-off flows that reach India through FII selling.", down: "A falling VIX is consistent with improving global risk appetite, which tends to support Indian equities." },
  us_equity:  { up: "A strong US session tends to set a positive tone for GIFT Nifty and the Indian open.", down: "A weak US session often carries into a soft Indian open via GIFT Nifty and FII positioning." },
  us_futures: { up: "Firmer US futures usually lift GIFT Nifty ahead of the Indian open.", down: "Weaker US futures usually weigh on GIFT Nifty ahead of the Indian open." },
  asia:       { up: "Broad strength across Asian markets is consistent with regional risk appetite supporting India.", down: "Weakness across Asia points to regional risk-off pressure that India rarely escapes fully." },
  china:      { up: "A China rally can pull some emerging-market flows toward China and away from India.", down: "China weakness can redirect emerging-market allocations toward India, though it also dents regional sentiment." },
  europe:     { up: "European strength is mildly supportive for global risk appetite.", down: "European weakness adds to global caution but has limited direct transmission to India." },
  metals:     { up: "Gold strength often signals defensive positioning; copper strength points to growth optimism.", down: "Falling gold suggests less demand for safety; falling copper points to growth concerns." },
  india:      { up: "A direct move in Indian benchmarks.", down: "A direct move in Indian benchmarks." },
};
