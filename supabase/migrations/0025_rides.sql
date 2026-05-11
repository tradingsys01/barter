-- supabase/migrations/0025_rides.sql
-- Add rides category and ride-specific columns to listings.

-- Add rides category
INSERT INTO public.categories (slug, name, icon, sort_order)
VALUES ('rides', 'Rides', '🚗', 85)
ON CONFLICT (slug) DO NOTHING;

-- Add ride-specific columns (nullable, only used when category is rides)
ALTER TABLE public.listings
  ADD COLUMN route_from text REFERENCES public.areas(slug) ON DELETE SET NULL,
  ADD COLUMN route_to text REFERENCES public.areas(slug) ON DELETE SET NULL,
  ADD COLUMN schedule text,
  ADD COLUMN seats smallint CHECK (seats IS NULL OR (seats >= 1 AND seats <= 6)),
  ADD COLUMN gas_share boolean NOT NULL DEFAULT false;

-- Index for route filtering
CREATE INDEX listings_route_from_idx ON public.listings(route_from) WHERE route_from IS NOT NULL;
CREATE INDEX listings_route_to_idx ON public.listings(route_to) WHERE route_to IS NOT NULL;
