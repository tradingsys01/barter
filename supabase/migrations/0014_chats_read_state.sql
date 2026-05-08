-- supabase/migrations/0014_chats_read_state.sql
-- Per-side last-read timestamps so we can show an unread-message badge.

alter table public.chats
  add column initiator_last_read_at timestamptz not null default now(),
  add column owner_last_read_at     timestamptz not null default now();

-- Backfill: assume every existing chat is fully read so we don't badge
-- old conversations after upgrade.
update public.chats
   set initiator_last_read_at = last_message_at,
       owner_last_read_at     = last_message_at;

-- Replace the existing chat-bumping trigger with one that ALSO advances
-- the sender's last_read_at — so a user's own outgoing message never
-- shows as unread to themselves.
create or replace function public.tg_messages_bump_chat()
returns trigger language plpgsql as $$
begin
  update public.chats
     set last_message_at = new.created_at,
         initiator_last_read_at = case
           when initiator_id = new.sender_id then new.created_at
           else initiator_last_read_at
         end,
         owner_last_read_at = case
           when owner_id = new.sender_id then new.created_at
           else owner_last_read_at
         end
   where id = new.chat_id;
  return new;
end $$;
