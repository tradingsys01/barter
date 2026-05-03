-- supabase/migrations/0004_listings_rls.sql
-- RLS for listings + listing_images + categories.

alter table public.categories     enable row level security;
alter table public.listings       enable row level security;
alter table public.listing_images enable row level security;

-- Categories: public reference data.
create policy "categories readable by anyone"
  on public.categories for select using (true);

-- Listings:
-- Anyone can read active listings (powers the public feed + LLM/SEO crawlers).
-- Owners can read their own regardless of status.
create policy "listings public read active"
  on public.listings for select using (status = 'active');

create policy "listings owner read all"
  on public.listings for select using (auth.uid() = owner_id);

create policy "listings owner insert"
  on public.listings for insert with check (auth.uid() = owner_id);

create policy "listings owner update"
  on public.listings for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- Soft-delete only via update (status='archived'); no hard DELETE from clients.
-- (No DELETE policy = denied by default.)

-- Listing images: public read for active listings, owner write.
create policy "listing_images public read active"
  on public.listing_images for select using (
    exists (
      select 1 from public.listings l
       where l.id = listing_images.listing_id
         and l.status = 'active'
    )
  );

create policy "listing_images owner read all"
  on public.listing_images for select using (
    exists (
      select 1 from public.listings l
       where l.id = listing_images.listing_id
         and l.owner_id = auth.uid()
    )
  );

create policy "listing_images owner insert"
  on public.listing_images for insert with check (
    exists (
      select 1 from public.listings l
       where l.id = listing_images.listing_id
         and l.owner_id = auth.uid()
    )
  );

create policy "listing_images owner update"
  on public.listing_images for update using (
    exists (
      select 1 from public.listings l
       where l.id = listing_images.listing_id
         and l.owner_id = auth.uid()
    )
  );

create policy "listing_images owner delete"
  on public.listing_images for delete using (
    exists (
      select 1 from public.listings l
       where l.id = listing_images.listing_id
         and l.owner_id = auth.uid()
    )
  );
