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
// The publish gate: a second, cheaper model reads each paragraph against the same input and
// flags any claim that the input contradicts (wrong day, wrong direction, wrong instrument).
export const JUDGE_MODEL = "claude-sonnet-4-5-20250929";
// Bump whenever the prompt, the input shape or the gate changes: it is part of the reuse key, so
// a deploy forces a fresh, re-checked narrative instead of carrying the previous one forward.
export const NARRATIVE_VERSION = "3";
const TIMEOUT_MS = 30_000;
const LIMITS = { summary: [50, 120], global: [40, 110], india: [40, 110], link: [40, 110] } as const;

export type Narrative = { summary: string; global: string; india: string; link: string; model: string; written_at: string; dropped: string[]; rejected?: Record<string, { reason: string; text: string }>; judge?: { model: string; verdicts: Record<string, { ok: boolean; problems: string[] }> } };

export type TimeContext = { now_ist: string; india_session: "pre-open" | "open" | "closed"; previous_session: { day: string; nifty_change_pct: number | null } | null };

const SYSTEM = `You write MarketCue's Global View: a plain-English read of how the world's markets are affecting India right now.

Rules, all of them hard:
- Use ONLY the figures in the structured input. Never introduce a number, level, date or event that is not there. If an input is missing, do not mention it.
- Explain cause and consequence in hedged language: "consistent with", "appears to", "likely contributor", "tends to". Never assert that one thing caused another.
- Say what is happening, then why it matters for Indian equities, then what it sets up. Specific over generic: name the instrument and its move rather than "markets were mixed".
- No advice, no predictions of levels, no adjectives like "massive" or "crash". No bullet points, no headings, no markdown. Plain prose only.
- TIME IS PART OF THE FACT. Every reading is labelled with when it is from ("today, live as of 14:05 IST", "today's close", "last session, Mon 15 Sep"). Use that label's meaning and nothing else: never write "closed", "yesterday", "overnight" or "this morning" unless the label says so. Today's live move is today's move. The previous session is described only from time_context.previous_session.
- USD/INR up means the rupee is WEAKER. Describe the rupee only as "weaker" or "firmer" and quote the USD/INR level; never say the rupee is "up" or "down".

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

// Numbers that are names, not figures: index suffixes and standard windows.
const ALWAYS_ALLOWED = ["500", "100", "50", "200", "20", "10", "2", "5", "30"];

// Every number the model is allowed to use, in the forms it might reasonably write them.
function allowedNumbers(input: unknown): Set<string> {
  const out = new Set<string>(ALWAYS_ALLOWED);
  const walk = (v: unknown) => {
    if (typeof v === "number" && Number.isFinite(v)) {
      const a = Math.abs(v);
      for (const s of [a.toString(), a.toFixed(0), a.toFixed(1), a.toFixed(2), Math.round(a).toLocaleString("en-IN"), Math.round(a).toLocaleString("en-US")]) out.add(s.replace(/\.0+$/, ""));
    } else if (typeof v === "string") {
      for (const m of v.matchAll(/\d+(?:,\d{3})*(?:\.\d+)?/g)) out.add(m[0].replace(/,/g, "").replace(/\.0+$/, ""));
    } else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(input);
  return out;
}

// A paragraph passes if every number it cites is one the engine supplied (day counts like
// "20 sessions" are in the input too) and its length sits inside the slot.
function validate(text: unknown, allowed: Set<string>, [min, max]: readonly [number, number]): { ok: string } | { reason: string } {
  if (typeof text !== "string") return { reason: "not a string" };
  const t = text.trim().replace(/\s+/g, " ");
  const words = t.split(" ").length;
  if (words < min || words > max) return { reason: `${words} words, slot is ${min}-${max}` };
  for (const m of t.matchAll(/\d+(?:,\d{3})*(?:\.\d+)?/g)) {
    const n = m[0].replace(/,/g, "").replace(/\.0+$/, "");
    if (!allowed.has(n)) return { reason: `cites ${m[0]}, not in the input` };
  }
  return { ok: t };
}

// ------------------------------------------------------------------------------- judge
const JUDGE_SYSTEM = `You are a fact checker for a market note. You receive the structured input the writer was given and one paragraph the writer produced. List only claims the input CONTRADICTS, of exactly these kinds: a move attributed to the wrong day (e.g. "closed yesterday" when the reading is labelled today), the wrong direction (up vs down), the wrong instrument, or a figure that differs from the input.
Rules: a negative number in the input is a fall, so calling it a decline or a drop is correct. USD/INR rising means the rupee weakened, so "rupee weaker" with a positive USD/INR change is correct. Ignore hedged interpretation ("tends to", "consistent with"), rounding, and wording you would merely phrase differently. If, while explaining a problem, you conclude the paragraph is accurate to the input, it is not a problem: do not list it. Return ok=true with an empty list unless there is a real contradiction.`;
const JUDGE_SCHEMA = { type: "object", properties: { ok: { type: "boolean" }, problems: { type: "array", items: { type: "string" } } }, required: ["ok", "problems"] };

async function judge(apiKey: string, input: unknown, key: string, text: string): Promise<{ ok: boolean; problems: string[] }> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    body: JSON.stringify({
      model: JUDGE_MODEL, max_tokens: 400, temperature: 0, system: JUDGE_SYSTEM,
      tools: [{ name: "verdict", description: "The fact-check verdict.", input_schema: JUDGE_SCHEMA }],
      tool_choice: { type: "tool", name: "verdict" },
      messages: [{ role: "user", content: `Structured input (JSON):\n${JSON.stringify(input)}\n\nParagraph "${key}":\n${text}` }],
    }),
  });
  if (!res.ok) throw new Error(`judge ${res.status}`);
  const json = await res.json();
  const block = (json.content ?? []).find((c: { type: string }) => c.type === "tool_use") as { input?: { ok?: boolean; problems?: unknown } } | undefined;
  const problems = Array.isArray(block?.input?.problems) ? block!.input!.problems.map(String).slice(0, 6) : [];
  return { ok: block?.input?.ok === true && problems.length === 0, problems };
}

// Deterministic direction check: an instrument named with an "up" word whose input change is
// negative (or the reverse) is a contradiction we do not need a model to see.
const UP = /\b(rose|rise|rises|rising|up|gained|gain|gains|gaining|climbed|climb|climbing|advanced|advancing|higher|firmed|firmer|rallied|rallying|added|adding|stronger|strengthened|recovered|recovering)\b/i;
const DOWN = /\b(fell|fall|falls|falling|down|lost|loss|losses|losing|dropped|drop|dropping|declined|decline|declining|lower|slid|sliding|slipped|slipping|weakened|weaker|eased|easing|retreated|softer)\b/i;
// The check runs per clause, not per sentence: "crude falling 1.97 per cent, with Asia up 0.75"
// is two claims, and the "up" belongs to Asia.
const CLAUSE = /[,;:]|\s(?:and|while|with|but|though|although|as|whereas)\s/i;
function directionProblems(text: string, readings: { label: string; change: number | null }[]): string[] {
  const out: string[] = [];
  for (const s of text.split(/(?<=[.;])\s+/).flatMap((x) => x.split(CLAUSE))) {
    for (const r of readings) {
      if (r.change == null || !s.toLowerCase().includes(r.label.toLowerCase())) continue;
      const up = UP.test(s), down = DOWN.test(s);
      if (up && !down && r.change < 0) out.push(`${r.label} described as up but input change is ${r.change}%`);
      if (down && !up && r.change > 0) out.push(`${r.label} described as down but input change is +${r.change}%`);
    }
  }
  return out;
}

export async function writeNarrative(apiKey: string, ctx: ContextResult, measured: Measured, events: MoveEvent[], indiaAsOf: string | null, time?: TimeContext): Promise<Narrative | null> {
  const input = {
    calculated_at_utc: ctx.calculatedAt,
    time_context: time ?? null,
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
  const rejected: Record<string, { reason: string; text: string }> = {};
  const verdicts: Record<string, { ok: boolean; problems: string[] }> = {};
  // Instrument readings the direction check can see: label + signed change from the driver text.
  const readingsForCheck = [...ctx.global.drivers, ...ctx.india.drivers].map((d) => { const m = d.reading.match(/^(.+?)\s([+-]\d+(?:\.\d+)?)%/); return m ? { label: m[1], change: Number(m[2]) } : null; }).filter((x): x is { label: string; change: number } => x != null);

  const fallbacks: Record<keyof typeof LIMITS, string> = { summary: ctx.explanation, global: ctx.whatIsDriving.slice(0, 3).join(" "), india: ctx.whatIsDriving.slice(3, 6).join(" "), link: ctx.explanation };
  const out: Record<string, string> = {};
  for (const k of Object.keys(LIMITS) as (keyof typeof LIMITS)[]) {
    const v = validate(block.input![k], allowed, LIMITS[k]);
    if (!("ok" in v)) { dropped.push(k); rejected[k] = { reason: v.reason, text: String(block.input![k] ?? "").slice(0, 600) }; out[k] = fallbacks[k]; continue; }
    // Publish gate: deterministic direction check, then the judge model. Either contradiction
    // drops the paragraph in favour of the template.
    const problems = directionProblems(v.ok, readingsForCheck);
    let verdict = { ok: problems.length === 0, problems };
    if (verdict.ok) { try { verdict = await judge(apiKey, input, k, v.ok); } catch (e) { verdict = { ok: true, problems: [`judge unavailable: ${e instanceof Error ? e.message : e}`] }; } }
    verdicts[k] = verdict;
    if (!verdict.ok) { dropped.push(k); rejected[k] = { reason: `contradicted: ${verdict.problems.join("; ")}`, text: v.ok.slice(0, 600) }; out[k] = fallbacks[k]; continue; }
    out[k] = v.ok;
  }
  return {
    summary: out.summary, global: out.global, india: out.india, link: out.link,
    model: NARRATIVE_MODEL, written_at: new Date().toISOString(), dropped, rejected,
    judge: { model: JUDGE_MODEL, verdicts },
  };
}
