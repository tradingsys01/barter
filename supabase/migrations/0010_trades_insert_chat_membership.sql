-- supabase/migrations/0010_trades_insert_chat_membership.sql
-- Tighten the trades insert RLS to also require the inserter to be a party
-- of the referenced chat. The action layer already enforces this; this is
-- defense in depth in case future code paths bypass the action.

drop policy "trades: party insert" on public.trades;

create policy "trades: party insert"
  on public.trades for insert
  with check (
    auth.uid() = party_a
    and exists (
      select 1 from public.chats c
       where c.id = trades.chat_id
         and (auth.uid() = c.initiator_id or auth.uid() = c.owner_id)
    )
  );
