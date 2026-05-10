-- User feedback and suggestions table

create table public.feedback (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.users(id) on delete set null,
  email       text,
  type        text not null check (type in ('bug', 'suggestion', 'other')),
  message     text not null,
  created_at  timestamptz not null default now()
);

create index feedback_created_idx on public.feedback(created_at desc);

-- RLS: anyone can insert, only admins can read
alter table public.feedback enable row level security;

create policy "Anyone can submit feedback"
  on public.feedback for insert
  with check (true);

notify pgrst, 'reload schema';
