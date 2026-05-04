-- supabase/migrations/0013_public_users_security_definer.sql
-- Fix: 0011 set security_invoker=on, which made the view inherit the
-- self-read-only RLS on public.users — defeating the whole point of a
-- "public" view. Switch to security_invoker=off (default) so the view
-- runs as its definer (postgres) and bypasses RLS. The view's column
-- whitelist still ensures email/banned_at never leak.

alter view public.public_users set (security_invoker = off);

notify pgrst, 'reload schema';
