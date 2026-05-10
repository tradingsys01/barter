-- supabase/migrations/0019_more_areas.sql
-- Add more Quadra Island locations and a "no location" option for users
-- who prefer not to disclose where on the island they are.
--
-- Names are kept short for the dropdown; the long-form ("Rebecca Spit
-- Marine Provincial Park", "Main Lakes Chain Provincial Park") would
-- crowd the UI.

insert into public.areas (slug, name, sort_order) values
  ('bold-point',       'Bold Point',         70),
  ('rebecca-spit',     'Rebecca Spit',       80),
  ('gowlland-harbour', 'Gowlland Harbour',   90),
  ('main-lakes-chain', 'Main Lakes Chain',  100),
  ('open-bay',         'Open Bay',          110),
  ('surge-narrows',    'Surge Narrows',     120),
  ('no-location',      'No location',       999)
on conflict (slug) do nothing;

notify pgrst, 'reload schema';
