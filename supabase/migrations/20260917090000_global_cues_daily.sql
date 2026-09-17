-- Public GlobalCue SEO pages: one permanent, indexable page per trading day.
--
-- global_context already gets a fresh row roughly every 15 minutes during the session --
-- too frequent to archive one-page-per-row without flooding the sitemap with near-duplicate
-- content. Instead, global-context-sync freezes exactly one row here per IST trading day, the
-- first time it runs after the Indian session has closed, using that run's own narrative. This
-- is the archive the public /global-cues-today/[date] pages read; the live /global-cues-today
-- page keeps reading global_context directly for "right now".

create table if not exists public.global_cues_daily (
  trade_date          date        primary key,
  slug                text        not null unique,      -- e.g. "16-september-2026"
  narrative           jsonb       not null,              -- the day's closing Narrative (summary/global/india/link)
  global_band         text        not null,
  india_band          text        not null,
  transmission_label  text        not null,
  regime              text        not null,
  calculated_at        timestamptz not null,              -- the global_context row this was frozen from
  created_at          timestamptz not null default now()
);
create index if not exists global_cues_daily_created_idx on public.global_cues_daily (created_at desc);

alter table public.global_cues_daily enable row level security;
drop policy if exists "global_cues_daily read" on public.global_cues_daily;
create policy "global_cues_daily read" on public.global_cues_daily for select to anon, authenticated using (true);
