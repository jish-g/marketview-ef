-- option_chain_snapshot: per-strike option-chain history for NIFTY and SENSEX, ATM +/- 20 strikes,
-- captured every 3 minutes during market hours.
--
-- Written only by the option-chain-snapshot-log Edge Function (service role), a new isolated
-- function that calls the same Upstox option-chain endpoint oi-snapshot-log already uses, but
-- keeps the full per-strike payload instead of collapsing it to chain-wide summaries (PCR, max
-- pain, OI support/resistance). Verified against a live Upstox response (2026-09-19) that every
-- strike -- ATM and far OTM alike -- carries the same market_data (ltp, volume, oi, prev_oi,
-- bid/ask) and option_greeks (delta, theta, gamma, vega, iv, pop) shape; nothing here is
-- extrapolated from an ATM-only assumption.
--
-- This is the data source behind two features, not one: Options Print (per-strike OI/volume) and
-- Greeks at a glance (per-strike delta/theta/gamma/vega) both read this same table -- Greeks
-- needed no separate pipeline once this exists.
--
-- Reads/writes nothing market-data-sync or oi-snapshot-log touch, and neither of those is
-- imported here -- same isolation posture as every other analytics addition in this project.

create table if not exists public.option_chain_snapshot (
  instrument     text        not null check (instrument in ('NIFTY', 'SENSEX')),
  captured_at    timestamptz not null,
  trade_date     date        not null,
  expiry         date        not null,
  strike         numeric     not null,

  ce_oi          numeric,
  ce_prev_oi     numeric,
  ce_volume      numeric,
  ce_ltp         numeric,
  ce_delta       numeric,
  ce_theta       numeric,
  ce_gamma       numeric,
  ce_vega        numeric,
  ce_iv          numeric,
  ce_pop         numeric,

  pe_oi          numeric,
  pe_prev_oi     numeric,
  pe_volume      numeric,
  pe_ltp         numeric,
  pe_delta       numeric,
  pe_theta       numeric,
  pe_gamma       numeric,
  pe_vega        numeric,
  pe_iv          numeric,
  pe_pop         numeric,

  primary key (instrument, captured_at, strike)
);

-- The only query this table needs: one instrument, one session, in time order, optionally
-- narrowed to a strike range around ATM.
create index if not exists option_chain_snapshot_session_idx
  on public.option_chain_snapshot (instrument, trade_date, captured_at);

alter table public.option_chain_snapshot enable row level security;

-- Same posture as index_candles / oi_snapshot_log: market-data reads in this app all arrive as
-- `anon` (auth is a separate Supabase project -- see lib/supabase/client.ts), so a
-- "to authenticated" policy would just leave the table permanently unreadable. Read-only
-- exchange-derived data -- only the service-role function writes.
drop policy if exists "option_chain_snapshot read" on public.option_chain_snapshot;
create policy "option_chain_snapshot read"
  on public.option_chain_snapshot for select
  to anon, authenticated
  using (true);

-- ---------------------------------------------------------------------------------------
-- pg_cron schedule (run once in the SQL editor after deploying the function).
-- Times are UTC; IST is UTC+5:30. The market session 09:15-15:30 IST is 03:45-10:00 UTC.
--
-- The function carries its own IST market-hours guard and no-ops outside the session, so the
-- hour range below is deliberately loose, same pattern as index-candles-session /
-- oi-snapshot-log-session.
-- ---------------------------------------------------------------------------------------
-- select cron.schedule('option-chain-snapshot-log-session', '*/3 3-10 * * 1-5', $$select net.http_post(
--   url := 'https://<PROJECT_REF>.supabase.co/functions/v1/option-chain-snapshot-log',
--   headers := jsonb_build_object('Content-Type','application/json','x-cron-secret', public.get_vault_secret('edge_function_cron_secret')),
--   body := '{}'::jsonb) $$);

-- ---------------------------------------------------------------------------------------
-- Vault secrets the function expects (both already exist -- reused, not duplicated):
--   edge_function_cron_secret  -- same cron auth every other function uses
--   upstox_analytics_token     -- same Upstox token market-data-sync / oi-snapshot-log already use
-- ---------------------------------------------------------------------------------------
