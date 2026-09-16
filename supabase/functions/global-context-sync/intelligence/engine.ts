// MarketCue intelligence engine: deterministic scoring.
//
// Input: the latest quote per basket instrument plus the India-side readings the existing
// pipeline already stores. Output: global score/band, India score/band, transmission, regime,
// ranked drivers with a one-line reading each, an explanation in hedged language, and a
// confidence derived from data coverage and age. No LLM anywhere in this file; every number in
// the output can be traced to an input and a line in config.ts.

import {
  BANDS, BASKET, CONFIDENCE, GLOBAL_COMPONENTS, INDIA_COMPONENTS, INDIA_VIX_LEVEL, QUIET,
  REGIME_RULES, TRANSMISSION, VIX_LEVEL,
  type Band, type Regime, type Tone,
} from "./config.ts";
import type { Measured } from "./analytics.ts";

export type Quote = { symbol: string; last: number; changePct: number | null; sourceTs: string | null };

export type IndiaInputs = {
  asOf: string | null;                // ISO of the most recent India-side row used
  advanceDeclineRatio: number | null; // advances / declines
  indiaVix: number | null;
  indiaVixChangePct: number | null;
  fiiNetCr: number | null;
  diiNetCr: number | null;
  giftGapPct: number | null;
  pcrNifty: number | null;
};

export type Driver = { key: string; label: string; score: number; weight: number; reading: string; tone: Tone };

export type Transmission = {
  label: "Strong global influence" | "Moderate global influence" | "Limited global influence" | "India diverging from global markets" | "India moving in line with global markets";
  tone: Tone;
  channels: string[];      // evidence that transmission is active
  counterforces: string[]; // India-specific factors pushing the other way
  measured: string | null; // one-line reading of the 20-day correlation, when history allows
};

export type ContextResult = {
  calculatedAt: string;
  global: { score: number; band: Band; tone: Tone; drivers: Driver[]; components: Record<string, number | null> };
  india: { score: number; band: Band; tone: Tone; drivers: Driver[]; components: Record<string, number | null> };
  transmission: Transmission;
  regime: Regime;
  explanation: string;
  whatIsDriving: string[];
  confidence: { level: "High" | "Medium" | "Low"; coverage: number; oldestInputMin: number | null; note: string };
  dataAsOf: string | null;
};

const clamp = (n: number, lo = -1, hi = 1) => Math.max(lo, Math.min(hi, n));
const avg = (xs: (number | null | undefined)[]): number | null => {
  const v = xs.filter((x): x is number => typeof x === "number" && Number.isFinite(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};
const sign = (n: number) => (n > 0 ? "+" : "");
const pct = (n: number, d = 2) => `${sign(n)}${n.toFixed(d)}%`;

function bandFor(score: number): { band: Band; tone: Tone } {
  const b = BANDS.find((x) => score >= x.min) ?? BANDS[BANDS.length - 1];
  return { band: b.band, tone: b.tone };
}

function toneFor(score: number): Tone {
  if (score >= QUIET) return "up";
  if (score <= -QUIET) return score <= -0.3 ? "down" : "caution";
  return "neutral";
}

// Weighted mean over components that have data; weights renormalised so a missing feed
// neither drags the score toward zero nor inflates the rest.
function aggregate(components: Record<string, number | null>, weights: Record<string, { weight: number }>): number {
  let num = 0, den = 0;
  for (const [k, s] of Object.entries(components)) {
    if (s == null) continue;
    const w = weights[k]?.weight ?? 0;
    num += w * s; den += w;
  }
  return den > 0 ? clamp(num / den) : 0;
}

function quoteMap(quotes: Quote[]): Map<string, Quote> {
  return new Map(quotes.map((q) => [q.symbol, q]));
}

function groupChange(q: Map<string, Quote>, group: string): number | null {
  return avg(BASKET.filter((b) => b.group === group).map((b) => q.get(b.symbol)?.changePct));
}

// ------------------------------------------------------------------------------ global
export function scoreGlobal(quotes: Quote[]): { score: number; band: Band; tone: Tone; drivers: Driver[]; components: Record<string, number | null>; raw: { vixChangePct: number | null; usEquityAvgPct: number | null } } {
  const q = quoteMap(quotes);
  const C = GLOBAL_COMPONENTS;
  const comp: Record<string, number | null> = {};
  const readings: Record<string, string> = {};

  const usEq = groupChange(q, "us_equity");
  comp.us_equities = usEq == null ? null : clamp(usEq / C.us_equities.scale);
  if (usEq != null) readings.us_equities = `US cash indices averaged ${pct(usEq)} last session`;

  const fut = groupChange(q, "us_futures");
  comp.us_futures = fut == null ? null : clamp(fut / C.us_futures.scale);
  if (fut != null) readings.us_futures = `US futures ${fut >= 0 ? "up" : "down"} ${pct(fut)} overnight`;

  const vix = q.get("^VIX");
  if (vix) {
    const chg = vix.changePct == null ? 0 : clamp(-vix.changePct / C.volatility.scale);
    const lvl = vix.last >= VIX_LEVEL.high ? -1 : vix.last <= VIX_LEVEL.low ? 1 : 0;
    comp.volatility = clamp(chg * (1 - VIX_LEVEL.weight) + lvl * VIX_LEVEL.weight);
    readings.volatility = `VIX at ${vix.last.toFixed(1)} (${pct(vix.changePct ?? 0, 1)}), ${vix.last >= VIX_LEVEL.high ? "elevated" : vix.last <= VIX_LEVEL.low ? "subdued" : "mid-range"}`;
  } else comp.volatility = null;

  const tnx = q.get("^TNX");
  if (tnx && tnx.changePct != null) {
    // ^TNX quotes the yield in %, so a 0.7% change on 5.00 is 3.5 bps.
    const prev = tnx.last / (1 + tnx.changePct / 100);
    const bps = (tnx.last - prev) * 100;
    comp.rates = clamp(-bps / C.rates.scale);
    readings.rates = `US 10Y ${bps >= 0 ? "up" : "down"} ${Math.abs(bps).toFixed(1)} bps to ${tnx.last.toFixed(2)}%`;
  } else comp.rates = null;

  const dxy = q.get("DX-Y.NYB");
  comp.dollar = dxy?.changePct == null ? null : clamp(-dxy.changePct / C.dollar.scale);
  if (dxy?.changePct != null) readings.dollar = `Dollar index ${dxy.changePct >= 0 ? "stronger" : "weaker"} ${pct(dxy.changePct)} at ${dxy.last.toFixed(2)}`;

  const crude = groupChange(q, "crude");
  comp.crude = crude == null ? null : clamp(-crude / C.crude.scale);
  if (crude != null) readings.crude = `Crude ${crude >= 0 ? "rising" : "falling"} ${pct(crude)} (Brent ${q.get("BZ=F")?.last.toFixed(2) ?? "n/a"})`;

  const gold = q.get("GC=F")?.changePct, copper = q.get("HG=F")?.changePct;
  if (gold != null || copper != null) {
    comp.metals = clamp(((copper ?? 0) - (gold ?? 0)) / C.metals.scale);
    readings.metals = `Gold ${pct(gold ?? 0)}, copper ${pct(copper ?? 0)}`;
  } else comp.metals = null;

  for (const g of ["asia", "china", "europe"] as const) {
    const v = groupChange(q, g);
    comp[g] = v == null ? null : clamp(v / C[g].scale);
    if (v != null) readings[g] = `${C[g].label} averaged ${pct(v)}`;
  }

  const score = aggregate(comp, C);
  const drivers = buildDrivers(comp, C, readings);
  return { score, ...bandFor(score), drivers, components: comp, raw: { vixChangePct: vix?.changePct ?? null, usEquityAvgPct: usEq } };
}

// ------------------------------------------------------------------------------- india
const IST_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" });

export function scoreIndia(quotes: Quote[], india: IndiaInputs, now = new Date()): { score: number; band: Band; tone: Tone; drivers: Driver[]; components: Record<string, number | null> } {
  const q = quoteMap(quotes);
  const C = INDIA_COMPONENTS;
  const comp: Record<string, number | null> = {};
  const readings: Record<string, string> = {};
  const todayIST = IST_DAY.format(now);

  // An Indian index quote stamped before today's session is yesterday's close change: say so,
  // rather than presenting it as today's move next to a live Nifty.
  const idx = (sym: string, key: keyof typeof C, label: string) => {
    const v = q.get(sym);
    comp[key] = v?.changePct == null ? null : clamp(v.changePct / C[key].scale);
    if (v?.changePct != null) {
      const stale = v.sourceTs != null && IST_DAY.format(new Date(v.sourceTs)) !== todayIST;
      readings[key] = `${label} ${pct(v.changePct)} at ${v.last.toFixed(0)}${stale ? " (last session)" : ""}`;
    }
  };
  idx("^NSEI", "nifty", "Nifty 50");
  idx("^BSESN", "sensex", "Sensex");
  idx("^NSEBANK", "bank_nifty", "Bank Nifty");

  if (india.advanceDeclineRatio != null && india.advanceDeclineRatio > 0) {
    comp.breadth = clamp(Math.log(india.advanceDeclineRatio) / Math.log(C.breadth.scale));
    readings.breadth = `Advance/decline ${india.advanceDeclineRatio.toFixed(2)}, ${india.advanceDeclineRatio >= 1.3 ? "broad participation" : india.advanceDeclineRatio <= 0.77 ? "narrow, sellers dominate" : "balanced"}`;
  } else comp.breadth = null;

  if (india.indiaVix != null) {
    const chg = india.indiaVixChangePct == null ? 0 : clamp(-india.indiaVixChangePct / C.india_vix.scale);
    const lvl = india.indiaVix >= INDIA_VIX_LEVEL.high ? -1 : india.indiaVix <= INDIA_VIX_LEVEL.low ? 1 : 0;
    comp.india_vix = clamp(chg * (1 - INDIA_VIX_LEVEL.weight) + lvl * INDIA_VIX_LEVEL.weight);
    readings.india_vix = `India VIX ${india.indiaVix.toFixed(2)} (${pct(india.indiaVixChangePct ?? 0, 1)})`;
  } else comp.india_vix = null;

  comp.fii = india.fiiNetCr == null ? null : clamp(india.fiiNetCr / C.fii.scale);
  if (india.fiiNetCr != null) readings.fii = `FII net ${india.fiiNetCr >= 0 ? "buying" : "selling"} ₹${Math.abs(india.fiiNetCr).toFixed(0)} cr (last reported)`;
  comp.dii = india.diiNetCr == null ? null : clamp(india.diiNetCr / C.dii.scale);
  if (india.diiNetCr != null) readings.dii = `DII net ${india.diiNetCr >= 0 ? "buying" : "selling"} ₹${Math.abs(india.diiNetCr).toFixed(0)} cr (last reported)`;

  const inr = q.get("USDINR=X");
  comp.inr = inr?.changePct == null ? null : clamp(-inr.changePct / C.inr.scale);
  if (inr?.changePct != null) readings.inr = `Rupee ${inr.changePct > 0 ? "weaker" : "firmer"}, USD/INR ${inr.last.toFixed(2)} (${pct(inr.changePct)})`;

  comp.gift = india.giftGapPct == null ? null : clamp(india.giftGapPct / C.gift.scale);
  if (india.giftGapPct != null) readings.gift = `GIFT Nifty implies ${pct(india.giftGapPct)} open`;

  comp.options = india.pcrNifty == null ? null : clamp((india.pcrNifty - 1) / C.options.scale);
  if (india.pcrNifty != null) readings.options = `Nifty PCR ${india.pcrNifty.toFixed(2)}, ${india.pcrNifty >= 1.2 ? "put-heavy, supportive" : india.pcrNifty <= 0.8 ? "call-heavy, capped" : "balanced"}`;

  const score = aggregate(comp, C);
  return { score, ...bandFor(score), drivers: buildDrivers(comp, C, readings), components: comp };
}

function buildDrivers(comp: Record<string, number | null>, weights: Record<string, { weight: number; label: string }>, readings: Record<string, string>): Driver[] {
  return Object.entries(comp)
    .filter((e): e is [string, number] => e[1] != null)
    .map(([key, score]) => ({ key, label: weights[key].label, score: +score.toFixed(2), weight: weights[key].weight, reading: readings[key] ?? "", tone: toneFor(score) }))
    .sort((a, b) => Math.abs(b.score * b.weight) - Math.abs(a.score * a.weight));
}

// ------------------------------------------------------------------------ transmission
export function assessTransmission(g: { score: number; components: Record<string, number | null> }, i: { score: number; components: Record<string, number | null> }, measured?: Measured | null): Transmission {
  const channels: string[] = [];
  const counterforces: string[] = [];
  const gc = g.components, ic = i.components;

  // Channel evidence: the classic routes by which global stress reaches India.
  if ((gc.dollar ?? 0) <= -0.3 && (ic.inr ?? 0) <= -0.3) channels.push("Stronger dollar coinciding with a weaker rupee");
  if ((gc.rates ?? 0) <= -0.3 && (ic.fii ?? 0) <= -0.3) channels.push("Higher US yields alongside FII selling");
  if ((gc.crude ?? 0) <= -0.3 && ((ic.inr ?? 0) <= -0.2 || (ic.nifty ?? 0) <= -0.2)) channels.push("Rising crude with pressure on the rupee or equities");
  if ((gc.volatility ?? 0) <= -0.3 && (ic.india_vix ?? 0) <= -0.3) channels.push("Global and India volatility rising together");
  if ((gc.us_futures ?? 0) !== 0 && (ic.gift ?? 0) !== 0 && Math.sign(gc.us_futures ?? 0) === Math.sign(ic.gift ?? 0) && Math.abs(gc.us_futures ?? 0) >= 0.2) channels.push("GIFT Nifty tracking US futures");

  // Counterforces: domestic factors leaning against the global direction.
  if (g.score <= -QUIET) {
    if ((ic.dii ?? 0) >= 0.3) counterforces.push("DII buying absorbing supply");
    if ((ic.breadth ?? 0) >= 0.3) counterforces.push("Positive domestic breadth");
    if ((ic.bank_nifty ?? 0) >= 0.3) counterforces.push("Financials outperforming");
    if ((ic.india_vix ?? 0) >= 0.3) counterforces.push("India VIX contained");
  } else if (g.score >= QUIET) {
    if ((ic.fii ?? 0) <= -0.3) counterforces.push("FII selling despite supportive global tone");
    if ((ic.breadth ?? 0) <= -0.3) counterforces.push("Narrow domestic breadth");
    if ((ic.inr ?? 0) <= -0.3) counterforces.push("Rupee weakness");
  }

  const gAbs = Math.abs(g.score), iAbs = Math.abs(i.score);
  const same = Math.sign(g.score) === Math.sign(i.score);
  let label: Transmission["label"];
  let tone: Tone;
  if (gAbs < QUIET) { label = "Limited global influence"; tone = "neutral"; }
  else if (iAbs < QUIET) { label = "Limited global influence"; tone = counterforces.length ? "up" : "neutral"; }
  else if (!same) { label = "India diverging from global markets"; tone = i.score > 0 ? "up" : "down"; }
  else if (iAbs >= gAbs * TRANSMISSION.strongRatio && channels.length > 0) { label = "Strong global influence"; tone = g.score < 0 ? "down" : "up"; }
  else if (iAbs >= gAbs * TRANSMISSION.moderateRatio) { label = channels.length ? "Moderate global influence" : "India moving in line with global markets"; tone = "caution"; }
  else { label = "Limited global influence"; tone = "neutral"; }

  // Measured history refines the day's read: a strong 20-day correlation upgrades an aligned
  // "Moderate" to "Strong"; a weak one downgrades a channel-less "Strong" to "Moderate".
  if (measured?.correlation20 != null && same && gAbs >= QUIET && iAbs >= QUIET) {
    if (measured.label === "Strong" && measured.correlation20 > 0 && label === "Moderate global influence") { label = "Strong global influence"; tone = g.score < 0 ? "down" : "up"; }
    if (measured.label === "Weak" && label === "Strong global influence" && channels.length === 0) { label = "Moderate global influence"; tone = "caution"; }
    if (measured.label === "Strong" && measured.correlation20 > 0 && label === "India moving in line with global markets") { label = "Moderate global influence"; tone = "caution"; }
  }

  return { label, tone, channels, counterforces, measured: measured?.reading ?? null };
}

// ------------------------------------------------------------------------------ regime
export function classifyRegime(components: Record<string, number | null>, raw: { vixChangePct: number | null; usEquityAvgPct: number | null }): Regime {
  return REGIME_RULES.find((r) => r.when(components, raw))?.regime ?? "Mixed";
}

// --------------------------------------------------------------------------- narrative
// Hedged, template-driven language. "Consistent with", "appears to", "likely contributor" --
// never a bare causal claim, and "driver unclear" when nothing stands out.
function describeBand(band: Band): string {
  return band.toLowerCase();
}

export function explain(res: Omit<ContextResult, "explanation" | "whatIsDriving">): { explanation: string; whatIsDriving: string[] } {
  const gTop = res.global.drivers.filter((d) => Math.abs(d.score) >= 0.2).slice(0, 3);
  const iTop = res.india.drivers.filter((d) => Math.abs(d.score) >= 0.2).slice(0, 3);
  const lines: string[] = [];

  if (gTop.length === 0) lines.push("No significant external catalyst identified; global inputs are close to flat.");
  else for (const d of gTop) lines.push(`${d.reading}.`);
  if (iTop.length === 0) lines.push("Indian inputs show no clear direction.");
  else for (const d of iTop) lines.push(`${d.reading}.`);

  const gPhrase = gTop.length ? `${gTop.map((d) => d.label.toLowerCase()).join(", ")}` : "no dominant global factor";
  const iPhrase = iTop.length ? `${iTop.map((d) => d.label.toLowerCase()).join(", ")}` : "no dominant domestic factor";
  let explanation: string;
  switch (res.transmission.label) {
    case "Strong global influence":
      explanation = `Global sentiment is ${describeBand(res.global.band)} on ${gPhrase}, and Indian markets appear to be following: ${res.transmission.channels[0]?.toLowerCase() ?? "moves are aligned"}. India reads ${describeBand(res.india.band)} on ${iPhrase}.`;
      break;
    case "Moderate global influence":
      explanation = `Global sentiment is ${describeBand(res.global.band)}, consistent with ${gPhrase}. India is ${describeBand(res.india.band)}; the global tone is a likely contributor, with ${iPhrase} shaping the domestic read.`;
      break;
    case "India moving in line with global markets":
      explanation = `Global and Indian sentiment are both ${describeBand(res.global.band)}; India appears to be moving with the external environment (${gPhrase}), though no single transmission channel stands out.`;
      break;
    case "India diverging from global markets":
      explanation = `Global sentiment is ${describeBand(res.global.band)} on ${gPhrase}, but India is ${describeBand(res.india.band)}. ${res.transmission.counterforces.length ? `Domestic factors appear to be offsetting: ${res.transmission.counterforces.join("; ").toLowerCase()}.` : "The driver of the divergence is unclear from the available inputs."}`;
      break;
    default:
      if (Math.abs(res.global.score) < QUIET) {
        explanation = `Global inputs are broadly flat, so external influence on India is limited right now. ${iTop.length ? `India reads ${describeBand(res.india.band)} on ${iPhrase}.` : "Indian inputs show no clear direction either."}`;
        if (res.transmission.channels.length) explanation += ` One channel is still active: ${res.transmission.channels[0].toLowerCase()}.`;
      } else {
        explanation = `Global sentiment is ${describeBand(res.global.band)} on ${gPhrase}, but India is showing relative resilience${res.transmission.counterforces.length ? `, consistent with ${res.transmission.counterforces.join(" and ").toLowerCase()}` : ""}.`;
      }
  }
  if (res.confidence.level === "Low") explanation += " Confidence is low: several inputs are missing or stale.";
  return { explanation, whatIsDriving: lines };
}

// --------------------------------------------------------------------------- confidence
function ageMin(iso: string | null, now: Date): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? Math.max(0, (now.getTime() - t) / 60000) : null;
}

export function assessConfidence(quotes: Quote[], india: IndiaInputs, gComp: Record<string, number | null>, iComp: Record<string, number | null>, now: Date) {
  const all = [...Object.values(gComp), ...Object.values(iComp)];
  const coverage = all.filter((v) => v != null).length / all.length;
  const ages = quotes.map((q) => ageMin(q.sourceTs, now)).filter((a): a is number => a != null);
  const indiaAge = ageMin(india.asOf, now);
  // Yahoo's source timestamps for closed markets are hours old by design; judge age on the
  // *freshest third* of quotes so a closed Tokyo does not make a live New York look stale.
  const sorted = ages.slice().sort((a, b) => a - b);
  const freshest = sorted.slice(0, Math.max(1, Math.ceil(sorted.length / 3)));
  const oldest = freshest.length ? Math.max(...freshest, indiaAge ?? 0) : indiaAge;
  const level = coverage >= CONFIDENCE.highCoverage && (oldest ?? Infinity) <= CONFIDENCE.highMaxAgeMin ? "High"
    : coverage >= CONFIDENCE.mediumCoverage && (oldest ?? Infinity) <= CONFIDENCE.mediumMaxAgeMin ? "Medium" : "Low";
  const missing = [...Object.entries(gComp), ...Object.entries(iComp)].filter(([, v]) => v == null).map(([k]) => k);
  const note = missing.length ? `Missing: ${missing.join(", ")}` : "All components present";
  return { level: level as "High" | "Medium" | "Low", coverage: +coverage.toFixed(2), oldestInputMin: oldest == null ? null : Math.round(oldest), note };
}

// -------------------------------------------------------------------------------- main
export function computeContext(quotes: Quote[], india: IndiaInputs, now = new Date(), measured?: Measured | null): ContextResult {
  const g = scoreGlobal(quotes);
  const i = scoreIndia(quotes, india, now);
  const transmission = assessTransmission(g, i, measured);
  const regime = classifyRegime(g.components, g.raw);
  const confidence = assessConfidence(quotes, india, g.components, i.components, now);
  const sourceTimes = quotes.map((q) => q.sourceTs).filter((t): t is string => !!t).sort();
  const partial = {
    calculatedAt: now.toISOString(),
    global: { score: +g.score.toFixed(3), band: g.band, tone: g.tone, drivers: g.drivers, components: g.components },
    india: { score: +i.score.toFixed(3), band: i.band, tone: i.tone, drivers: i.drivers, components: i.components },
    transmission, regime, confidence,
    dataAsOf: sourceTimes.length ? sourceTimes[sourceTimes.length - 1] : null,
  };
  const narrative = explain(partial);
  if (measured?.correlation20 != null) narrative.explanation += ` ${measured.reading}`;
  return { ...partial, ...narrative };
}
