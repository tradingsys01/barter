-- supabase/migrations/0016_chat_email_notifications.sql
-- Per-side "we already emailed about unread messages" flags on chats,
-- and a per-user opt-out for chat email notifications.
--
-- Gate semantics: when email_pending_<side> is true, sendMessage's
-- maybeSendChatEmail will SKIP sending. markChatRead clears the flag
-- when the recipient opens the chat, re-arming the gate for the next
-- new message.

alter table public.chats
  add column if not exists email_pending_initiator boolean not null default false,
  add column if not exists email_pending_owner     boolean not null default false;

-- Per-user preference. Default true (opt-out, not opt-in). Lives on the
-- private users table — NOT exposed via public_users view (which has an
-- explicit column whitelist). Only the user themselves (RLS) and our
-- service-role notify code can read it.
alter table public.users
  add column if not exists notify_chat_email boolean not null default true;

notify pgrst, 'reload schema';
