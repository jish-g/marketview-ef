-- index_candles: one-minute OHLC for the two index spots, the series behind the Chart screen.
--
-- Written only by the index-candle-sync Edge Function (service role), which reads Zerodha Kite
-- Connect's historical API. The browser never holds a Kite credential -- it reads this table with
-- the publishable key and subscribes to Realtime for the bars that land during the session.
--
-- Deliberately NOT stored on premarket_dashboard/midmarket_snapshot: those are one row per day (or
-- per checkpoint) of *derived* readings, and a candle series is neither. Keeping it separate means
-- the chart can be re-backfilled from Kite at any time without touching a row the agent has read.
--
-- bucket is the candle's opening instant in UTC (Kite returns +0530; the function converts). The
-- primary key is (instrument, bucket) so a re-fetch of the same minute is an upsert, not a
-- duplicate -- the forming candle is rewritten every minute until the minute closes.

create table if not exists public.index_candles (
  instrument   text        not null check (instrument in ('NIFTY', 'SENSEX')),
  bucket       timestamptz not null,
  trade_date   date        not null,

  open         numeric     not null,
  high         numeric     not null,
  low          numeric     not null,
  close        numeric     not null,

  updated_at   timestamptz not null default now(),

  primary key (instrument, bucket)
);

-- The only query the chart makes: one instrument, one session, in time order.
create index if not exists index_candles_session_idx
  on public.index_candles (instrument, trade_date, bucket);

alter table public.index_candles enable row level security;

-- Readable by anon AND authenticated, deliberately -- NOT the "to authenticated" posture
-- agent_calls uses.
--
-- This app talks to two different Supabase projects: auth lives in the project behind
-- lib/supabase/auth-client.ts, and market data lives here, read through
-- lib/supabase/client.ts. A session established against the auth project is not a session
-- against this one, so every dashboard query against these tables arrives as `anon` however
-- signed-in the person is. A "to authenticated" policy on this table would not secure it --
-- it would simply make the chart permanently empty, with no error to explain why.
--
-- This matches the posture lib/supabase/client.ts documents for the market-data tables:
-- "exposed to `anon` with RLS restricted to SELECT only -- no writes, no migrations."
-- Which is sound for this content: index OHLC is public exchange data, and the write path
-- stays closed (no insert/update policies -- only the service role Edge Function writes).
drop policy if exists "index_candles read for signed-in users" on public.index_candles;
drop policy if exists "index_candles read" on public.index_candles;
create policy "index_candles read"
  on public.index_candles for select
  to anon, authenticated
  using (true);

-- Realtime: the chart subscribes to this table so bars appear as the Edge Function writes them,
-- rather than the browser polling Supabase every minute on top of the function polling Kite.
-- Guarded because adding a table already in the publication raises.
--
-- postgres_changes applies the same RLS as a REST read, which is the second reason the policy
-- above grants anon: an anon subscriber to a table only `authenticated` may select receives no
-- events, silently.
do $$
begin
  alter publication supabase_realtime add table public.index_candles;
exception
  when duplicate_object then null;
end
$$;

-- ---------------------------------------------------------------------------------------
-- pg_cron schedule (run once in the SQL editor after deploying the function).
-- Times are UTC; IST is UTC+5:30. The market session 09:15-15:30 IST is 03:45-10:00 UTC.
--
-- The function carries its own IST market-hours guard and no-ops outside the session, so the
-- hour range below is deliberately loose rather than split across three cron entries.
--
-- "backfill" runs once before the open and pulls the prior sessions in one call, so the chart
-- has context behind today's bars the moment the screen is opened. It is also the heal path:
-- re-run it by hand with a larger "days" after any outage.
-- ---------------------------------------------------------------------------------------
-- select cron.schedule('index-candles-backfill', '40 3 * * 1-5', $$select net.http_post(
--   url := 'https://<PROJECT_REF>.supabase.co/functions/v1/index-candle-sync',
--   headers := jsonb_build_object('Content-Type','application/json','x-cron-secret', public.get_vault_secret('edge_function_cron_secret')),
--   body := '{"mode":"backfill","days":5}'::jsonb) $$);
--
-- select cron.schedule('index-candles-session', '*/1 3-10 * * 1-5', $$select net.http_post(
--   url := 'https://<PROJECT_REF>.supabase.co/functions/v1/index-candle-sync',
--   headers := jsonb_build_object('Content-Type','application/json','x-cron-secret', public.get_vault_secret('edge_function_cron_secret')),
--   body := '{"mode":"session"}'::jsonb) $$);

-- kite_session: the daily access_token the function's own TOTP login produces, cached so a
-- minutely invocation reuses today's login instead of re-authenticating with Kite every minute
-- (which would be both slow and the kind of pattern that gets an account flagged). One row per
-- IST day; the function upserts it after every fresh login.
create table if not exists public.kite_session (
  trade_date   date primary key,
  access_token text        not null,
  created_at   timestamptz not null default now()
);
alter table public.kite_session enable row level security;
-- No select/insert/update policy for anon or authenticated -- only the service role (Edge
-- Function) ever touches this table. A live access_token is a bearer credential for the whole
-- Kite account and must never be readable from the browser.

-- candle_sync_runs: one sanitized row per function run, so the outcome is inspectable with the
-- publishable key even when the pg_net/cron caller timed out before the function returned. Holds
-- counts and skip REASONS only -- never a token, cookie, raw Kite body, or redirect URL. Readable
-- by anon so the operator (and Claude) can confirm a run without Edge Function logs.
create table if not exists public.candle_sync_runs (
  id          bigint generated always as identity primary key,
  run_at      timestamptz not null default now(),
  mode        text,
  ok          boolean,
  written     jsonb,
  skipped     jsonb,
  reason      text,
  range_from  text,
  range_to    text
);
create index if not exists candle_sync_runs_run_at_idx on public.candle_sync_runs (run_at desc);
alter table public.candle_sync_runs enable row level security;
drop policy if exists "candle_sync_runs read" on public.candle_sync_runs;
create policy "candle_sync_runs read" on public.candle_sync_runs
  for select to anon, authenticated using (true);
-- No insert/update policy: only the service role (Edge Function) writes.

-- Vault secrets the function reads (all five already present in this project's vault):
--   kite_user_id, kite_password, kite_totp_secret  -- the login itself, run by the function
--   kite_api_key, kite_api_secret                  -- the Kite Connect app's own credentials
-- ---------------------------------------------------------------------------------------
