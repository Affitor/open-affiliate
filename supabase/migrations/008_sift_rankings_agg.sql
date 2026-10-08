-- One-query rollup for /rankings Reviews / Quality / Posts.
-- LANGUAGE sql (not plpgsql): the request path used to page every scored
-- social_items row in JS (~10s cold). This is the same aggregate in Postgres.

create or replace function public.sift_rankings_agg()
returns table (
  slug text,
  verified_content integer,
  total_content integer,
  avg_sift_score numeric,
  top_tag text,
  top_platform text
)
language sql
stable
as $$
  select
    program_slug as slug,
    count(*) filter (where sift_score >= 7)::integer as verified_content,
    count(*)::integer as total_content,
    round(avg(sift_score)::numeric, 1) as avg_sift_score,
    mode() within group (order by coalesce(sift_tag, 'untagged')) as top_tag,
    mode() within group (order by platform) as top_platform
  from social_items
  where sift_score is not null
    and program_slug is not null
  group by program_slug
$$;

revoke all on function public.sift_rankings_agg() from public;
grant execute on function public.sift_rankings_agg() to service_role;

create index if not exists idx_social_items_sift_program
  on social_items (program_slug)
  where sift_score is not null;
