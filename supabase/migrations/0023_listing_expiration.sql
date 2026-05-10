-- Listing expiration: auto-set expires_at to 30 days from creation
-- and add trigger to set it on insert.

-- Set expires_at for existing active listings (30 days from now)
update public.listings
  set expires_at = now() + interval '30 days'
  where status = 'active' and expires_at is null;

-- Trigger to auto-set expires_at on insert
create or replace function public.tg_listings_set_expires_at()
returns trigger language plpgsql as $$
begin
  if new.expires_at is null then
    new.expires_at = now() + interval '30 days';
  end if;
  return new;
end $$;

create trigger listings_set_expires_at
  before insert on public.listings
  for each row execute function public.tg_listings_set_expires_at();

-- Index for efficient expiration queries
create index if not exists listings_expires_at_idx on public.listings(expires_at)
  where status = 'active';

notify pgrst, 'reload schema';
