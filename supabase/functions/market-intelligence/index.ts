// market-intelligence
// v1: rule-becomes-agent.
//
// market-data-sync stays the source of every number. This function does not recompute PCR, IV,
// max pain or the expected move. But it does NOT read the engine's bias/strategy as its starting
// point either: the rules are given to the agent as a playbook (PLAYBOOK below), the agent reads
// the raw data plus the context a lookup table cannot see (pre-market setup, the last ten
// sessions, paper-trade outcomes, its own graded lessons) and forms the view itself -- bias,
// readiness, structure, reasoning, invalidation. The engine's own answer is stored beside the
// agent's in the same agent_calls row purely so the two can be scored against each other.
// The only hard limits are two account-risk rules (VIX > 22: no buying; DTE <= 1: no naked),
// enforced in TypeScript after the model answers.
//
// Phases (POST body { phase, checkpoint? }, same x-cron-secret as market-data-sync):
//   premarket   8:58 + 2 min  -> sets the day's context (regime, levels to watch, risk flags). No strategy.
//   open        9:30 + 5 min  -> the morning call: per-instrument strategy, confidence, reasoning,
//                                invalidation. Compared to the rule engine's stored strategy.
//   mid         each checkpoint + 2 min -> hold / adjust / exit / enter / stay_out on the morning call,
//                                using the checkpoint row, the paper trade's live state, and the
//                                morning call's own invalidation condition.
//   post-close  15:45 + 5 min -> grades the morning call (right / partial / wrong), names the signal
//                                that misled, writes a one-line lesson. Tomorrow's premarket reads it.
//
// Everything is written to agent_calls with the exact inputs and raw model output, so rules-vs-agent
// hit-rate is a plain SQL query. If the model call fails, the row is written with the rule engine's
// answer and guardrail_applied = 'model_unavailable' -- the dashboard always has something to show.

import { createClient } from "jsr:@supabase/supabase-js@2";

const MODEL = "claude-sonnet-4-5-20250929";
const MODEL_TIMEOUT_MS = 40_000;
const LOOKBACK_DAYS = 10;

type Instrument = "NIFTY" | "SENSEX";
type Phase = "premarket" | "open" | "mid" | "post-close";

// The complete set of strategies the rule engine can emit. The model may only pick from these.
const STRATEGIES = [
  "Naked Call", "Naked Put",
  "Call Debit Spread", "Put Debit Spread",
  "Put Credit Spread", "Call Credit Spread",
  "Iron Condor", "No Trade",
] as const;
type Strategy = typeof STRATEGIES[number];
const BUYING: Strategy[] = ["Naked Call", "Naked Put", "Call Debit Spread", "Put Debit Spread"];

function todayIST(): string {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" })).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------------------------
// Risk limits. These are the only two things the agent cannot decide for itself, because they are
// account-risk limits rather than market reads: no fresh premium buying when VIX is above 22, and
// no naked options with one day or less to expiry. Everything else -- bias, readiness, structure,
// direction, whether to trade at all -- is the agent's call. An unknown strategy string is treated
// as No Trade, never silently mapped to the rule engine's answer.
// ---------------------------------------------------------------------------------------------
function applyRiskLimits(proposed: string, ctx: { vix: number | null; dte: number | null }): { strategy: Strategy; guardrail: string | null } {
  let s = (STRATEGIES as readonly string[]).includes(proposed) ? (proposed as Strategy) : null;
  if (!s) return { strategy: "No Trade", guardrail: `unknown strategy "${proposed}" -> No Trade` };
  const notes: string[] = [];
  if (ctx.vix != null && ctx.vix > 22 && BUYING.includes(s)) { s = "No Trade"; notes.push(`VIX ${ctx.vix.toFixed(1)} > 22: no fresh option buying`); }
  if (ctx.dte != null && ctx.dte <= 1 && s === "Naked Call") { s = "Call Debit Spread"; notes.push(`DTE ${ctx.dte}: naked call -> debit spread`); }
  if (ctx.dte != null && ctx.dte <= 1 && s === "Naked Put") { s = "Put Debit Spread"; notes.push(`DTE ${ctx.dte}: naked put -> debit spread`); }
  return { strategy: s, guardrail: notes.length ? notes.join("; ") : null };
}

// ---------------------------------------------------------------------------------------------
// The playbook. This is the rule engine's logic (computeMarketBiasV / computeOptionReadinessV /
// computeStrategyRecommendationV in market-data-sync) written out as knowledge, not as a
// lookup. The agent reads the raw data and forms its own view using this as its training; it is
// free to weigh a signal differently on a given day when the data justifies it, and must say why.
// Keep this in sync with market-data-sync when the rules change -- this is the single place the
// agent learns them from.
// ---------------------------------------------------------------------------------------------
const PLAYBOOK = `HOW THE RULE ENGINE READS A DAY (your playbook -- know it, use it, and depart from it only with a stated reason)

Stage 1, Market Bias (WHERE). Four signals, each scored, then weighted.
- Gap %: > +0.75 = +2, +0.25..+0.75 = +1, -0.25..+0.25 = 0, -0.75..-0.25 = -1, < -0.75 = -2.
- PCR (sum put OI / sum call OI across the chain): > 1.30 = +2 (contrarian bullish), 0.80..1.30 = 0, < 0.80 = -2.
- Max Pain: spot below by > 0.3% = +1 (pull up into expiry), within 0.3% = 0 (pinning), above by > 0.3% = -1.
- OI structure: support strike Addition +1 / Unwinding -1; resistance strike Addition -1 / Unwinding +1; sum clamped to -2..+2.
- Weights: DTE > 3 -> Gap 45%, OI 25%, PCR 20%, Max Pain 10%. DTE <= 3 -> Gap 25%, OI 45%, PCR 20%, Max Pain 10%. Near expiry, positioning matters more than the gap.
- Bands: >= +1.25 Strong Bullish, >= +0.5 Bullish, > -0.5 Neutral, > -1.25 Bearish, else Strong Bearish.

Stage 2, Option Readiness (WHETHER). VIX 11-14 = +2 ideal, < 11 = +1 thin premium, 14-18 = 0, 18-22 = -1 crush risk, > 22 = -2.
IV vs VIX (absolute, ATM IV minus VIX): within +/-1 = Normal (+1); more than 1 below = Cheap (+2); more than 1 above = Expensive (-1).
DTE: 2-4 = +2 ideal window, > 4 = +1, <= 1 = -1 gamma risk. Sum >= 4 Good to Buy, >= 1 Caution, else Avoid.

Stage 3, Strategy (WHAT), as the engine maps it:
- Bullish/Strong Bullish: VIX > 18 or Expensive IV -> Put Credit Spread. Strong Bullish + Cheap IV + VIX 11-18 -> Naked Call. Otherwise Call Debit Spread.
- Bearish/Strong Bearish: VIX > 18 or Expensive IV -> Call Credit Spread. Strong Bearish + Cheap IV + VIX 11-18 -> Naked Put. Otherwise Put Debit Spread.
- Neutral: VIX > 18 or Expensive IV -> Iron Condor. Cheap or Normal IV -> No Trade (no premium edge to sell, no direction to buy).
- Always: VIX > 22 blocks buying strategies; DTE <= 1 turns naked options into debit spreads.

Expected move: option-implied = ATM straddle / sqrt(max(DTE,1)); historical = 5-day average daily range. Conservative = the smaller, Aggressive = the larger. Do not add multipliers or invent your own sizing.

What the table cannot see and you can: an event on the calendar, a gap that opens straight into a resistance strike where calls are being added, a PCR that is high because puts were written into a rally rather than bought as hedges, expiry-day pinning, a VIX that is falling fast versus one that is rising through 18, FII/DII flow running against the gap, and what happened the last time this setup appeared (the last sessions and the graded lessons are in your input). When these change the read, say which signal you are weighing differently and why.`;

// ---------------------------------------------------------------------------------------------
// Model call. Structured output via a forced tool call so the response is always parseable JSON.
// ---------------------------------------------------------------------------------------------
type Limit = { words?: number; chars?: number; items?: number; itemWords?: number; sentences?: number };
type Limits = Record<string, Limit>;

// Length limits per field, from agent_instructions (the numbers are duplicated here so the check
// is deterministic; the prose in the table is what the model reads).
const LIMITS: Record<string, Limits> = {
  premarket: { headline: { words: 6, chars: 40 }, note: { words: 55 }, watch: { words: 20 }, risk_flags: { items: 3, itemWords: 4 } },
  open: { view: { words: 10, chars: 60 }, reasoning: { words: 55 }, invalidation: { words: 18 } },
  mid: { reasoning: { words: 35 } },
  "post-close": { reasoning: { words: 50 }, lesson: { words: 22 }, misleading_signal: { words: 4 } },
};

function wordCount(s: string) { return s.trim().split(/\s+/).filter(Boolean).length; }

function checkLimits(output: Record<string, any>, limits: Limits): string[] {
  const over: string[] = [];
  for (const [field, lim] of Object.entries(limits)) {
    const v = output[field];
    if (v == null) continue;
    if (Array.isArray(v)) {
      if (lim.items != null && v.length > lim.items) over.push(`${field}: ${v.length} items / max ${lim.items}`);
      if (lim.itemWords != null) for (const it of v) { const w = wordCount(String(it)); if (w > lim.itemWords) over.push(`${field} entry "${String(it).slice(0, 30)}": ${w} words / max ${lim.itemWords}`); }
      continue;
    }
    const s = String(v);
    if (lim.words != null) { const w = wordCount(s); if (w > lim.words) over.push(`${field}: ${w} words / max ${lim.words}`); }
    if (lim.chars != null && s.length > lim.chars) over.push(`${field}: ${s.length} chars / max ${lim.chars}`);
  }
  return over;
}

// One structured call, then a length check. If a field runs past its slot the model gets ONE retry
// that names the overrun; if it is still over, the answer is kept and the overrun is reported so it
// lands in guardrail_applied rather than silently on screen.
async function askModel(apiKey: string, system: string, user: unknown, schema: Record<string, unknown>, limits: Limits = {}) {
  const t0 = Date.now();
  const call = async (messages: any[]) => {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      signal: AbortSignal.timeout(MODEL_TIMEOUT_MS),
      body: JSON.stringify({
        model: MODEL, max_tokens: 1200, temperature: 0.3, system,
        tools: [{ name: "record_call", description: "Record the structured judgement.", input_schema: schema }],
        tool_choice: { type: "tool", name: "record_call" },
        messages,
      }),
    });
    if (!res.ok) throw new Error(`Anthropic ${res.status} ${await res.text()}`);
    const json = await res.json();
    const block = (json.content ?? []).find((c: any) => c.type === "tool_use");
    if (!block) throw new Error("model returned no tool_use block");
    return { block, json };
  };
  const first = [{ role: "user", content: `Structured input (JSON):\n${JSON.stringify(user)}` }];
  let { block, json } = await call(first);
  let output = block.input as Record<string, any>;
  let over = checkLimits(output, limits);
  let retried = false;
  if (over.length) {
    retried = true;
    const messages = [
      ...first,
      { role: "assistant", content: json.content },
      { role: "user", content: [{ type: "tool_result", tool_use_id: block.id, content: `Over the slot: ${over.join("; ")}. Rewrite the whole record within the limits. Same judgement, fewer words.` }] },
    ];
    const second = await call(messages);
    const candidate = second.block.input as Record<string, any>;
    const stillOver = checkLimits(candidate, limits);
    if (stillOver.length <= over.length) { output = candidate; over = stillOver; }
  }
  return { output, latencyMs: Date.now() - t0, lengthNote: over.length ? `length: ${over.join("; ")}${retried ? " (after retry)" : ""}` : null };
}

// Rendering instructions live in agent_instructions and are read at call time, so wording changes
// are a DB edit. The block that applies to all phases comes first, then the phase's own block.
async function loadInstructions(admin: any, phase: string): Promise<string> {
  const { data } = await admin.from("agent_instructions").select("body, applies_to, ordinal").eq("agent", "market-intelligence").eq("active", true).in("applies_to", ["all", phase]).order("ordinal");
  return (data ?? []).map((r: any) => r.body).join("\n\n");
}

const SYSTEM_COMMON = `You are MarketCue's analyst for NIFTY and SENSEX options. You read the day's data and form the view.
The numbers (PCR, max pain, IV, straddle, OI levels, gap, VIX, expected move) are computed for you and
are correct; do not recompute them. What you produce is the view: bias, whether options are worth
trading, which structure, why, and what would prove you wrong.

${PLAYBOOK}

Fixed limits (enforced after you answer): only these strategies exist: ${STRATEGIES.join(", ")}.
VIX above 22 forbids any premium-buying strategy. DTE of 1 or less forbids naked options.

Conduct: never invent a number; every figure you cite must appear in the input. Prefer No Trade over a
low-conviction call. Plain sentences, no bullet points, no headers -- this text is shown to traders as-is.
Length is part of the job: a trader reads the headline in two seconds and the reasoning in fifteen. Keep
score arithmetic out of the prose; the dashboard shows bias, readiness and IV condition beside your words.`;

// ---------------------------------------------------------------------------------------------
// Shared context builders
// ---------------------------------------------------------------------------------------------
async function recentHistory(admin: any, tradeDate: string) {
  const [post, calls, trades] = await Promise.all([
    admin.from("postmarket_summary")
      .select("trade_date, close_nifty, close_sensex, day_change_pct_nifty, day_change_pct_sensex, day_high_nifty, day_low_nifty, day_high_sensex, day_low_sensex, fii_net_cash_cr, dii_net_cash_cr, recap_story_nifty, recap_story_sensex")
      .lt("trade_date", tradeDate).order("trade_date", { ascending: false }).limit(LOOKBACK_DAYS),
    admin.from("agent_calls")
      .select("trade_date, phase, instrument, rule_bias, rule_strategy, agent_strategy, confidence, agrees_with_rules, grade, misleading_signal, lesson")
      .lt("trade_date", tradeDate).in("phase", ["open", "post-close"]).order("trade_date", { ascending: false }).limit(LOOKBACK_DAYS * 4),
    admin.from("auto_trades")
      .select("trade_date, instrument, strategy, source, outcome, exit_reason, entry_premium, exit_premium")
      .lt("trade_date", tradeDate).eq("source", "system").order("trade_date", { ascending: false }).limit(LOOKBACK_DAYS * 2),
  ]);
  const grades = (calls.data ?? []).filter((c: any) => c.phase === "post-close");
  const opens = (calls.data ?? []).filter((c: any) => c.phase === "open");
  const scoreboard = {
    sessions_graded: grades.length,
    agent_right: grades.filter((g: any) => g.grade === "right").length,
    agent_wrong: grades.filter((g: any) => g.grade === "wrong").length,
    disagreements: opens.filter((o: any) => o.agrees_with_rules === false).length,
    recent_lessons: grades.slice(0, 5).map((g: any) => ({ date: g.trade_date, instrument: g.instrument, grade: g.grade, lesson: g.lesson })),
  };
  return { last_sessions: post.data ?? [], paper_trades: trades.data ?? [], scoreboard };
}

function pick<T extends Record<string, any>>(row: T | null, keys: string[]): Record<string, any> {
  const out: Record<string, any> = {};
  if (!row) return out;
  for (const k of keys) if (row[k] !== undefined) out[k] = row[k];
  return out;
}

const PREMARKET_KEYS = [
  "trade_date", "day_name", "event_today", "india_vix", "gift_nifty_gap_pct", "gift_nifty_gap_pts",
  "days_to_expiry_nifty", "days_to_expiry_sensex", "avg_move_5d_nifty", "avg_move_5d_sensex",
  "prev_day_change_pct_nifty", "prev_day_change_pct_sensex", "chart_support_nifty", "chart_resistance_nifty",
  "chart_support_sensex", "chart_resistance_sensex", "oi_support_nifty", "oi_resistance_nifty",
  "oi_change_support_nifty", "oi_change_resistance_nifty", "oi_support_sensex", "oi_resistance_sensex",
  "oi_change_support_sensex", "oi_change_resistance_sensex",
];
const OPEN_KEYS = [
  ...PREMARKET_KEYS,
  "spot_nifty", "spot_sensex", "prev_close_nifty", "prev_close_sensex", "gap_points_nifty", "gap_points_sensex",
  "atm_iv_nifty", "atm_iv_sensex", "atm_straddle_price_nifty", "atm_straddle_price_sensex",
  "pcr_nifty", "pcr_sensex", "max_pain_nifty", "max_pain_sensex",
  "atm_straddle_delta_nifty", "atm_straddle_delta_sensex", "atm_straddle_theta_nifty", "atm_straddle_theta_sensex",
  // Deliberately NOT market_bias_* / suggested_strategy_*: the agent forms its own view from the data.
  // The engine's answer is kept out of the prompt and stored beside the agent's for scoring only.
];

// The engine's bias/strategy for an instrument -- read for the scoreboard, never shown to the model.
function shadow(row: Record<string, any> | null, s: string, mid = false) {
  const b = row?.[`market_bias_${s}${mid ? "_mid" : ""}`] ?? null;
  const st = row?.[`suggested_strategy_${s}${mid ? "_mid" : ""}`] ?? null;
  return { bias: b as string | null, strategy: st as string | null };
}

// Gap % as the engine defines it (open - prev close), so the agent sees the same number the playbook scores.
function gapPct(pm: Record<string, any>, s: string): number | null {
  const gap = pm[`gap_points_${s}`], prev = pm[`prev_close_${s}`];
  return gap != null && prev ? +((Number(gap) / Number(prev)) * 100).toFixed(3) : null;
}

// ---------------------------------------------------------------------------------------------
Deno.serve(async (req: Request) => {
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const cronSecret = req.headers.get("x-cron-secret");
  const { data: expectedSecret } = await admin.rpc("get_vault_secret", { secret_name: "edge_function_cron_secret" });
  if (!cronSecret || cronSecret !== expectedSecret) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });

  const { data: apiKey } = await admin.rpc("get_vault_secret", { secret_name: "anthropic_api_key" });

  let body: any = {};
  try { body = await req.json(); } catch { /* no body */ }
  const phase: Phase = body.phase;
  const checkpoint: string = body.checkpoint ?? "";
  const tradeDate: string = body.trade_date ?? todayIST();   // trade_date override lets you backfill a past day
  const skipped: string[] = [];
  const written: any[] = [];

  const upsert = async (row: Record<string, unknown>) => {
    const { error } = await admin.from("agent_calls").upsert({ trade_date: tradeDate, phase, checkpoint, model: MODEL, ...row }, { onConflict: "trade_date,phase,checkpoint,instrument" });
    if (error) skipped.push(`upsert ${row.instrument}: ${error.message}`); else written.push(row.instrument);
  };

  try {
    const { data: pm } = await admin.from("premarket_dashboard").select("*").eq("trade_date", tradeDate).maybeSingle();
    if (!pm) return new Response(JSON.stringify({ ok: false, phase, error: `no premarket_dashboard row for ${tradeDate}` }), { status: 200 });
    const history = await recentHistory(admin, tradeDate);
    const instructions = await loadInstructions(admin, phase);
    const withInstructions = (system: string) => instructions ? `${system}\n\n${instructions}` : system;

    // ------------------------------------------------------------------ premarket
    if (phase === "premarket") {
      const input = { today: pick(pm, PREMARKET_KEYS), ...history };
      const schema = {
        type: "object", required: ["headline", "regime", "watch", "risk_flags", "note"],
        properties: {
          headline: { type: "string", description: "The read in at most 6 words and 40 characters, in the same voice as a view line: what today IS. No numbers, no strategy." },
          regime: { type: "string", enum: ["trend_up", "trend_down", "range", "event_driven", "unclear"], description: "Classification tag for the scoreboard; not shown as the headline." },
          watch: { type: "string", description: "One sentence, at most 20 words: the two or three levels that decide the day." },
          risk_flags: { type: "array", items: { type: "string" }, description: "At most three entries, each 2-4 words, no sentence, no trailing full stop. Empty if none." },
          note: { type: "string", description: "At most 55 words, 2-4 sentences: the setup a trader reads before the open. No strategy names, no score arithmetic." },
        },
      };
      const system = `${SYSTEM_COMMON}\n\nPhase: PRE-MARKET. The market has not opened; there is no spot, PCR, max pain or bias yet.
Set the day's context only. Do not recommend a strategy and do not use bullish/bearish as a call.
Use: GIFT Nifty gap, VIX, days to expiry, OI support/resistance and whether it is being added or unwound,
the 5-day average range, the prior sessions and any lesson from earlier grades.`;
      if (!apiKey) { skipped.push("anthropic_api_key not in vault"); }
      else {
        try {
          const { output, latencyMs, lengthNote } = await askModel(apiKey, withInstructions(system), input, schema, LIMITS.premarket);
          await upsert({ instrument: "BOTH", reasoning: output.note, invalidation: output.watch, inputs: input, raw_output: output, latency_ms: latencyMs, agent_bias: output.regime, guardrail_applied: lengthNote });
        } catch (e) { skipped.push(`premarket model: ${e}`); }
      }
    }

    // ------------------------------------------------------------------ open
    if (phase === "open") {
      const { data: ctx } = await admin.from("agent_calls").select("agent_bias, reasoning, invalidation, raw_output").eq("trade_date", tradeDate).eq("phase", "premarket").maybeSingle();
      const vix = pm.india_vix != null ? Number(pm.india_vix) : null;
      for (const instrument of ["NIFTY", "SENSEX"] as Instrument[]) {
        const s = instrument.toLowerCase();
        const rule = shadow(pm, s);
        const dte = pm[`days_to_expiry_${s}`] != null ? Number(pm[`days_to_expiry_${s}`]) : null;
        if (pm[`spot_${s}`] == null || pm[`pcr_${s}`] == null) { skipped.push(`${instrument} open: 9:30 data not captured yet`); continue; }

        const input = {
          instrument,
          today: { ...pick(pm, OPEN_KEYS), [`gap_pct_${s}`]: gapPct(pm, s), india_vix: vix },
          premarket_view: ctx ? { regime: ctx.agent_bias, note: ctx.reasoning, watch: ctx.invalidation, risk_flags: ctx.raw_output?.risk_flags ?? [] } : null,
          ...history,
        };
        const schema = {
          type: "object", required: ["bias", "readiness", "iv_condition", "strategy", "confidence", "view", "reasoning", "invalidation", "invalidation_level", "invalidation_direction"],
          properties: {
            bias: { type: "string", enum: ["Strong Bullish", "Bullish", "Neutral", "Bearish", "Strong Bearish"] },
            readiness: { type: "string", enum: ["Good to Buy", "Caution", "Avoid"] },
            iv_condition: { type: "string", enum: ["Cheap", "Normal", "Expensive"] },
            strategy: { type: "string", enum: [...STRATEGIES] },
            confidence: { type: "string", enum: ["high", "medium", "low"] },
            view: { type: "string", description: "ONE clause, at most 10 words and 60 characters. No numbers, no semicolons, no 'and' joining two ideas. Say what the setup IS." },
            reasoning: { type: "string", description: "At most 55 words, 3-4 sentences, plain trader language. Name the two or three signals that drive the call and, if you weighed one against the playbook, which. No scores, weights or arithmetic." },
            invalidation: { type: "string", description: "One sentence, at most 18 words, ending in a full stop. The observable condition only; give the level plainly." },
            invalidation_level: { type: ["number", "null"], description: "The single spot level from the invalidation sentence, as a number. null only if the invalidation is not a price level." },
            invalidation_direction: { type: ["string", "null"], enum: ["above", "below", null], description: "The view is wrong if spot trades ABOVE or BELOW invalidation_level. null if no level." },
          },
        };
        const system = `${SYSTEM_COMMON}\n\nPhase: MARKET OPEN (9:30 IST). Form the view of record for ${instrument} from today's data.
Work through the playbook's three stages in your head -- bias, readiness, structure -- but you own the
answer: if a signal deserves more or less weight today than its default (an expiry-day gap, OI being
added right at the level price gapped into, a PCR reading that the flow data contradicts, a lesson from a
recent graded session), weigh it that way and say so in reasoning. Use premarket_view as the setup you
walked in with, and the scoreboard to notice which reads have been working.`;

        let final: Record<string, unknown>;
        if (!apiKey) { skipped.push("anthropic_api_key not in vault"); final = fallback(rule.bias, rule.strategy, "model_unavailable", input); }
        else {
          try {
            const { output, latencyMs, lengthNote } = await askModel(apiKey, withInstructions(system), input, schema, LIMITS.open);
            const g = applyRiskLimits(String(output.strategy), { vix, dte });
            final = {
              agent_strategy: g.strategy, agent_bias: output.bias, confidence: output.confidence,
              reasoning: `${output.view} ${output.reasoning}`.trim(), invalidation: output.invalidation,
              agrees_with_rules: rule.strategy != null ? g.strategy === rule.strategy : null, guardrail_applied: [g.guardrail, lengthNote].filter(Boolean).join("; ") || null,
              inputs: input, raw_output: output, latency_ms: latencyMs,
            };
          } catch (e) { skipped.push(`${instrument} open model: ${e}`); final = fallback(rule.bias, rule.strategy, `model_error: ${String(e).slice(0, 120)}`, input); }
        }
        await upsert({ instrument, rule_bias: rule.bias, rule_strategy: rule.strategy, ...final });
      }
    }

    // ------------------------------------------------------------------ mid
    if (phase === "mid") {
      if (!checkpoint) return new Response(JSON.stringify({ ok: false, error: "mid phase needs checkpoint" }), { status: 400 });
      const [{ data: mid }, { data: morning }, { data: earlier }, { data: trades }] = await Promise.all([
        admin.from("midmarket_snapshot").select("*").eq("trade_date", tradeDate).eq("checkpoint", checkpoint).maybeSingle(),
        admin.from("agent_calls").select("instrument, agent_strategy, agent_bias, confidence, reasoning, invalidation, rule_strategy, raw_output").eq("trade_date", tradeDate).eq("phase", "open"),
        admin.from("agent_calls").select("instrument, checkpoint, action, agent_strategy, reasoning, invalidation, raw_output").eq("trade_date", tradeDate).eq("phase", "mid").lt("checkpoint", checkpoint).order("checkpoint"),
        admin.from("auto_trades").select("instrument, strategy, source, state, outcome, entry_premium, target_price_cons, stop_price_cons, target_price_aggr, stop_price_aggr, exit_reason").eq("trade_date", tradeDate),
      ]);
      if (!mid) return new Response(JSON.stringify({ ok: false, phase, error: `no midmarket_snapshot for ${tradeDate}/${checkpoint}` }), { status: 200 });
      const vix = mid.india_vix != null ? Number(mid.india_vix) : (pm.india_vix != null ? Number(pm.india_vix) : null);

      for (const instrument of ["NIFTY", "SENSEX"] as Instrument[]) {
        const s = instrument.toLowerCase();
        const call = (morning ?? []).find((m: any) => m.instrument === instrument) ?? null;
        const rule = shadow(mid, s, true);
        const dte = pm[`days_to_expiry_${s}`] != null ? Number(pm[`days_to_expiry_${s}`]) : null;

        // State carried across checkpoints (this is what makes 10:30 -> 2:30 one continuous day rather
        // than five cold reads). The view is "active" from the morning call until an exit; "exited"
        // after an exit; "out" if the morning was No Trade. An "enter" at any checkpoint makes it
        // active again with that checkpoint's invalidation as the live one.
        const priorCps = (earlier ?? []).filter((c: any) => c.instrument === instrument);
        let state: "active" | "exited" | "out" = call && call.agent_strategy && call.agent_strategy !== "No Trade" ? "active" : "out";
        let live: { strategy: string | null; invalidation: string | null; level: number | null; direction: string | null } = {
          strategy: call?.agent_strategy ?? null, invalidation: call?.invalidation ?? null,
          level: call?.raw_output?.invalidation_level ?? null, direction: call?.raw_output?.invalidation_direction ?? null,
        };
        for (const c of priorCps) {
          if (c.action === "exit") { state = "exited"; live = { ...live, strategy: "No Trade" }; }
          else if (c.action === "enter") { state = "active"; live = { strategy: c.agent_strategy, invalidation: c.invalidation, level: c.raw_output?.invalidation_level ?? null, direction: c.raw_output?.invalidation_direction ?? null }; }
          else if (c.action === "adjust") { live = { ...live, strategy: c.agent_strategy }; }
        }
        // Deterministic invalidation check: the code compares spot to the stored level so the model is
        // told the answer instead of being asked to do the comparison in prose.
        const spotNow = mid[`spot_${s}`] != null ? Number(mid[`spot_${s}`]) : null;
        const invalidationHit = state === "active" && spotNow != null && live.level != null && live.direction
          ? (live.direction === "above" ? spotNow > live.level : spotNow < live.level)
          : null;

        const input = {
          instrument, checkpoint,
          state: {
            view: state, live_strategy: live.strategy,
            invalidation: live.invalidation, invalidation_level: live.level, invalidation_direction: live.direction,
            invalidation_hit: invalidationHit,
            earlier_checkpoints_today: priorCps.map((c: any) => ({ checkpoint: c.checkpoint, action: c.action, strategy: c.agent_strategy })),
          },
          now: {
            spot: mid[`spot_${s}`], intraday_change_pct: mid[`intraday_change_pct_${s}`],
            pcr: mid[`pcr_${s}_mid`], max_pain: mid[`max_pain_${s}_mid`], atm_iv: mid[`atm_iv_${s}_mid`],
            atm_straddle: mid[`atm_straddle_price_${s}_mid`], vix, dte,
          },
          morning: {
            open_row: pick(pm, ["prev_close_" + s, "gap_points_" + s, "oi_support_" + s, "oi_resistance_" + s, "oi_change_support_" + s, "oi_change_resistance_" + s, "max_pain_" + s, "pcr_" + s, "atm_iv_" + s, "event_today"]),
            my_view: call ? { strategy: call.agent_strategy, bias: call.agent_bias, confidence: call.confidence, reasoning: call.reasoning, invalidation: call.invalidation } : null,
          },
          paper_trades: (trades ?? []).filter((t: any) => t.instrument === instrument),
        };
        const schema = {
          type: "object", required: ["action", "strategy", "confidence", "reasoning"],
          properties: {
            action: { type: "string", enum: ["hold", "adjust", "exit", "enter", "stay_out"] },
            strategy: { type: "string", enum: [...STRATEGIES], description: "The strategy that should be on after this action. Same as the live view for hold; No Trade for exit/stay_out; the new structure for enter/adjust." },
            confidence: { type: "string", enum: ["high", "medium", "low"] },
            reasoning: { type: "string", description: "At most 35 words, 2 sentences. First: the invalidation result exactly as given in state.invalidation_hit. Second: the one thing that matters now. No score arithmetic." },
            invalidation: { type: ["string", "null"], description: "Required for enter or adjust: the new invalidation sentence. null otherwise." },
            invalidation_level: { type: ["number", "null"] },
            invalidation_direction: { type: ["string", "null"], enum: ["above", "below", null] },
          },
        };
        const system = `${SYSTEM_COMMON}\n\nPhase: MID-MARKET checkpoint ${checkpoint} for ${instrument}. You are managing your own day, not re-making it.
state.view tells you where you are: "active" (a view is on: state.live_strategy), "exited" (you already exited
earlier today -- see earlier_checkpoints_today), or "out" (the morning was No Trade).
state.invalidation_hit is computed for you from spot versus your stored level: true means your invalidation
has been hit, false means it has not, null means the invalidation was not a price level and you judge it.
Allowed actions by state: active -> hold, adjust, exit. exited or out -> stay_out, or enter only for a
genuinely new setup with its own invalidation (never to resume the exited view).
hold = the thesis stands. adjust = same direction, change structure. exit = thesis broken or target
reached. A bias flip on one checkpoint is not by itself a reason to exit; a flip plus the invalidation is.`;

        let final: Record<string, unknown>;
        if (!apiKey) { skipped.push("anthropic_api_key not in vault"); final = { ...fallback(rule.bias, rule.strategy, "model_unavailable", input), action: "hold" }; }
        else {
          try {
            const { output, latencyMs, lengthNote } = await askModel(apiKey, withInstructions(system), input, schema, LIMITS.mid);
            const g = applyRiskLimits(String(output.strategy), { vix, dte });
            // State rules, enforced in code after the model answers.
            let action: string = output.action;
            let strategy: Strategy = g.strategy;
            const notes: string[] = [g.guardrail, lengthNote].filter((x): x is string => !!x);
            if (state !== "active" && (action === "hold" || action === "adjust" || action === "exit")) {
              action = "stay_out"; strategy = "No Trade"; notes.push(`view is ${state}: ${output.action} not allowed, coerced to stay_out`);
            }
            if (state === "active" && invalidationHit === true && action === "hold") {
              action = "exit"; strategy = "No Trade"; notes.push(`invalidation level ${live.level} (${live.direction}) hit at spot ${spotNow}: hold coerced to exit`);
            }
            if (action === "exit" || action === "stay_out") strategy = "No Trade";
            if (action === "hold") strategy = (live.strategy as Strategy) ?? strategy;
            final = {
              action, agent_strategy: strategy, agent_bias: call?.agent_bias ?? null, confidence: output.confidence,
              reasoning: output.reasoning,
              invalidation: action === "enter" || action === "adjust" ? (output.invalidation ?? live.invalidation) : (action === "hold" ? live.invalidation : null),
              agrees_with_rules: rule.strategy != null ? strategy === rule.strategy : null, guardrail_applied: notes.length ? notes.join("; ") : null,
              inputs: input, raw_output: output, latency_ms: latencyMs,
            };
          } catch (e) { skipped.push(`${instrument} mid model: ${e}`); final = { ...fallback(rule.bias, rule.strategy, `model_error: ${String(e).slice(0, 120)}`, input), action: "hold" }; }
        }
        await upsert({ instrument, rule_bias: rule.bias, rule_strategy: rule.strategy, ...final });
      }
    }

    // ------------------------------------------------------------------ post-close
    if (phase === "post-close") {
      const [{ data: post }, { data: calls }, { data: mids }, { data: trades }] = await Promise.all([
        admin.from("postmarket_summary").select("*").eq("trade_date", tradeDate).maybeSingle(),
        admin.from("agent_calls").select("instrument, phase, checkpoint, action, agent_strategy, agent_bias, confidence, reasoning, invalidation, rule_strategy, rule_bias, agrees_with_rules").eq("trade_date", tradeDate).in("phase", ["open", "mid"]),
        admin.from("midmarket_snapshot").select("checkpoint, market_bias_nifty_mid, market_bias_sensex_mid, spot_nifty, spot_sensex").eq("trade_date", tradeDate),
        admin.from("auto_trades").select("instrument, strategy, source, outcome, exit_reason, entry_premium, exit_premium, ambiguous_resolution").eq("trade_date", tradeDate),
      ]);
      if (!post) return new Response(JSON.stringify({ ok: false, phase, error: `no postmarket_summary for ${tradeDate}` }), { status: 200 });

      for (const instrument of ["NIFTY", "SENSEX"] as Instrument[]) {
        const s = instrument.toLowerCase();
        const open = (calls ?? []).find((c: any) => c.instrument === instrument && c.phase === "open") ?? null;
        const midCalls = (calls ?? []).filter((c: any) => c.instrument === instrument && c.phase === "mid").sort((a: any, b: any) => a.checkpoint.localeCompare(b.checkpoint));
        const input = {
          instrument,
          morning: {
            open_row: pick(pm, ["gap_points_" + s, "prev_close_" + s, "oi_support_" + s, "oi_resistance_" + s, "max_pain_" + s, "pcr_" + s, "atm_iv_" + s, "event_today"]),
            my_view: open ? { strategy: open.agent_strategy, bias: open.agent_bias, confidence: open.confidence, reasoning: open.reasoning, invalidation: open.invalidation } : null,
            rule_engine_shadow: { bias: open?.rule_bias ?? pm[`market_bias_${s}`] ?? null, strategy: open?.rule_strategy ?? pm[`suggested_strategy_${s}`] ?? null },
          },
          checkpoints: (mids ?? []).map((m: any) => ({ checkpoint: m.checkpoint, rule_bias: m[`market_bias_${s}_mid`], spot: m[`spot_${s}`] })).sort((a: any, b: any) => String(a.checkpoint).localeCompare(String(b.checkpoint))),
          agent_mid_actions: midCalls.map((c: any) => ({ checkpoint: c.checkpoint, action: c.action, strategy: c.agent_strategy, reasoning: c.reasoning })),
          close: pick(post, ["close_" + s, "day_high_" + s, "day_low_" + s, "day_change_pct_" + s, "target_hit_" + s, "sl_hit_" + s, "outcome_note_" + s, "recap_story_" + s]),
          paper_trades: (trades ?? []).filter((t: any) => t.instrument === instrument),
        };
        const schema = {
          type: "object", required: ["grade", "rules_grade", "misleading_signal", "lesson", "reasoning"],
          properties: {
            grade: { type: "string", enum: ["right", "partial", "wrong", "no_call"], description: "Grade of the AGENT's morning call against what the day did and the paper trade outcome." },
            rules_grade: { type: "string", enum: ["right", "partial", "wrong", "no_call"], description: "Same grade for the RULE ENGINE's morning strategy." },
            misleading_signal: { type: "string", description: "The input name alone, 1-4 words, or exactly 'none'. Not a sentence." },
            lesson: { type: "string", description: "ONE sentence, at most 22 words: the transferable rule, not today's story. Fed into tomorrow's context." },
            reasoning: { type: "string", description: "At most 50 words, 3 sentences, plain language." },
          },
        };
        const system = `${SYSTEM_COMMON}\n\nPhase: POST-CLOSE. Grade your own morning view for ${instrument} (morning.my_view) honestly, and separately grade the rule engine's shadow answer (morning.rule_engine_shadow) the same way. 'right' means the direction and
structure would have paid (target hit, or day closed the way the call needed). 'partial' means direction
right but structure or timing wrong, or a conservative target only. 'wrong' means the invalidation was hit
or the stop was hit. 'no_call' means the morning was No Trade -- then grade whether staying out was correct.
The lesson must be about a pattern in the inputs, not about today's specific prices -- it is what you will read tomorrow morning.`;

        if (!apiKey) { skipped.push("anthropic_api_key not in vault"); continue; }
        try {
          const { output, latencyMs, lengthNote } = await askModel(apiKey, withInstructions(system), input, schema, LIMITS["post-close"]);
          await upsert({
            instrument, rule_bias: open?.rule_bias ?? pm[`market_bias_${s}`] ?? null, rule_strategy: open?.rule_strategy ?? pm[`suggested_strategy_${s}`] ?? null,
            agent_strategy: open?.agent_strategy ?? null, agent_bias: open?.agent_bias ?? null,
            grade: output.grade, misleading_signal: output.misleading_signal, lesson: output.lesson, reasoning: output.reasoning,
            agrees_with_rules: open?.agrees_with_rules ?? null, guardrail_applied: lengthNote,
            inputs: input, raw_output: output, latency_ms: latencyMs,
          });
        } catch (e) { skipped.push(`${instrument} post-close model: ${e}`); }
      }
    }

    return new Response(JSON.stringify({ ok: true, phase, checkpoint, tradeDate, written, skipped }), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e), skipped }), { status: 500 });
  }
});

// When the model is unavailable the row still gets written with the rule engine's own answer, so the
// dashboard and the scoreboard never have a hole -- they just show agrees_with_rules = true and why.
function fallback(ruleBias: string | null, ruleStrategy: string | null, guardrail: string, input: unknown) {
  return {
    agent_strategy: ruleStrategy, agent_bias: ruleBias, confidence: "low",
    reasoning: "Rule engine answer carried through; the intelligence layer was unavailable for this run.",
    invalidation: null, agrees_with_rules: true, guardrail_applied: guardrail, inputs: input, raw_output: null, latency_ms: null,
  };
}
