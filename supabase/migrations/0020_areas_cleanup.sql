-- supabase/migrations/0020_areas_cleanup.sql
-- Tidy the areas list:
--   * drop 'whaletown' — Whaletown is on Cortes Island, not Quadra
--   * drop 'we-wai-kai' — the We Wai Kai Nation lives at Cape Mudge / Yaculta;
--                        having both rows split listings between aliases for
--                        the same place
--   * rename 'cape-mudge' display to "Cape Mudge / Yaculta" so the local
--                        Liǧwiłda'xw name is visible
--
-- Verified at write time: zero listings and zero users currently reference
-- 'whaletown' or 'we-wai-kai' on dev or prod, so the deletes don't strand
-- any FKs (which would otherwise be nulled by the ON DELETE SET NULL on
-- users.area_id and listings.area_id).

delete from public.areas where slug in ('whaletown', 'we-wai-kai');

update public.areas
   set name = 'Cape Mudge / Yaculta'
 where slug = 'cape-mudge';

notify pgrst, 'reload schema';
