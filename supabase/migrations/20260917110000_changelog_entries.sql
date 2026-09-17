-- Public changelog: what changed on MarketCue, and a visible daily "we are up to date" signal
-- for search and AI crawlers. Two kinds of row share one table:
--   'feature'  -- a real product change, added by hand (no admin UI yet -- insert directly).
--   'daily'    -- one automated row per IST trading day, written by global-context-sync right
--                 after it archives that day's global_cues_daily row, so the page's content
--                 changes every single day without any manual step.

create table if not exists public.changelog_entries (
  id          bigint      generated always as identity primary key,
  entry_date  date        not null,
  kind        text        not null default 'daily',  -- 'feature' | 'daily'
  title       text        not null,
  body        text        not null,
  created_at  timestamptz not null default now()
);
create index if not exists changelog_entries_date_idx on public.changelog_entries (entry_date desc, created_at desc);
-- At most one automated 'daily' row per IST trading day -- the edge function checks before
-- inserting, and this is the backstop against a race producing two.
create unique index if not exists changelog_entries_one_daily_per_date on public.changelog_entries (entry_date) where kind = 'daily';

alter table public.changelog_entries enable row level security;
drop policy if exists "changelog_entries read" on public.changelog_entries;
create policy "changelog_entries read" on public.changelog_entries for select to anon, authenticated using (true);

-- Seed a few real entries so the page has genuine history immediately, not just from tomorrow.
insert into public.changelog_entries (entry_date, kind, title, body) values
  ('2026-09-16', 'feature', 'Global -> India intelligence engine', 'Launched the deterministic Global -> India scoring engine: 25 free market instruments plus India''s own breadth, flows and options data, scored into Global and India verdicts, a transmission read, and a regime call. A language model only explains the numbers in plain English -- it never computes them.'),
  ('2026-09-16', 'feature', 'Narrative fact-checking gate', 'Every explanation the engine writes is now checked in two stages before it publishes: a deterministic check that every figure and direction matches the underlying data, then a second model that verifies each claim individually. A paragraph that fails either check falls back to a plain computed sentence instead of publishing something wrong.'),
  ('2026-09-17', 'feature', 'Public Global cues pages', 'Global cues today is now public, no sign-in required: a live read of how world markets are shaping Indian equities, plus one permanent page per trading day so every day''s read stays a citable, addressable page.')
on conflict do nothing;
