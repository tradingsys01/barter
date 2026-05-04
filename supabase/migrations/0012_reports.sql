-- supabase/migrations/0012_reports.sql
-- Reports: users flag listings, profiles, or messages. Reviewed by admins
-- (admin allowlist gates UI; SELECT here is gated by RLS to admin uids).

create type report_target as enum ('listing', 'user', 'message');
create type report_status as enum ('open', 'resolved', 'dismissed');

create table public.reports (
  id            uuid primary key default gen_random_uuid(),
  reporter_id   uuid not null references public.users(id) on delete cascade,
  target_type   report_target not null,
  target_id     uuid not null,
  reason        text not null check (char_length(reason) between 3 and 1000),
  status        report_status not null default 'open',
  created_at    timestamptz not null default now(),
  resolved_at   timestamptz,
  resolved_by   uuid references public.users(id) on delete set null
);

create index reports_status_idx       on public.reports(status);
create index reports_reporter_idx     on public.reports(reporter_id);
create index reports_target_idx       on public.reports(target_type, target_id);
create index reports_created_idx      on public.reports(created_at desc);

alter table public.reports enable row level security;

-- Reporter can insert their own reports.
create policy "reports: reporter insert"
  on public.reports for insert
  with check (auth.uid() = reporter_id);

-- Reporter can read their own reports (so the UI can show "you already reported this").
create policy "reports: reporter read own"
  on public.reports for select
  using (auth.uid() = reporter_id);

-- No public read; admin reads happen via the service role key (bypasses RLS).
-- We chose the service role pattern instead of a per-uid policy because there
-- is no `is_admin` flag on users; admins are gated at the action layer via
-- ADMIN_USER_IDS.

-- No UPDATE / DELETE policies — admins go through the service role.
