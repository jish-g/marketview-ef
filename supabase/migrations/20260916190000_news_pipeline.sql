-- News pipeline: articles in, events out.
--
-- news_articles is every headline ingested from the provider layer (RSS today; Finnhub when a
-- key is in the vault), normalised and tagged with the market entities it mentions. Nothing here
-- is shown as-is; it is the raw material. cluster_key groups near-duplicate articles into one
-- candidate event. Articles with no market entity are stored and never analysed.
--
-- market_events (from the phase-2a migration) gains region + cluster_key so news-derived events
-- sit beside the quantitative price_move rows. event_sources links an event to the articles
-- behind it, so every card can list where it came from.

create table if not exists public.news_articles (
  url           text        primary key,
  provider      text        not null,             -- 'rss' | 'finnhub'
  source        text        not null,             -- outlet name
  region        text        not null,             -- 'global' | 'india' | 'official'
  kind          text        not null default 'wire', -- 'wire' | 'official'
  title         text        not null,
  summary       text,
  published_at  timestamptz,
  fetched_at    timestamptz not null default now(),
  entities      jsonb       not null default '[]'::jsonb,   -- [{key, label, assets:[], themes:[]}]
  relevance     numeric     not null default 0,             -- 0..1 from the entity pass
  cluster_key   text,
  analysed      boolean     not null default false
);
create index if not exists news_articles_pub_idx on public.news_articles (published_at desc);
create index if not exists news_articles_cluster_idx on public.news_articles (cluster_key);
create index if not exists news_articles_recent_idx on public.news_articles (fetched_at desc, relevance desc);

alter table public.market_events add column if not exists region text not null default 'global';
alter table public.market_events add column if not exists cluster_key text;
alter table public.market_events add column if not exists linked_move text;   -- dedupe_key of a price_move that confirms it
create index if not exists market_events_cluster_idx on public.market_events (cluster_key);

create table if not exists public.event_sources (
  event_id     bigint not null references public.market_events(id) on delete cascade,
  url          text   not null references public.news_articles(url) on delete cascade,
  primary key (event_id, url)
);

alter table public.news_articles enable row level security;
alter table public.event_sources enable row level security;
drop policy if exists "news_articles read" on public.news_articles;
create policy "news_articles read" on public.news_articles for select to anon, authenticated using (true);
drop policy if exists "event_sources read" on public.event_sources;
create policy "event_sources read" on public.event_sources for select to anon, authenticated using (true);

-- ---------------------------------------------------------------------------------------
-- pg_cron (run once after deploying news-sync). Times are UTC.
-- Every 5 minutes 06:00-23:00 IST (00:30-17:30 UTC), every 30 minutes otherwise.
-- ---------------------------------------------------------------------------------------
-- select cron.schedule('news-sync-day', '*/5 1-17 * * *', $$select net.http_post(
--   url := 'https://<PROJECT_REF>.supabase.co/functions/v1/news-sync',
--   headers := jsonb_build_object('Content-Type','application/json','x-cron-secret', get_vault_secret('edge_function_cron_secret')),
--   body := '{}'::jsonb, timeout_milliseconds := 90000) $$);
-- select cron.schedule('news-sync-night', '*/30 0,18-23 * * *', $$select net.http_post(
--   url := 'https://<PROJECT_REF>.supabase.co/functions/v1/news-sync',
--   headers := jsonb_build_object('Content-Type','application/json','x-cron-secret', get_vault_secret('edge_function_cron_secret')),
--   body := '{}'::jsonb, timeout_milliseconds := 90000) $$);
