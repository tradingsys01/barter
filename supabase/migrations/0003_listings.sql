-- supabase/migrations/0003_listings.sql
-- Listings core tables.

create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  icon        text,                       -- emoji or icon-set key
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now()
);

create type listing_type   as enum ('offer_goods', 'offer_service', 'want');
create type listing_status as enum ('active', 'reserved', 'completed', 'archived');

create table public.listings (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null references public.users(id) on delete cascade,
  type              listing_type not null,
  title             text not null,
  slug              text not null,
  description       text,
  category_id       uuid references public.categories(id) on delete set null,
  area_id           uuid references public.areas(id) on delete set null,
  wants_text        text,                 -- "what I'd swap for", free text
  accepts_credits   boolean not null default false,
  status            listing_status not null default 'active',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  expires_at        timestamptz
);

create index listings_owner_idx     on public.listings(owner_id);
create index listings_category_idx  on public.listings(category_id);
create index listings_area_idx      on public.listings(area_id);
create index listings_status_idx    on public.listings(status);
create index listings_created_idx   on public.listings(created_at desc);

create table public.listing_images (
  id          uuid primary key default gen_random_uuid(),
  listing_id  uuid not null references public.listings(id) on delete cascade,
  path        text not null,              -- object path in Storage bucket "listings"
  alt_text    text,
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now()
);

create index listing_images_listing_idx on public.listing_images(listing_id);

-- Keep updated_at fresh.
create or replace function public.tg_listings_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger listings_set_updated_at
  before update on public.listings
  for each row execute function public.tg_listings_set_updated_at();
