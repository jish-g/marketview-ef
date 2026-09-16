-- market_snapshots + global_context: the time series and the calculated state behind the
-- Global View screen (GlobalCue/News tab).
--
-- Written only by the global-context-sync Edge Function (service role), which pulls the full
-- basket in supabase/functions/global-context-sync/intelligence/config.ts from Yahoo Finance's free chart
-- endpoint, runs the deterministic engine in engine.ts, and appends one global_context row per
-- run. Nothing here touches market-data-sync or any row the trading agent reads.

-- One row per (asset, source_ts): an unchanged quote (closed market) is an upsert, not a new
-- row, so the table grows only when a price actually moves. source_ts is the exchange's own
-- quote time; ingested_at is when we fetched it. Both are kept so freshness is honest.
create table if not exists public.market_snapshots (
  asset        text        not null,             -- Yahoo symbol
  source_ts    timestamptz not null,
  label        text        not null,
  cue_group    text        not null,
  price        numeric     not null,
  change_pct   numeric,
  source       text        not null default 'yahoo',
  ingested_at  timestamptz not null default now(),
  primary key (asset, source_ts)
);
create index if not exists market_snapshots_latest_idx on public.market_snapshots (asset, source_ts desc);
create index if not exists market_snapshots_ingested_idx on public.market_snapshots (ingested_at desc);

-- Append-only calculated state. The screen reads the newest row; history is kept so the
-- sentiment path over a day can be charted later and the engine's changes can be back-tested.
create table if not exists public.global_context (
  id                 bigserial primary key,
  calculated_at      timestamptz not null default now(),
  data_as_of         timestamptz,                 -- newest source_ts among the inputs
  global_score       numeric     not null,
  global_band        text        not null,
  india_score        numeric     not null,
  india_band         text        not null,
  transmission_label text        not null,
  transmission_tone  text        not null,
  regime             text        not null,
  confidence         text        not null,        -- High | Medium | Low
  confidence_detail  jsonb       not null default '{}'::jsonb,
  global_drivers     jsonb       not null default '[]'::jsonb,
  india_drivers      jsonb       not null default '[]'::jsonb,
  channels           jsonb       not null default '[]'::jsonb,
  counterforces      jsonb       not null default '[]'::jsonb,
  what_is_driving    jsonb       not null default '[]'::jsonb,
  explanation        text        not null,
  inputs             jsonb       not null default '{}'::jsonb   -- every quote and India reading used, for traceability
);
create index if not exists global_context_latest_idx on public.global_context (calculated_at desc);

alter table public.market_snapshots enable row level security;
alter table public.global_context enable row level security;

-- Same read posture as index_candles / global_cues: dashboard reads arrive as anon.
drop policy if exists "market_snapshots read" on public.market_snapshots;
create policy "market_snapshots read" on public.market_snapshots for select to anon, authenticated using (true);
drop policy if exists "global_context read" on public.global_context;
create policy "global_context read" on public.global_context for select to anon, authenticated using (true);

-- ---------------------------------------------------------------------------------------
-- pg_cron (run once in the SQL editor after deploying the function). Times are UTC.
-- Every 15 min from 07:00 to 16:30 IST on weekdays (01:30-11:00 UTC), hourly otherwise so the
-- overnight global picture stays current before the Indian pre-market.
-- ---------------------------------------------------------------------------------------
-- select cron.schedule('global-context-session', '*/15 1-10 * * 1-5', $$select net.http_post(
--   url := 'https://<PROJECT_REF>.supabase.co/functions/v1/global-context-sync',
--   headers := jsonb_build_object('Content-Type','application/json','x-cron-secret', get_vault_secret('edge_function_cron_secret')),
--   body := '{}'::jsonb, timeout_milliseconds := 60000) $$);
-- select cron.schedule('global-context-hourly', '0 11-23,0 * * *', $$select net.http_post(
--   url := 'https://<PROJECT_REF>.supabase.co/functions/v1/global-context-sync',
--   headers := jsonb_build_object('Content-Type','application/json','x-cron-secret', get_vault_secret('edge_function_cron_secret')),
--   body := '{}'::jsonb, timeout_milliseconds := 60000) $$);
