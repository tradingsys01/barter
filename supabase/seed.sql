insert into public.areas (slug, name, sort_order) values
  ('quathiaski-cove', 'Quathiaski Cove', 10),
  ('heriot-bay',      'Heriot Bay',       20),
  ('cape-mudge',      'Cape Mudge',       30),
  ('granite-bay',     'Granite Bay',      40),
  ('we-wai-kai',      'We Wai Kai',       50),
  ('whaletown',       'Whaletown',        60)
on conflict (slug) do nothing;

insert into public.categories (slug, name, icon, sort_order) values
  ('food',     'Food',     '🥖', 10),
  ('crafts',   'Crafts',   '🧶', 20),
  ('tools',    'Tools',    '🛠️', 30),
  ('clothing', 'Clothing', '👕', 40),
  ('books',    'Books',    '📚', 50),
  ('garden',   'Garden',   '🌱', 60),
  ('outdoor',  'Outdoor',  '🏕️', 70),
  ('services', 'Services', '🔧', 80),
  ('other',    'Other',    '✳️', 99)
on conflict (slug) do nothing;
