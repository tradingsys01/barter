-- supabase/migrations/0008_trades_ratings.sql
-- Trades: created when one party clicks "Mark done". Lifecycle:
--   pending  -> completed   (other party confirms)
--   pending  -> cancelled   (other party cancels)
-- Disputed and credit-ledger transfer are deferred to later plans.

create type trade_status as enum ('pending', 'completed', 'cancelled');

create table public.trades (
  id              uuid primary key default gen_random_uuid(),
  chat_id         uuid not null references public.chats(id) on delete cascade,
  listing_id      uuid not null references public.listings(id) on delete cascade,
  party_a         uuid not null references public.users(id) on delete cascade,   -- the marker
  party_b         uuid not null references public.users(id) on delete cascade,   -- the confirmer
  status          trade_status not null default 'pending',
  created_at      timestamptz not null default now(),
  completed_at    timestamptz,
  cancelled_at    timestamptz
);

create index trades_chat_idx       on public.trades(chat_id);
create index trades_party_a_idx    on public.trades(party_a);
create index trades_party_b_idx    on public.trades(party_b);
create index trades_status_idx     on public.trades(status);

-- At most one pending trade per chat.
create unique index trades_one_pending_per_chat
  on public.trades(chat_id) where status = 'pending';

create table public.ratings (
  id          uuid primary key default gen_random_uuid(),
  trade_id    uuid not null references public.trades(id) on delete cascade,
  rater_id    uuid not null references public.users(id) on delete cascade,
  ratee_id    uuid not null references public.users(id) on delete cascade,
  stars       int  not null check (stars between 1 and 5),
  comment     text check (char_length(comment) <= 500),
  created_at  timestamptz not null default now()
);

create unique index ratings_trade_rater_uniq on public.ratings(trade_id, rater_id);
create index ratings_ratee_idx on public.ratings(ratee_id);
