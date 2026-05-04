-- supabase/migrations/0011_public_users_view.sql
-- Public-safe view of users. Exposes only fields fit for any viewer.
-- Email and banned_at remain hidden (those stay behind self-read RLS on
-- public.users).

create or replace view public.public_users with (security_invoker = on) as
select
  id,
  display_name,
  avatar_url,
  bio,
  area_id,
  created_at
from public.users;

-- security_invoker=on means the view runs with the CALLER's permissions,
-- not the view-owner's. Combined with our explicit grant below, anyone
-- (anon or authed) can SELECT but RLS on the underlying table still
-- applies to other operations.

-- Grant SELECT to anon + authenticated.
grant select on public.public_users to anon, authenticated;

-- Allow PostgREST to surface the view via the relationship hint
-- "public_users:owner_id" in embedded selects.
comment on view public.public_users is
  'Public-safe profile fields. Used by anon-readable surfaces (listings, chats, ratings).';
