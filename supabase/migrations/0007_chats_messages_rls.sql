-- supabase/migrations/0007_chats_messages_rls.sql
-- Only the two parties of a chat can see or write to it.

alter table public.chats    enable row level security;
alter table public.messages enable row level security;

create policy "chats: party read"
  on public.chats for select
  using (auth.uid() = initiator_id or auth.uid() = owner_id);

create policy "chats: initiator insert"
  on public.chats for insert
  with check (auth.uid() = initiator_id);

create policy "chats: party update"
  on public.chats for update
  using (auth.uid() = initiator_id or auth.uid() = owner_id)
  with check (auth.uid() = initiator_id or auth.uid() = owner_id);

-- Messages: read if you're a party of the chat, insert if you're a party
-- AND the sender is you.
create policy "messages: party read"
  on public.messages for select
  using (
    exists (
      select 1 from public.chats c
       where c.id = messages.chat_id
         and (auth.uid() = c.initiator_id or auth.uid() = c.owner_id)
    )
  );

create policy "messages: party insert"
  on public.messages for insert
  with check (
    auth.uid() = sender_id
    and exists (
      select 1 from public.chats c
       where c.id = messages.chat_id
         and (auth.uid() = c.initiator_id or auth.uid() = c.owner_id)
    )
  );

-- No UPDATE / DELETE on messages — they are immutable.
