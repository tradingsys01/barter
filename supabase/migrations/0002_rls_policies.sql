-- Row-level security so the anon key can't read everything.

alter table public.users enable row level security;
alter table public.areas enable row level security;

-- Areas are public reference data.
create policy "areas readable by anyone"
  on public.areas for select using (true);

-- A user row is readable by the user themselves. Public profile pages
-- get a separate sanitized view in a later plan.
create policy "users self-read"
  on public.users for select using (auth.uid() = id);

create policy "users self-insert"
  on public.users for insert with check (auth.uid() = id);

create policy "users self-update"
  on public.users for update using (auth.uid() = id) with check (auth.uid() = id);
