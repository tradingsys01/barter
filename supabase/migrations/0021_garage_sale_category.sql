-- supabase/migrations/0021_garage_sale_category.sql
-- Add a "Garage sale" category for mass-clearance posts (someone emptying
-- a garage or shed, multiple items in one listing).
--
-- Sort order 90 places it between "Services" (80) and "Other" (99).

insert into public.categories (slug, name, icon, sort_order) values
  ('garage-sale', 'Garage sale', '🏷️', 90)
on conflict (slug) do nothing;

notify pgrst, 'reload schema';
