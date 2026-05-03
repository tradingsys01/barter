insert into public.areas (slug, name, sort_order) values
  ('quathiaski-cove', 'Quathiaski Cove', 10),
  ('heriot-bay',      'Heriot Bay',       20),
  ('cape-mudge',      'Cape Mudge',       30),
  ('granite-bay',     'Granite Bay',      40),
  ('we-wai-kai',      'We Wai Kai',       50),
  ('whaletown',       'Whaletown',        60)
on conflict (slug) do nothing;
