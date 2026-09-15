-- agent_calls: the intelligence layer's output, one row per (day, phase, checkpoint, instrument).
-- The rule engine's own answer is stored alongside so rules-vs-agent hit-rate can be compared
-- from the same row. Written only by the market-intelligence Edge Function (service role);
-- readable by signed-in users, same posture as premarket_dashboard.

create table if not exists public.agent_calls (
  id                 bigint generated always as identity primary key,
  trade_date         date        not null,
  phase              text        not null check (phase in ('premarket', 'open', 'mid', 'post-close')),
  checkpoint         text        not null default '',          -- '' | '1030' | '1130' | '1230' | '1330' | '1430'
  instrument         text        not null check (instrument in ('NIFTY', 'SENSEX', 'BOTH')),

  -- what the rule engine said (copied from premarket_dashboard / midmarket_snapshot at call time)
  rule_bias          text,
  rule_strategy      text,

  -- what the agent said
  agent_bias         text,
  agent_strategy     text,                                    -- open/mid: strategy; premarket: null; post-close: null
  action             text,                                    -- mid only: hold | adjust | exit | enter | stay_out
  confidence         text check (confidence in ('high', 'medium', 'low')),
  reasoning          text,                                    -- 2-4 sentences, the "why"
  invalidation       text,                                    -- what would make this call wrong
  agrees_with_rules  boolean,                                 -- agent_strategy == rule_strategy
  guardrail_applied  text,                                    -- non-null if a hard rule overrode the model

  -- post-close only: the grade
  grade              text check (grade in ('right', 'partial', 'wrong', 'no_call')),
  misleading_signal  text,
  lesson             text,                                    -- one line, fed into the next morning's context

  inputs             jsonb,                                   -- exact structured input the model saw
  raw_output         jsonb,                                   -- exact structured output before guardrails
  model              text,
  latency_ms         integer,
  created_at         timestamptz not null default now(),

  unique (trade_date, phase, checkpoint, instrument)
);

create index if not exists agent_calls_date_idx on public.agent_calls (trade_date desc);

alter table public.agent_calls enable row level security;

drop policy if exists "agent_calls read for signed-in users" on public.agent_calls;
create policy "agent_calls read for signed-in users"
  on public.agent_calls for select
  to authenticated
  using (true);

-- No insert/update policies: only the service role (Edge Function) writes.

-- ---------------------------------------------------------------------------------------
-- pg_cron schedule (run once in the SQL editor after deploying the function).
-- Mirrors market-data-sync: fires ~2 min after each data phase so the row it reads exists.
-- Replace <PROJECT_REF> and rely on the same vault secret the data pipeline uses.
-- ---------------------------------------------------------------------------------------
-- select cron.schedule('agent-premarket',  '2 4 * * 1-5',  $$select net.http_post(
--   url := 'https://<PROJECT_REF>.supabase.co/functions/v1/market-intelligence',
--   headers := jsonb_build_object('Content-Type','application/json','x-cron-secret', public.get_vault_secret('edge_function_cron_secret')),
--   body := '{"phase":"premarket"}'::jsonb) $$);
-- select cron.schedule('agent-open',       '35 4 * * 1-5', $$ ... body := '{"phase":"open"}' ... $$);
-- select cron.schedule('agent-mid-1030',   '2 5 * * 1-5',  $$ ... body := '{"phase":"mid","checkpoint":"1030"}' ... $$);
-- select cron.schedule('agent-mid-1130',   '2 6 * * 1-5',  $$ ... body := '{"phase":"mid","checkpoint":"1130"}' ... $$);
-- select cron.schedule('agent-mid-1230',   '2 7 * * 1-5',  $$ ... body := '{"phase":"mid","checkpoint":"1230"}' ... $$);
-- select cron.schedule('agent-mid-1330',   '2 8 * * 1-5',  $$ ... body := '{"phase":"mid","checkpoint":"1330"}' ... $$);
-- select cron.schedule('agent-mid-1430',   '2 9 * * 1-5',  $$ ... body := '{"phase":"mid","checkpoint":"1430"}' ... $$);
-- select cron.schedule('agent-post-close', '20 10 * * 1-5',$$ ... body := '{"phase":"post-close"}' ... $$);
