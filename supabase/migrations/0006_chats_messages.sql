-- supabase/migrations/0006_chats_messages.sql
-- Chats: one row per (listing, initiator) pair. Owner is denormalized
-- so we can list "my chats" without joining listings.

create table public.chats (
  id              uuid primary key default gen_random_uuid(),
  listing_id      uuid not null references public.listings(id) on delete cascade,
  initiator_id    uuid not null references public.users(id) on delete cascade,
  owner_id        uuid not null references public.users(id) on delete cascade,
  last_message_at timestamptz not null default now(),
  created_at      timestamptz not null default now()
);

create unique index chats_listing_initiator_uniq on public.chats(listing_id, initiator_id);
create index chats_initiator_idx on public.chats(initiator_id);
create index chats_owner_idx     on public.chats(owner_id);
create index chats_last_msg_idx  on public.chats(last_message_at desc);

create table public.messages (
  id          uuid primary key default gen_random_uuid(),
  chat_id     uuid not null references public.chats(id) on delete cascade,
  sender_id   uuid not null references public.users(id) on delete cascade,
  body        text not null,
  created_at  timestamptz not null default now()
);

create index messages_chat_idx       on public.messages(chat_id);
create index messages_chat_created   on public.messages(chat_id, created_at);

-- Bump chats.last_message_at whenever a message is inserted.
create or replace function public.tg_messages_bump_chat()
returns trigger language plpgsql as $$
begin
  update public.chats
     set last_message_at = new.created_at
   where id = new.chat_id;
  return new;
end $$;

create trigger messages_bump_chat
  after insert on public.messages
  for each row execute function public.tg_messages_bump_chat();
