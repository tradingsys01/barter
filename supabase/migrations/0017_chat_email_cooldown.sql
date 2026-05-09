-- supabase/migrations/0017_chat_email_cooldown.sql
-- Switch chat-email gate from "first-unread boolean" to a cooldown timestamp.
--
-- Why: 0016's email_pending_<side> boolean was reset by every markChatRead
-- call. The 5s ChatPoller (components/chat/chat-poller.tsx) calls
-- router.refresh() which re-renders the chat page, which calls markChatRead
-- on every render. Result: while a recipient had the chat tab open, the
-- gate was cleared every 5s and every new message fired a fresh email.
--
-- New gate: send only if no email has gone out in the last
-- CHAT_EMAIL_COOLDOWN_MINUTES (default 15). markChatRead no longer touches
-- this column at all, so polling has zero effect on the gate.
--
-- Rollout: this migration ONLY adds the new columns. The old
-- email_pending_* columns stay in place (with their not-null defaults) so
-- the previous code version keeps reading without 500ing during the
-- rolling deploy. They can be dropped in a follow-up migration once
-- 0017's code has been live for a while.

alter table public.chats
  add column if not exists last_email_sent_at_initiator timestamptz,
  add column if not exists last_email_sent_at_owner     timestamptz;

notify pgrst, 'reload schema';
