-- oi_snapshot_log: high-frequency (1-min) option-chain summary history for NIFTY and SENSEX.
--
-- Written only by the oi-snapshot-log Edge Function (service role), a new isolated function that
-- calls Upstox's option-chain API on its own schedule. It reads no table market-data-sync writes
-- and market-data-sync reads no table this writes -- the two pipelines never touch. This is
-- deliberate: market-data-sync's premarket/open/mid checkpoints are read by the Verdict/dashboard
-- screens and must keep working exactly as-is; this table exists purely to give the Chart screen
-- a dense OI history to later plot ("OI over time"), something the once-per-checkpoint tables
-- can't support.
--
-- One row per (instrument, captured_at) -- a growing history, not an upsert-in-place snapshot like
-- premarket_dashboard. Summary fields only (PCR, max pain, OI support/resistance, ATM IV/greeks)
-- -- the same shape market-data-sync's `mid` phase already computes -- not the full per-strike
-- chain. At 1-min cadence across a ~6.25h session this is ~750 rows/day (2 instruments), trivial
-- to store; a full per-strike log would be a different, much larger feature and is out of scope
-- here.

create table if not exists public.oi_snapshot_log (
  instrument              text        not null check (instrument in ('NIFTY', 'SENSEX')),
  captured_at             timestamptz not null,
  trade_date              date        not null,

  expiry                  date        not null,
  dte                     integer     not null,
  spot                    numeric,
  atm_strike              numeric,

  pcr                     numeric,
  max_pain                numeric,
  atm_iv                  numeric,
  straddle_price          numeric,
  straddle_delta          numeric,
  straddle_theta          numeric,

  oi_support              numeric,
  oi_resistance           numeric,
  oi_support_change       text,
  oi_resistance_change    text,

  primary key (instrument, captured_at)
);

-- The only query this table needs: one instrument, one session, in time order.
create index if not exists oi_snapshot_log_session_idx
  on public.oi_snapshot_log (instrument, trade_date, captured_at);

alter table public.oi_snapshot_log enable row level security;

-- Same posture as index_candles: this app's market-data reads all arrive as `anon` (auth is a
-- separate Supabase project from market data -- see lib/supabase/client.ts), so a
-- "to authenticated" policy would just leave the table permanently unreadable rather than secure
-- it. Read-only exchange-derived data, no write policy -- only the service-role function writes.
drop policy if exists "oi_snapshot_log read" on public.oi_snapshot_log;
create policy "oi_snapshot_log read"
  on public.oi_snapshot_log for select
  to anon, authenticated
  using (true);

-- ---------------------------------------------------------------------------------------
-- pg_cron schedule (run once in the SQL editor after deploying the function).
-- Times are UTC; IST is UTC+5:30. The market session 09:15-15:30 IST is 03:45-10:00 UTC.
--
-- The function carries its own IST market-hours guard and no-ops outside the session, so the
-- hour range below is deliberately loose (matches index-candles-session's pattern) rather than
-- split across three cron entries.
-- ---------------------------------------------------------------------------------------
-- select cron.schedule('oi-snapshot-log-session', '*/1 3-10 * * 1-5', $$select net.http_post(
--   url := 'https://<PROJECT_REF>.supabase.co/functions/v1/oi-snapshot-log',
--   headers := jsonb_build_object('Content-Type','application/json','x-cron-secret', public.get_vault_secret('edge_function_cron_secret')),
--   body := '{}'::jsonb) $$);

-- ---------------------------------------------------------------------------------------
-- Vault secrets the function expects (both already exist -- reused, not duplicated):
--   edge_function_cron_secret  -- same cron auth every other function uses
--   upstox_analytics_token     -- same Upstox token market-data-sync already uses
-- ---------------------------------------------------------------------------------------
