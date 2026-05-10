insert into public.areas (slug, name, sort_order) values
  ('quathiaski-cove',  'Quathiaski Cove',       10),
  ('heriot-bay',       'Heriot Bay',            20),
  ('cape-mudge',       'Cape Mudge / Yaculta',  30),
  ('granite-bay',      'Granite Bay',           40),
  ('bold-point',       'Bold Point',            70),
  ('rebecca-spit',     'Rebecca Spit',          80),
  ('gowlland-harbour', 'Gowlland Harbour',      90),
  ('main-lakes-chain', 'Main Lakes Chain',     100),
  ('open-bay',         'Open Bay',             110),
  ('surge-narrows',    'Surge Narrows',        120),
  ('no-location',      'No location',          999)
on conflict (slug) do nothing;

insert into public.categories (slug, name, icon, sort_order) values
  ('food',     'Food',     '🥖', 10),
  ('crafts',   'Crafts',   '🧶', 20),
  ('tools',    'Tools',    '🛠️', 30),
  ('clothing', 'Clothing', '👕', 40),
  ('books',    'Books',    '📚', 50),
  ('garden',   'Garden',   '🌱', 60),
  ('outdoor',  'Outdoor',  '🏕️', 70),
  ('services',    'Services',    '🔧',   80),
  ('garage-sale', 'Garage sale', '🏷️',  90),
  ('other',       'Other',       '✳️',   99)
on conflict (slug) do nothing;
