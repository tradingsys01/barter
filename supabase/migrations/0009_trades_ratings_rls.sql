-- supabase/migrations/0009_trades_ratings_rls.sql
-- Trades: visible to + writable by the two parties.
-- Ratings: anyone can read; only the rater (a party of the trade) can insert.

alter table public.trades  enable row level security;
alter table public.ratings enable row level security;

create policy "trades: party read"
  on public.trades for select
  using (auth.uid() = party_a or auth.uid() = party_b);

create policy "trades: party insert"
  on public.trades for insert
  with check (auth.uid() = party_a);

create policy "trades: party update"
  on public.trades for update
  using (auth.uid() = party_a or auth.uid() = party_b)
  with check (auth.uid() = party_a or auth.uid() = party_b);

-- Ratings are public so they can be aggregated for any user's profile.
create policy "ratings: public read"
  on public.ratings for select using (true);

-- Only the rater themselves can write the rating row, and only for a trade
-- they're a party of, and only if the trade is completed.
create policy "ratings: rater insert"
  on public.ratings for insert
  with check (
    auth.uid() = rater_id
    and exists (
      select 1 from public.trades t
       where t.id = ratings.trade_id
         and t.status = 'completed'
         and (auth.uid() = t.party_a or auth.uid() = t.party_b)
    )
  );

-- No UPDATE / DELETE on ratings — ratings are immutable.
