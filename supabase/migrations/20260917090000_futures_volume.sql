-- Futures candles with volume, alongside the index candles.
--
-- Nifty and Sensex are indices: their one-minute candles carry no volume, so nothing on the chart
-- can be volume-weighted. The current-month NIFTY / SENSEX futures track the index within a few
-- points and do carry volume, and their VWAP is what index traders actually watch. index-candle-sync
-- now fetches them alongside the index each minute and writes them here under their own instrument
-- names (NIFTY_FUT, SENSEX_FUT), so every existing NIFTY / SENSEX row, query, RLS policy and
-- Realtime filter is untouched.

alter table public.index_candles add column if not exists volume bigint;

-- Which contract is "current month" for each underlying, resolved from Kite's instrument list by
-- the sync function and refreshed the first run after an expiry. prev_token keeps the contract
-- that just expired so a backfill can read the days before the rollover.
create table if not exists public.futures_contracts (
  instrument       text primary key,           -- NIFTY_FUT | SENSEX_FUT
  underlying       text not null,              -- NIFTY | SENSEX
  exchange         text not null,              -- NFO | BFO
  tradingsymbol    text not null,
  instrument_token bigint not null,
  expiry           date not null,
  prev_token       bigint,
  updated_at       timestamptz not null default now()
);
alter table public.futures_contracts enable row level security;
-- No anon / authenticated policy: only the service role (the Edge Function) reads or writes it.

-- Futures rows use their own instrument names (NIFTY_FUT, SENSEX_FUT); the original check
-- constraint only allowed the two index names.
alter table public.index_candles drop constraint if exists index_candles_instrument_check;
alter table public.index_candles add constraint index_candles_instrument_check
  check (instrument = any (array['NIFTY', 'SENSEX', 'NIFTY_FUT', 'SENSEX_FUT']));
