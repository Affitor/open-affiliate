-- Social Listen raw data storage
-- Stores ALL fetched social items (not just the filtered top 11)
-- for future insights, trend analysis, and paid content discovery

create table social_items (
  id            bigint generated always as identity primary key,
  program_slug  text not null,
  platform      text not null check (platform in ('youtube', 'tiktok', 'x', 'reddit', 'blog')),
  title         text not null,
  url           text not null,
  thumbnail     text,
  author        text not null,
  views         bigint default 0,
  likes         bigint default 0,
  snippet       text,
  quality_score int default 0,
  published_at  timestamptz,
  fetched_at    timestamptz default now(),

  unique(url)
);

-- Query patterns: by program, by platform, by popularity, full-text search
create index idx_social_program on social_items(program_slug);
create index idx_social_platform on social_items(platform);
create index idx_social_views on social_items(views desc);
create index idx_social_fetched on social_items(fetched_at desc);
create index idx_social_program_platform on social_items(program_slug, platform);

-- Full-text search on title for content discovery
alter table social_items add column fts tsvector
  generated always as (to_tsvector('english', title || ' ' || coalesce(snippet, ''))) stored;
create index idx_social_fts on social_items using gin(fts);

-- RLS: public read, service role write
alter table social_items enable row level security;
create policy "Public read" on social_items for select using (true);
create policy "Service write" on social_items for insert with check (true);
create policy "Service update" on social_items for update using (true);
