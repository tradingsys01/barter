-- Consolidate offer_goods and offer_service into just "offer"
-- This simplifies the listing type options for users.

-- 1. Rename old enum
alter type listing_type rename to listing_type_old;

-- 2. Create new enum with consolidated values
create type listing_type as enum ('offer', 'want');

-- 3. Update column: convert to text, update values, convert to new enum
alter table public.listings
  alter column type type text using type::text;

update public.listings
  set type = 'offer'
  where type in ('offer_goods', 'offer_service');

alter table public.listings
  alter column type type listing_type using type::listing_type;

-- 4. Drop old enum
drop type listing_type_old;

notify pgrst, 'reload schema';
