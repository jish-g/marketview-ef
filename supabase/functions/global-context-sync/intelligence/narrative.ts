// MarketCue intelligence engine: narrative.
//
// The only place a language model appears in the engine, and it appears in the role the product
// spec assigns it: explain the numbers, never produce them. The engine's verdicts, drivers,
// measured relationship and events go in as structured input; four short paragraphs come out,
// one per screen tab. Every figure in the prose is checked against the input and any paragraph
// that cites a number the engine did not supply is dropped in favour of the template sentence.
// If the model is unavailable the screen falls back to the templates and says nothing about it.

import type { ContextResult } from "./engine.ts";
import type { Measured, MoveEvent } from "./analytics.ts";

export const NARRATIVE_MODEL = "claude-sonnet-4-5-20250929";
const TIMEOUT_MS = 30_000;
const LIMITS = { summary: [50, 120], global: [40, 110], india: [40, 110], link: [40, 110] } as const;

export type Narrative = { summary: string; global: string; india: string; link: string; model: string; written_at: string; dropped: string[] };

const SYSTEM = `You write MarketCue's Global View: a plain-English read of how the world's markets are affecting India right now.

Rules, all of them hard:
- Use ONLY the figures in the structured input. Never introduce a number, level, date or event that is not there. If an input is missing, do not mention it.
- Explain cause and consequence in hedged language: "consistent with", "appears to", "likely contributor", "tends to". Never assert that one thing caused another.
- Say what is happening, then why it matters for Indian equities, then what it sets up. Specific over generic: name the instrument and its move rather than "markets were mixed".
- No advice, no predictions of levels, no adjectives like "massive" or "crash". No bullet points, no headings, no markdown. Plain prose only.
- Mention freshness when an input is from the last session rather than today (the input marks these).

Style to match (this is a sample of tone, not of facts):
"GIFT Nifty gapped half a percent after yesterday's selloff, but support and resistance are both being reinforced. VIX at 13.4 sits in the ideal zone, yet six days to Nifty expiry and one to Sensex create a split setup. FII outflows of 930 crore against DII buying kept the fall orderly, but the gap opens where calls are being built."

Write four fields:
- summary: the whole picture in one paragraph, 50-120 words, global first, then India, then the link between them.
- global: the global environment only, 40-110 words, the two or three drivers that matter and why they matter for India.
- india: the domestic picture only, 40-110 words.
- link: how strongly the global picture is reaching India and through which channel, 40-110 words, using the measured 20-session relationship where given.`;

const SCHEMA = {
  type: "object",
  properties: { summary: { type: "string" }, global: { type: "string" }, india: { type: "string" }, link: { type: "string" } },
  required: ["summary", "global", "india", "link"],
};

// Every number the model is allowed to use, in the forms it might reasonably write them.
function allowedNumbers(input: unknown): Set<string> {
  const out = new Set<string>();
  const walk = (v: unknown) => {
    if (typeof v === "number" && Number.isFinite(v)) {
      const a = Math.abs(v);
      for (const s of [a.toString(), a.toFixed(0), a.toFixed(1), a.toFixed(2), Math.round(a).toLocaleString("en-IN"), Math.round(a).toLocaleString("en-US")]) out.add(s.replace(/\.0+$/, ""));
    } else if (typeof v === "string") {
      for (const m of v.matchAll(/\d[\d,]*(?:\.\d+)?/g)) out.add(m[0].replace(/,/g, "").replace(/\.0+$/, ""));
    } else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(input);
  return out;
}

// A paragraph passes if every number it cites is one the engine supplied (day counts like
// "20 sessions" are in the input too) and its length sits inside the slot.
function validate(text: unknown, allowed: Set<string>, [min, max]: readonly [number, number]): string | null {
  if (typeof text !== "string") return null;
  const t = text.trim().replace(/\s+/g, " ");
  const words = t.split(" ").length;
  if (words < min || words > max) return null;
  for (const m of t.matchAll(/\d[\d,]*(?:\.\d+)?/g)) {
    const n = m[0].replace(/,/g, "").replace(/\.0+$/, "");
    if (!allowed.has(n)) return null;
  }
  return t;
}

export async function writeNarrative(apiKey: string, ctx: ContextResult, measured: Measured, events: MoveEvent[], indiaAsOf: string | null): Promise<Narrative | null> {
  const input = {
    calculated_at_utc: ctx.calculatedAt,
    global: { band: ctx.global.band, score: ctx.global.score, regime: ctx.regime, drivers: ctx.global.drivers.map((d) => ({ factor: d.label, score: d.score, reading: d.reading })) },
    india: { band: ctx.india.band, score: ctx.india.score, inputs_as_of: indiaAsOf, drivers: ctx.india.drivers.map((d) => ({ factor: d.label, score: d.score, reading: d.reading })) },
    transmission: { label: ctx.transmission.label, channels_active: ctx.transmission.channels, domestic_counterforces: ctx.transmission.counterforces, measured_20_sessions: measured.correlation20 == null ? null : { correlation: measured.correlation20, beta: measured.beta20, sessions: measured.pairs, nifty_20d_pct: measured.niftyRet20, spx_20d_pct: measured.spxRet20, relative_pct_points: measured.relPerf20 } },
    significant_moves: events.slice(0, 4).map((e) => ({ title: e.title, times_usual_daily_move: Math.abs(e.evidence.z), five_session_pct: null, india_relevance: e.indiaRelevance, why: e.indiaImpact })),
    confidence: ctx.confidence,
    missing_inputs: ctx.confidence.note,
  };
  const allowed = allowedNumbers(input);

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    body: JSON.stringify({
      model: NARRATIVE_MODEL, max_tokens: 1200, temperature: 0.3, system: SYSTEM,
      tools: [{ name: "write_global_view", description: "Return the four paragraphs.", input_schema: SCHEMA }],
      tool_choice: { type: "tool", name: "write_global_view" },
      messages: [{ role: "user", content: `Structured input (JSON):\n${JSON.stringify(input)}` }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status} ${(await res.text()).slice(0, 200)}`);
  const json = await res.json();
  const block = (json.content ?? []).find((c: { type: string }) => c.type === "tool_use") as { input?: Record<string, unknown> } | undefined;
  if (!block?.input) throw new Error("model returned no tool_use block");

  const dropped: string[] = [];
  const pick = (k: keyof typeof LIMITS, fallback: string) => { const v = validate(block.input![k], allowed, LIMITS[k]); if (v == null) dropped.push(k); return v ?? fallback; };
  return {
    summary: pick("summary", ctx.explanation),
    global: pick("global", ctx.whatIsDriving.slice(0, 3).join(" ")),
    india: pick("india", ctx.whatIsDriving.slice(3, 6).join(" ")),
    link: pick("link", ctx.explanation),
    model: NARRATIVE_MODEL, written_at: new Date().toISOString(), dropped,
  };
}
