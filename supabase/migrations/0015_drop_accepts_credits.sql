-- supabase/migrations/0015_drop_accepts_credits.sql
-- Removes the unbuilt community-credits feature.
-- See docs/superpowers/specs/2026-05-09-remove-community-credits-design.md
alter table public.listings drop column accepts_credits;
