-- market_daily + market_events: daily history and quantitative events behind the Global View.
--
-- market_daily is the daily close series per basket instrument, backfilled from Yahoo's free
-- chart endpoint (6 months) the first time an asset has too little history, then appended by
-- every global-context-sync run from the same call that fetches the live quote. It feeds
-- momentum, realised volatility, z-scores, and the measured Nifty-vs-US correlation.
--
-- market_events is the primary intelligence object from the product spec. This migration
-- creates it with the full schema; phase 2a writes only category 'price_move' rows detected
-- quantitatively (a move beyond a configurable multiple of the instrument's own recent
-- volatility). News-derived events and event_sources come in the next phase and reuse it.

create table if not exists public.market_daily (
  asset        text        not null,
  day          date        not null,             -- exchange-local session date
  close        numeric     not null,
  change_pct   numeric,
  source       text        not null default 'yahoo',
  ingested_at  timestamptz not null default now(),
  primary key (asset, day)
);
create index if not exists market_daily_asset_day_idx on public.market_daily (asset, day desc);

create table if not exists public.market_events (
  id                bigserial primary key,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  event_time        timestamptz not null,
  dedupe_key        text        not null unique,   -- asset:day:direction for price moves
  category          text        not null,          -- 'price_move' now; 'macro','geopolitical',... later
  title             text        not null,
  summary           text        not null,
  affected_assets   jsonb       not null default '[]'::jsonb,
  market_direction  text        not null,          -- risk_on | risk_off | neutral
  global_relevance  numeric     not null,          -- 0..1
  india_relevance   numeric     not null,          -- 0..1
  confidence        numeric     not null,          -- 0..1
  india_impact      text        not null default '',
  why_it_matters    text        not null default '',
  sources           jsonb       not null default '[]'::jsonb,
  evidence          jsonb       not null default '{}'::jsonb,
  status            text        not null default 'active'  -- active | superseded | archived
);
create index if not exists market_events_time_idx on public.market_events (event_time desc);
create index if not exists market_events_relevance_idx on public.market_events (status, india_relevance desc, event_time desc);

-- global_context gains the measured transmission and per-asset stats for the screen.
alter table public.global_context add column if not exists measured jsonb not null default '{}'::jsonb;
alter table public.global_context add column if not exists asset_stats jsonb not null default '[]'::jsonb;

alter table public.market_daily enable row level security;
alter table public.market_events enable row level security;
drop policy if exists "market_daily read" on public.market_daily;
create policy "market_daily read" on public.market_daily for select to anon, authenticated using (true);
drop policy if exists "market_events read" on public.market_events;
create policy "market_events read" on public.market_events for select to anon, authenticated using (true);

-- Row count per asset, so the sync can decide per symbol whether to backfill. PostgREST cannot
-- GROUP BY, hence a tiny function. Service role only in practice (the function is the caller).
create or replace function public.market_daily_counts()
returns table (asset text, n bigint)
language sql stable as $$
  select asset, count(*) from public.market_daily group by asset
$$;
