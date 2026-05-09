-- supabase/migrations/0018_listings_fts.sql
-- Full-text search on listings.
--
-- Why: search uses ILIKE %q% on title/description, which is pure substring
-- match. "excavation" never matches a listing titled "excavator" because
-- one string isn't a substring of the other. Switching to a tsvector with
-- the 'english' config gives us Snowball stemming, so both words reduce
-- to the stem "excavat" and match in either direction.
--
-- Title is weighted A (highest), description B, so a hit in the title
-- ranks higher when we order by ts_rank.
--
-- The column is STORED GENERATED, so it stays in sync automatically on
-- insert/update with no trigger to maintain.

alter table public.listings
  add column if not exists search_tsv tsvector
  generated always as (
    setweight(to_tsvector('english', coalesce(title, '')),       'A') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'B')
  ) stored;

create index if not exists listings_search_tsv_idx
  on public.listings using gin (search_tsv);

notify pgrst, 'reload schema';
