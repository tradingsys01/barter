-- supabase/migrations/0005_listings_storage.sql
-- Public bucket for listing photos. Path convention: "<listing_id>/<n>.<ext>".

insert into storage.buckets (id, name, public)
values ('listings', 'listings', true)
on conflict (id) do nothing;

-- Public read (already implied by bucket public=true, but explicit for clarity).
create policy "listings bucket: public read"
  on storage.objects for select
  using (bucket_id = 'listings');

-- Authed users can write only into a path whose first segment is a listing
-- they own.
create policy "listings bucket: owner insert"
  on storage.objects for insert
  with check (
    bucket_id = 'listings'
    and exists (
      select 1 from public.listings l
       where l.id::text = split_part(name, '/', 1)
         and l.owner_id = auth.uid()
    )
  );

create policy "listings bucket: owner update"
  on storage.objects for update
  using (
    bucket_id = 'listings'
    and exists (
      select 1 from public.listings l
       where l.id::text = split_part(name, '/', 1)
         and l.owner_id = auth.uid()
    )
  );

create policy "listings bucket: owner delete"
  on storage.objects for delete
  using (
    bucket_id = 'listings'
    and exists (
      select 1 from public.listings l
       where l.id::text = split_part(name, '/', 1)
         and l.owner_id = auth.uid()
    )
  );
