-- global_cues + market_news: the two tables behind the GlobalCue/News screen.
--
-- Written only by the global-cues-fetch Edge Function (service role). Both sources are free and
-- keyless: Yahoo Finance's public chart endpoint for the overnight quote basket, and the public RSS
-- feeds of three Indian market desks for headlines. Nothing here touches market-data-sync,
-- premarket_dashboard or any row the agent reads -- the screen is display-only.
--
-- One row per (trade_date, symbol) so a re-run of the fetch on the same morning is an upsert.
-- change_pct is Yahoo's own regularMarketChangePercent (versus the prior close of that instrument),
-- not something recomputed here.

create table if not exists public.global_cues (
  trade_date   date        not null,
  symbol       text        not null,             -- Yahoo symbol, e.g. ES=F
  label        text        not null,             -- "S&P 500 futures"
  cue_group    text        not null,             -- 'us' | 'asia' | 'commodity' | 'fx' | 'rates'
  sort_order   int         not null default 0,
  last         numeric,
  change_pct   numeric,
  quote_time   timestamptz,                      -- Yahoo regularMarketTime
  fetched_at   timestamptz not null default now(),
  primary key (trade_date, symbol)
);

create table if not exists public.market_news (
  url          text        primary key,
  trade_date   date        not null,
  source       text        not null,             -- 'Economic Times' | 'Livemint' | 'NDTV Profit'
  title        text        not null,
  published_at timestamptz,
  fetched_at   timestamptz not null default now()
);

create index if not exists market_news_day_idx on public.market_news (trade_date, published_at desc);

alter table public.global_cues enable row level security;
alter table public.market_news enable row level security;

-- Same read posture as index_candles: every dashboard query arrives as `anon` (auth lives in the
-- other Supabase project), so a "to authenticated" policy would only make the screen empty.
-- Public quotes and public headlines, select-only, service role is the sole writer.
drop policy if exists "global_cues read" on public.global_cues;
create policy "global_cues read" on public.global_cues for select to anon, authenticated using (true);

drop policy if exists "market_news read" on public.market_news;
create policy "market_news read" on public.market_news for select to anon, authenticated using (true);

-- ---------------------------------------------------------------------------------------
-- pg_cron schedule (run once in the SQL editor after deploying the function). Times are UTC.
-- 08:30 IST = 03:00 UTC, before the 08:45 GIFT fetch and the 08:58 market-data-sync, so the
-- screen is populated when the pre-market routine starts. A second run at 09:05 IST refreshes
-- US futures and Asia after their own moves, and picks up the latest headlines.
-- ---------------------------------------------------------------------------------------
-- select cron.schedule('global-cues-0830', '0 3 * * 1-5', $$select net.http_post(
--   url := 'https://<PROJECT_REF>.supabase.co/functions/v1/global-cues-fetch',
--   headers := jsonb_build_object('Content-Type','application/json','x-cron-secret', public.get_vault_secret('edge_function_cron_secret')),
--   body := '{}'::jsonb) $$);
--
-- select cron.schedule('global-cues-0905', '35 3 * * 1-5', $$select net.http_post(
--   url := 'https://<PROJECT_REF>.supabase.co/functions/v1/global-cues-fetch',
--   headers := jsonb_build_object('Content-Type','application/json','x-cron-secret', public.get_vault_secret('edge_function_cron_secret')),
--   body := '{}'::jsonb) $$);
