# Quadra Barter — Interactions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire listings into a transactional flow — visitors offer a swap, both parties chat, mark the trade done, confirm, and rate each other.

**Architecture:** Postgres tables behind RLS for `chats`, `messages`, `trades`, `ratings`. Server actions handle every mutation; clients never bypass the action layer. Chat updates use **polling** (`router.refresh()` on a 5-second interval) — realtime is deferred to v1.5 per the spec. Trades follow a two-step pending → confirmed lifecycle; the second party either confirms or cancels. Ratings are one per (trade, rater).

**Tech Stack:** Next.js 16 App Router (RSC + server actions), TypeScript, Supabase (Postgres) via `@supabase/ssr`, Zod, Tailwind v4 + shadcn/ui, Vitest unit, Playwright e2e.

**Decisions baked in (call out before starting):**
- **Polling, not realtime.** Chat detail page is RSC; a small client poller calls `router.refresh()` every 5s. No Supabase Realtime channels in this plan. Per spec phasing, realtime upgrades belong to v1.5.
- **One chat per (listing, initiator).** Unique constraint prevents duplicates if a user re-clicks "Offer a swap". Re-clicks redirect to the existing chat.
- **Pre-filled greeting.** Creating a chat inserts an opening message: `"Hi {owner_name}, I'd like to swap for your listing \"{title}\"."`.
- **Trade lifecycle is pending → completed | cancelled.** Spec mentions "disputed" but that requires admin tools — defer to Plan 4. A trade is created when one party clicks "Mark trade done"; the other side either Confirms (→ completed) or Cancels (→ cancelled). One open (pending) trade per chat at a time.
- **No credits transfer in this plan.** Plan 2 already stores `accepts_credits` on listings, but the `credits_ledger` table and actual movement of credits is v2 territory. We just record the rating; no ledger writes.
- **Rating is optional and post-completion.** Both parties may rate the other once per completed trade (`unique(trade_id, rater_id)`). Stars 1–5; comment ≤ 500 chars.
- **Public profile rating summary** is computed live from `ratings` (no denormalization on `users`). Plan 4 will denormalize if perf demands.
- **No 14-day auto-confirm in this plan.** Manual confirm only for v1; auto-confirm is v1.5.

---

## File structure

**New files:**

Migrations:
- `supabase/migrations/0006_chats_messages.sql` — chats + messages tables, indexes, unique constraint
- `supabase/migrations/0007_chats_messages_rls.sql` — RLS policies
- `supabase/migrations/0008_trades_ratings.sql` — trades + ratings tables, indexes, unique constraint, enum
- `supabase/migrations/0009_trades_ratings_rls.sql` — RLS policies

App-layer modules:
- `lib/chat/validation.ts` — Zod schemas for `sendMessageSchema`
- `lib/chat/actions.ts` — server actions: `startChat(listingId)`, `sendMessage(form)`
- `lib/chat/queries.ts` — `listMyChats()`, `getChat(chatId)`, `getMessages(chatId)`
- `lib/trade/actions.ts` — server actions: `markTradeDone(form)`, `confirmTrade(form)`, `cancelTrade(form)`
- `lib/trade/queries.ts` — `getActiveTradeForChat(chatId)`, `getCompletedTradesForChat(chatId)`
- `lib/rating/validation.ts` — Zod schema for `rateTradeSchema`
- `lib/rating/actions.ts` — server action: `rateTrade(form)`
- `lib/rating/queries.ts` — `getRatingSummary(userId)`, `myRatingForTrade(tradeId, raterId)`

Components:
- `components/listings/offer-button.tsx` — client-rendered button posting to `startChat`
- `components/chat/message-list.tsx` — server component rendering messages
- `components/chat/send-message-form.tsx` — client component, autoresizing textarea, submits via `sendMessage` action
- `components/chat/chat-poller.tsx` — client component, calls `router.refresh()` every 5s
- `components/chat/trade-actions.tsx` — server component rendering "Mark trade done" / "Confirm" / "Cancel" buttons depending on state
- `components/chat/rating-form.tsx` — client component, 1–5 stars + comment, submits via `rateTrade`
- `components/chat/rating-summary.tsx` — server component, renders "★ 4.5 · 12 reviews"

Pages:
- `app/chats/page.tsx` — list of the current user's chats (sorted by `last_message_at`)
- `app/chats/[id]/page.tsx` — chat detail (server-rendered messages + send form + trade UI + rating prompt)

Modifications:
- `app/l/[id]/[slug]/page.tsx` — add `<OfferButton />` (only when signed-in viewer ≠ owner) and a small rating-summary line under the owner name
- `components/site-header.tsx` — add "Chats" link next to "Post" / "My account" (signed-in only)

Tests:
- `tests/unit/chat-validation.test.ts`
- `tests/unit/rating-validation.test.ts`
- `tests/unit/rating-summary.test.ts`
- `tests/e2e/chat-start.spec.ts` — visitor offers a swap, lands on chat
- `tests/e2e/chat-converse.spec.ts` — two-user conversation via two browsers
- `tests/e2e/trade-complete.spec.ts` — full happy path: chat → mark done → confirm → rate

---

## Task 1: Migration — chats + messages

**Files:**
- Create: `supabase/migrations/0006_chats_messages.sql`

- [ ] **Step 1: Write the migration**

```sql
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
```

- [ ] **Step 2: Apply**

```bash
docker exec -i supabase-db psql -U postgres -d postgres < supabase/migrations/0006_chats_messages.sql
```

Expected: no errors.

- [ ] **Step 3: Verify**

```bash
docker exec -i supabase-db psql -U postgres -d postgres -c "\d+ public.chats" | head -20
docker exec -i supabase-db psql -U postgres -d postgres -c "\d+ public.messages" | head -20
```

Both tables present with the expected columns.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0006_chats_messages.sql
git commit -m "feat(db): chats + messages tables"
```

---

## Task 2: Migration — RLS for chats + messages

**Files:**
- Create: `supabase/migrations/0007_chats_messages_rls.sql`

- [ ] **Step 1: Write the policies**

```sql
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
```

- [ ] **Step 2: Apply**

```bash
docker exec -i supabase-db psql -U postgres -d postgres < supabase/migrations/0007_chats_messages_rls.sql
```

Expected: no errors.

- [ ] **Step 3: Verify**

```bash
docker exec -i supabase-db psql -U postgres -d postgres -c \
  "select tablename, policyname from pg_policies where schemaname='public' and tablename in ('chats','messages') order by tablename, policyname;"
```

Should print 5 policies: 3 on chats, 2 on messages.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0007_chats_messages_rls.sql
git commit -m "feat(db): RLS policies for chats and messages"
```

---

## Task 3: Migration — trades + ratings

**Files:**
- Create: `supabase/migrations/0008_trades_ratings.sql`

- [ ] **Step 1: Write the migration**

```sql
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
```

- [ ] **Step 2: Apply**

```bash
docker exec -i supabase-db psql -U postgres -d postgres < supabase/migrations/0008_trades_ratings.sql
```

Expected: no errors.

- [ ] **Step 3: Verify**

```bash
docker exec -i supabase-db psql -U postgres -d postgres -c "\d+ public.trades"  | head -20
docker exec -i supabase-db psql -U postgres -d postgres -c "\d+ public.ratings" | head -20
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0008_trades_ratings.sql
git commit -m "feat(db): trades + ratings tables"
```

---

## Task 4: Migration — RLS for trades + ratings

**Files:**
- Create: `supabase/migrations/0009_trades_ratings_rls.sql`

- [ ] **Step 1: Write the policies**

```sql
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
```

- [ ] **Step 2: Apply**

```bash
docker exec -i supabase-db psql -U postgres -d postgres < supabase/migrations/0009_trades_ratings_rls.sql
```

Expected: no errors.

- [ ] **Step 3: Verify**

```bash
docker exec -i supabase-db psql -U postgres -d postgres -c \
  "select tablename, policyname from pg_policies where schemaname='public' and tablename in ('trades','ratings') order by tablename, policyname;"
```

Should print 5 policies (3 trades + 2 ratings).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0009_trades_ratings_rls.sql
git commit -m "feat(db): RLS policies for trades and ratings"
```

---

## Task 5: Zod validation — chat + rating

**Files:**
- Create: `lib/chat/validation.ts`
- Create: `lib/rating/validation.ts`
- Test: `tests/unit/chat-validation.test.ts`
- Test: `tests/unit/rating-validation.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// tests/unit/chat-validation.test.ts
import { describe, expect, it } from "vitest";
import { sendMessageSchema } from "@/lib/chat/validation";

describe("sendMessageSchema", () => {
  it("accepts a normal message", () => {
    const r = sendMessageSchema.safeParse({
      chat_id: "11111111-1111-1111-1111-111111111111",
      body: "Sounds good. Tomorrow at 4?",
    });
    expect(r.success).toBe(true);
  });

  it("rejects empty body", () => {
    const r = sendMessageSchema.safeParse({
      chat_id: "11111111-1111-1111-1111-111111111111",
      body: "   ",
    });
    expect(r.success).toBe(false);
  });

  it("rejects body over 4000 chars", () => {
    const r = sendMessageSchema.safeParse({
      chat_id: "11111111-1111-1111-1111-111111111111",
      body: "x".repeat(4001),
    });
    expect(r.success).toBe(false);
  });

  it("trims body", () => {
    const r = sendMessageSchema.safeParse({
      chat_id: "11111111-1111-1111-1111-111111111111",
      body: "  hello  ",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.body).toBe("hello");
  });
});
```

```ts
// tests/unit/rating-validation.test.ts
import { describe, expect, it } from "vitest";
import { rateTradeSchema } from "@/lib/rating/validation";

const validBase = {
  trade_id: "11111111-1111-1111-1111-111111111111",
  stars: 5,
  comment: "Easy swap, friendly.",
};

describe("rateTradeSchema", () => {
  it("accepts valid rating", () => {
    expect(rateTradeSchema.safeParse(validBase).success).toBe(true);
  });

  it("accepts no comment", () => {
    expect(rateTradeSchema.safeParse({ ...validBase, comment: undefined }).success).toBe(true);
  });

  it("rejects stars below 1", () => {
    expect(rateTradeSchema.safeParse({ ...validBase, stars: 0 }).success).toBe(false);
  });

  it("rejects stars above 5", () => {
    expect(rateTradeSchema.safeParse({ ...validBase, stars: 6 }).success).toBe(false);
  });

  it("rejects non-integer stars", () => {
    expect(rateTradeSchema.safeParse({ ...validBase, stars: 4.5 }).success).toBe(false);
  });

  it("rejects comment over 500 chars", () => {
    expect(rateTradeSchema.safeParse({ ...validBase, comment: "x".repeat(501) }).success).toBe(false);
  });

  it("rejects bad uuid", () => {
    expect(rateTradeSchema.safeParse({ ...validBase, trade_id: "nope" }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test:unit tests/unit/chat-validation.test.ts tests/unit/rating-validation.test.ts
```

Expected: FAIL — modules not found.

- [ ] **Step 3: Implement schemas**

```ts
// lib/chat/validation.ts
import { z } from "zod";

export const sendMessageSchema = z.object({
  chat_id: z.string().uuid(),
  body: z.string().trim().min(1, "Type something").max(4000, "Message is too long"),
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>;
```

```ts
// lib/rating/validation.ts
import { z } from "zod";

export const rateTradeSchema = z.object({
  trade_id: z.string().uuid(),
  stars: z.number().int().min(1).max(5),
  comment: z.string().trim().max(500).optional(),
});

export type RateTradeInput = z.infer<typeof rateTradeSchema>;
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test:unit tests/unit/chat-validation.test.ts tests/unit/rating-validation.test.ts
```

Expected: PASS, all cases.

- [ ] **Step 5: Commit**

```bash
git add lib/chat/validation.ts lib/rating/validation.ts \
        tests/unit/chat-validation.test.ts tests/unit/rating-validation.test.ts
git commit -m "feat(interactions): zod schemas for sendMessage + rateTrade"
```

---

## Task 6: Chat actions — startChat + sendMessage

**Files:**
- Create: `lib/chat/actions.ts`

This task creates server actions for chat. Both actions are async, server-only (`"use server"`), and follow the same pattern as listings actions: get user → validate → DB write → revalidate/redirect. We don't unit-test the actions themselves (they hit Supabase + auth context); rely on e2e in later tasks.

- [ ] **Step 1: Implement**

```ts
// lib/chat/actions.ts
"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { sendMessageSchema } from "@/lib/chat/validation";

/**
 * Open (or reopen) a chat between the current user and the listing owner.
 * Returns by redirecting to /chats/[chat_id].
 *
 * Idempotent: if a chat already exists for (listing, initiator), redirect to it
 * instead of creating a duplicate.
 */
export async function startChat(formData: FormData): Promise<void> {
  const user = await requireUser();
  const listingId = String(formData.get("listing_id") ?? "");
  if (!listingId) throw new Error("Missing listing_id");

  const supabase = await createClient();

  const { data: listing, error: lerr } = await supabase
    .from("listings")
    .select("id, owner_id, title, status, users:owner_id ( display_name )")
    .eq("id", listingId)
    .maybeSingle();
  if (lerr) throw new Error(lerr.message);
  if (!listing) throw new Error("Listing not found");
  if (listing.status !== "active") throw new Error("This listing is not accepting offers");
  if (listing.owner_id === user.id) throw new Error("You cannot chat with yourself");

  // Already have a chat? Use it.
  const { data: existing } = await supabase
    .from("chats")
    .select("id")
    .eq("listing_id", listingId)
    .eq("initiator_id", user.id)
    .maybeSingle();

  if (existing) redirect(`/chats/${existing.id}`);

  const { data: chat, error: cerr } = await supabase
    .from("chats")
    .insert({
      listing_id: listingId,
      initiator_id: user.id,
      owner_id: listing.owner_id,
    })
    .select("id")
    .single();
  if (cerr || !chat) throw new Error(cerr?.message ?? "Could not start chat");

  const ownerName = (listing as any).users?.display_name ?? "there";
  const greeting = `Hi ${ownerName}, I'd like to swap for your listing "${listing.title}".`;
  const { error: merr } = await supabase
    .from("messages")
    .insert({ chat_id: chat.id, sender_id: user.id, body: greeting });
  if (merr) throw new Error(merr.message);

  redirect(`/chats/${chat.id}`);
}

export async function sendMessage(formData: FormData): Promise<void> {
  const user = await requireUser();
  const parsed = sendMessageSchema.parse({
    chat_id: formData.get("chat_id"),
    body: formData.get("body"),
  });

  const supabase = await createClient();
  const { error } = await supabase
    .from("messages")
    .insert({ chat_id: parsed.chat_id, sender_id: user.id, body: parsed.body });
  if (error) throw new Error(error.message);

  revalidatePath(`/chats/${parsed.chat_id}`);
  revalidatePath("/chats");
}
```

- [ ] **Step 2: Type-check**

```bash
pnpm tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add lib/chat/actions.ts
git commit -m "feat(interactions): startChat + sendMessage server actions"
```

---

## Task 7: Chat queries

**Files:**
- Create: `lib/chat/queries.ts`

- [ ] **Step 1: Implement**

```ts
// lib/chat/queries.ts
import { createClient } from "@/lib/supabase/server";

export type ChatListItem = {
  id: string;
  listing_id: string;
  listing_title: string;
  listing_slug: string;
  cover_path: string | null;
  other_party: { id: string; display_name: string | null };
  last_message_at: string;
  last_message_preview: string | null;
};

export async function listMyChats(userId: string): Promise<ChatListItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("chats")
    .select(`
      id, listing_id, last_message_at, initiator_id, owner_id,
      listing:listing_id ( id, title, slug, listing_images ( path, sort_order ) ),
      initiator:initiator_id ( id, display_name ),
      owner:owner_id ( id, display_name ),
      messages ( body, created_at )
    `)
    .order("last_message_at", { ascending: false });
  if (error) throw error;

  return (data ?? []).map((row: any) => {
    const cover = (row.listing?.listing_images ?? [])
      .slice()
      .sort((a: any, b: any) => a.sort_order - b.sort_order)[0]?.path ?? null;

    const otherParty = row.initiator_id === userId ? row.owner : row.initiator;

    const lastMsg = (row.messages ?? [])
      .slice()
      .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];

    return {
      id: row.id,
      listing_id: row.listing_id,
      listing_title: row.listing?.title ?? "",
      listing_slug: row.listing?.slug ?? "",
      cover_path: cover,
      other_party: {
        id: otherParty?.id ?? "",
        display_name: otherParty?.display_name ?? null,
      },
      last_message_at: row.last_message_at,
      last_message_preview: lastMsg?.body ? lastMsg.body.slice(0, 80) : null,
    };
  });
}

export type ChatHeader = {
  id: string;
  listing: { id: string; title: string; slug: string; owner_id: string; cover_path: string | null };
  initiator: { id: string; display_name: string | null };
  owner: { id: string; display_name: string | null };
};

export async function getChat(chatId: string): Promise<ChatHeader | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("chats")
    .select(`
      id, initiator_id, owner_id,
      listing:listing_id ( id, title, slug, owner_id, listing_images ( path, sort_order ) ),
      initiator:initiator_id ( id, display_name ),
      owner:owner_id ( id, display_name )
    `)
    .eq("id", chatId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const cover = ((data as any).listing?.listing_images ?? [])
    .slice()
    .sort((a: any, b: any) => a.sort_order - b.sort_order)[0]?.path ?? null;

  return {
    id: data.id,
    listing: {
      id: (data as any).listing.id,
      title: (data as any).listing.title,
      slug: (data as any).listing.slug,
      owner_id: (data as any).listing.owner_id,
      cover_path: cover,
    },
    initiator: {
      id: (data as any).initiator.id,
      display_name: (data as any).initiator.display_name ?? null,
    },
    owner: {
      id: (data as any).owner.id,
      display_name: (data as any).owner.display_name ?? null,
    },
  };
}

export type Message = {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

export async function getMessages(chatId: string): Promise<Message[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("messages")
    .select("id, sender_id, body, created_at")
    .eq("chat_id", chatId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Message[];
}
```

- [ ] **Step 2: Type-check**

```bash
pnpm tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add lib/chat/queries.ts
git commit -m "feat(interactions): chat queries (listMyChats, getChat, getMessages)"
```

---

## Task 8: OfferButton + listing-detail integration + e2e

**Files:**
- Create: `components/listings/offer-button.tsx`
- Modify: `app/l/[id]/[slug]/page.tsx`
- Test: `tests/e2e/chat-start.spec.ts`

The OfferButton is a thin client/server form: `<form action={startChat}>` with a hidden `listing_id`. We render it ONLY when the viewer is signed in AND they are not the owner. For anonymous viewers, link to `/signin?next=/l/[id]/[slug]`. (The `next=` parameter handling is already wired in Plan 1; if not, the `next` query is ignored and the user lands on `/me` after sign-in — acceptable for v1.)

- [ ] **Step 1: Write the failing e2e**

```ts
// tests/e2e/chat-start.spec.ts
import { test, expect } from "@playwright/test";
import { signInViaMailpit } from "./helpers/auth";

test("a different user can offer a swap and lands on a chat", async ({ browser, request }) => {
  // User A: post a listing
  const ctxA = await browser.newContext();
  const pageA = await ctxA.newPage();
  await signInViaMailpit(pageA, request, "Owner Alice");

  await pageA.goto("/listings/new");
  await pageA.getByLabel(/type/i).selectOption("offer_goods");
  await pageA.getByLabel(/title/i).fill("Sourdough loaf");
  await pageA.locator("select[name=category_id]").selectOption({ label: "Food" });
  await pageA.locator("select[name=area_id]").selectOption({ label: "Quathiaski Cove" });
  await pageA.getByRole("button", { name: /publish/i }).click();
  await expect(pageA).toHaveURL(/\/l\/[0-9a-f-]+\/sourdough-loaf/);
  const listingUrl = pageA.url();

  // User B: visit the listing, click "Offer a swap"
  const ctxB = await browser.newContext();
  const pageB = await ctxB.newPage();
  await signInViaMailpit(pageB, request, "Buyer Bob");
  await pageB.goto(listingUrl);
  await pageB.getByRole("button", { name: /offer a swap/i }).click();
  await expect(pageB).toHaveURL(/\/chats\/[0-9a-f-]+/);
  await expect(pageB.getByText(/sourdough loaf/i)).toBeVisible();
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
pnpm test:e2e tests/e2e/chat-start.spec.ts
```

Expected: FAIL — no "Offer a swap" button.

- [ ] **Step 3: Implement OfferButton**

```tsx
// components/listings/offer-button.tsx
import Link from "next/link";
import { startChat } from "@/lib/chat/actions";

type Props = {
  listingId: string;
  listingSlug: string;
  /** undefined = anonymous viewer; null still means signed-in. */
  viewerId: string | undefined;
  ownerId: string;
};

export function OfferButton({ listingId, listingSlug, viewerId, ownerId }: Props) {
  if (!viewerId) {
    return (
      <Link
        href={`/signin?next=/l/${listingId}/${listingSlug}`}
        className="inline-block rounded bg-emerald-700 px-4 py-2 text-white"
      >
        Sign in to offer a swap
      </Link>
    );
  }
  if (viewerId === ownerId) return null;
  return (
    <form action={startChat}>
      <input type="hidden" name="listing_id" value={listingId} />
      <button
        type="submit"
        className="inline-block rounded bg-emerald-700 px-4 py-2 text-white"
      >
        Offer a swap
      </button>
    </form>
  );
}
```

- [ ] **Step 4: Wire it into the listing detail page**

In `app/l/[id]/[slug]/page.tsx`:

1. Add imports near the top:
   ```tsx
   import { OfferButton } from "@/components/listings/offer-button";
   import { getSessionUser } from "@/lib/auth";
   ```

2. Inside the component, after `const l = await getListing(id);`, add:
   ```tsx
   const viewer = await getSessionUser();
   ```

3. After the `<h1>{l.title}</h1>` JSX, add:
   ```tsx
   <div className="pt-2">
     <OfferButton
       listingId={l.id}
       listingSlug={l.slug}
       viewerId={viewer?.id}
       ownerId={l.owner.id}
     />
   </div>
   ```

- [ ] **Step 5: Run e2e**

```bash
pnpm test:e2e tests/e2e/chat-start.spec.ts
```

Expected: FAIL still — `/chats/[id]` doesn't exist yet (no page renders the listing title text). Look at the failure: if it's the URL assertion that fails, that's an OfferButton bug; fix it. If it's the listing-title-visible assertion, that's expected and Task 10 makes it pass.

If the failure is only "expect(getByText(/sourdough loaf/i)).toBeVisible()" → relax this assertion in the test for now (`await expect(pageB).toHaveURL(/\/chats\/[0-9a-f-]+/);` is sufficient) and add the title assertion back in Task 10's e2e instead.

- [ ] **Step 6: Run full e2e suite**

```bash
pnpm test:e2e
```

Expected: all green (with the relaxation above).

- [ ] **Step 7: Commit**

```bash
git add components/listings/offer-button.tsx app/l/[id]/[slug]/page.tsx tests/e2e/chat-start.spec.ts
git commit -m "feat(interactions): Offer a swap button + chat-start e2e"
```

---

## Task 9: /chats list page

**Files:**
- Create: `app/chats/page.tsx`
- Modify: `components/site-header.tsx` (add "Chats" link)

- [ ] **Step 1: Implement /chats**

```tsx
// app/chats/page.tsx
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { listMyChats } from "@/lib/chat/queries";
import { listingImageUrl } from "@/lib/img";

export const dynamic = "force-dynamic";
export const metadata = { title: "Chats — Quadra Barter" };

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export default async function ChatsPage() {
  const user = await requireUser();
  const chats = await listMyChats(user.id);

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-6">
      <h1 className="text-2xl font-semibold">Chats</h1>
      {chats.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-zinc-500">
          No conversations yet.
        </p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {chats.map((c) => (
            <li key={c.id}>
              <Link href={`/chats/${c.id}`} className="flex items-center gap-3 p-3 hover:bg-zinc-50">
                <div className="h-12 w-12 shrink-0 overflow-hidden rounded bg-zinc-100">
                  {c.cover_path && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={listingImageUrl(c.cover_path)} alt="" className="h-full w-full object-cover" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">{c.listing_title}</span>
                    <span className="shrink-0 text-xs text-zinc-500">{timeAgo(c.last_message_at)}</span>
                  </div>
                  <p className="truncate text-xs text-zinc-600">
                    {c.other_party.display_name ?? "Someone"}{" "}
                    {c.last_message_preview ? `· ${c.last_message_preview}` : ""}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Add "Chats" link to header**

Modify `components/site-header.tsx` — add a Chats link in the signed-in nav. Insert between "Post" and "My account":

```tsx
<Link href="/chats" className="text-zinc-700 hover:underline">Chats</Link>
```

- [ ] **Step 3: Smoke check**

Visit http://localhost:3000/chats while signed in — empty list page renders. Sign out and visit it — redirects to /signin.

```bash
curl -s -o /dev/null -w "/chats anon: %{http_code}\n" http://localhost:3000/chats
```

Expected: 307 (redirect).

- [ ] **Step 4: Commit**

```bash
git add app/chats/page.tsx components/site-header.tsx
git commit -m "feat(interactions): /chats list page + header link"
```

---

## Task 10: /chats/[id] detail page + send-message form

**Files:**
- Create: `app/chats/[id]/page.tsx`
- Create: `components/chat/message-list.tsx`
- Create: `components/chat/send-message-form.tsx`
- Test: `tests/e2e/chat-converse.spec.ts`

- [ ] **Step 1: Write the failing e2e**

```ts
// tests/e2e/chat-converse.spec.ts
import { test, expect } from "@playwright/test";
import { signInViaMailpit } from "./helpers/auth";

test("two users can exchange messages in a chat", async ({ browser, request }) => {
  const ctxA = await browser.newContext();
  const pageA = await ctxA.newPage();
  await signInViaMailpit(pageA, request, "Conv Alice");

  await pageA.goto("/listings/new");
  await pageA.getByLabel(/type/i).selectOption("offer_goods");
  await pageA.getByLabel(/title/i).fill("Carrots from the garden");
  await pageA.locator("select[name=category_id]").selectOption({ label: "Garden" });
  await pageA.locator("select[name=area_id]").selectOption({ label: "Quathiaski Cove" });
  await pageA.getByRole("button", { name: /publish/i }).click();
  await expect(pageA).toHaveURL(/\/l\/[0-9a-f-]+\/carrots-from-the-garden/);
  const listingUrl = pageA.url();

  const ctxB = await browser.newContext();
  const pageB = await ctxB.newPage();
  await signInViaMailpit(pageB, request, "Conv Bob");
  await pageB.goto(listingUrl);
  await pageB.getByRole("button", { name: /offer a swap/i }).click();
  await expect(pageB).toHaveURL(/\/chats\/[0-9a-f-]+/);

  // Bob sees the auto-greeting he sent.
  await expect(pageB.getByText(/i'd like to swap for your listing.*carrots/i)).toBeVisible();

  // Bob types a message.
  await pageB.getByLabel(/message/i).fill("How about Tuesday at 4?");
  await pageB.getByRole("button", { name: /send/i }).click();
  await expect(pageB.getByText(/tuesday at 4/i)).toBeVisible();

  // Alice opens the chat
  await pageA.goto("/chats");
  await pageA.getByRole("link", { name: /carrots from the garden/i }).click();
  await expect(pageA).toHaveURL(/\/chats\/[0-9a-f-]+/);
  await expect(pageA.getByText(/tuesday at 4/i)).toBeVisible();

  // Alice replies
  await pageA.getByLabel(/message/i).fill("Tuesday works.");
  await pageA.getByRole("button", { name: /send/i }).click();
  await expect(pageA.getByText(/tuesday works/i)).toBeVisible();
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
pnpm test:e2e tests/e2e/chat-converse.spec.ts
```

Expected: FAIL — `/chats/[id]` 404.

- [ ] **Step 3: Implement the message list component**

```tsx
// components/chat/message-list.tsx
import type { Message } from "@/lib/chat/queries";

export function MessageList({ messages, viewerId }: { messages: Message[]; viewerId: string }) {
  if (messages.length === 0) {
    return <p className="text-center text-sm text-zinc-500">No messages yet — say hi.</p>;
  }
  return (
    <ul className="space-y-2">
      {messages.map((m) => {
        const mine = m.sender_id === viewerId;
        return (
          <li key={m.id} className={mine ? "flex justify-end" : "flex justify-start"}>
            <div
              className={
                "max-w-[75%] whitespace-pre-line rounded-2xl px-3 py-2 text-sm " +
                (mine
                  ? "bg-emerald-700 text-white rounded-br-sm"
                  : "bg-zinc-100 text-zinc-900 rounded-bl-sm")
              }
            >
              {m.body}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
```

- [ ] **Step 4: Implement the send form**

```tsx
// components/chat/send-message-form.tsx
"use client";

import { useRef } from "react";
import { sendMessage } from "@/lib/chat/actions";

export function SendMessageForm({ chatId }: { chatId: string }) {
  const formRef = useRef<HTMLFormElement>(null);

  async function action(formData: FormData) {
    await sendMessage(formData);
    formRef.current?.reset();
  }

  return (
    <form ref={formRef} action={action} className="flex items-end gap-2">
      <input type="hidden" name="chat_id" value={chatId} />
      <label className="sr-only" htmlFor="message-body">Message</label>
      <textarea
        id="message-body"
        name="body"
        required
        maxLength={4000}
        rows={2}
        placeholder="Type a message…"
        className="flex-1 resize-none rounded border px-3 py-2 text-sm"
      />
      <button type="submit" className="rounded bg-emerald-700 px-4 py-2 text-sm text-white">
        Send
      </button>
    </form>
  );
}
```

- [ ] **Step 5: Implement the chat page**

```tsx
// app/chats/[id]/page.tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getChat, getMessages } from "@/lib/chat/queries";
import { listingImageUrl } from "@/lib/img";
import { MessageList } from "@/components/chat/message-list";
import { SendMessageForm } from "@/components/chat/send-message-form";

export const dynamic = "force-dynamic";

type Params = { id: string };

export async function generateMetadata({ params }: { params: Promise<Params> }) {
  const { id } = await params;
  const chat = await getChat(id);
  return { title: chat ? `Chat — ${chat.listing.title}` : "Chat" };
}

export default async function ChatPage({ params }: { params: Promise<Params> }) {
  const user = await requireUser();
  const { id } = await params;

  const chat = await getChat(id);
  if (!chat) notFound();
  if (chat.initiator.id !== user.id && chat.owner.id !== user.id) notFound();

  const messages = await getMessages(id);
  const otherParty = chat.initiator.id === user.id ? chat.owner : chat.initiator;

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 p-4 sm:p-6">
      <header className="flex items-center gap-3 rounded-lg border bg-white p-3">
        <div className="h-12 w-12 shrink-0 overflow-hidden rounded bg-zinc-100">
          {chat.listing.cover_path && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={listingImageUrl(chat.listing.cover_path)}
              alt=""
              className="h-full w-full object-cover"
            />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <Link
            href={`/l/${chat.listing.id}/${chat.listing.slug}`}
            className="block truncate text-sm font-medium hover:underline"
          >
            {chat.listing.title}
          </Link>
          <p className="text-xs text-zinc-500">with {otherParty.display_name ?? "someone"}</p>
        </div>
      </header>

      <section className="min-h-[40vh] rounded-lg border bg-white p-3">
        <MessageList messages={messages} viewerId={user.id} />
      </section>

      <SendMessageForm chatId={chat.id} />
    </main>
  );
}
```

- [ ] **Step 6: Run e2e**

```bash
pnpm test:e2e tests/e2e/chat-converse.spec.ts
```

Expected: PASS.

- [ ] **Step 7: Run the full e2e suite**

```bash
pnpm test:e2e
```

Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add app/chats/[id] components/chat/message-list.tsx components/chat/send-message-form.tsx tests/e2e/chat-converse.spec.ts
git commit -m "feat(interactions): /chats/[id] detail page + send message form"
```

---

## Task 11: ChatPoller — auto-refresh new messages

**Files:**
- Create: `components/chat/chat-poller.tsx`
- Modify: `app/chats/[id]/page.tsx` (mount the poller)

- [ ] **Step 1: Implement**

```tsx
// components/chat/chat-poller.tsx
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function ChatPoller({ intervalMs = 5000 }: { intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs]);
  return null;
}
```

- [ ] **Step 2: Mount the poller**

In `app/chats/[id]/page.tsx`, add the import:

```tsx
import { ChatPoller } from "@/components/chat/chat-poller";
```

And inside the `<main>`, anywhere (top is fine):

```tsx
<ChatPoller />
```

- [ ] **Step 3: Smoke check by hand**

Open `/chats/[id]` in browser. Open it in a second window logged in as the other party. Send a message from one — within 5–6 seconds it appears in the other.

- [ ] **Step 4: Run e2e**

```bash
pnpm test:e2e tests/e2e/chat-converse.spec.ts
```

Expected: still PASS. (The existing test `page.goto`s manually so polling isn't strictly required, but the test must remain green with the poller mounted.)

- [ ] **Step 5: Commit**

```bash
git add components/chat/chat-poller.tsx app/chats/[id]/page.tsx
git commit -m "feat(interactions): chat poller for incoming messages"
```

---

## Task 12: Trade actions + UI

**Files:**
- Create: `lib/trade/actions.ts`
- Create: `lib/trade/queries.ts`
- Create: `components/chat/trade-actions.tsx`
- Modify: `app/chats/[id]/page.tsx` (mount TradeActions)

The trade lifecycle is:
1. Either party clicks "Mark trade done" → `markTradeDone({ chat_id })` inserts a row with `party_a = me, party_b = other, status = 'pending'`. Idempotent: if a pending trade already exists, no-op.
2. The OTHER party sees a banner with two buttons: Confirm / Cancel.
3. Confirm → `confirmTrade({ trade_id })` updates `status = 'completed', completed_at = now()`. (Only `party_b` may confirm.)
4. Cancel → `cancelTrade({ trade_id })` updates `status = 'cancelled', cancelled_at = now()`. Either party may cancel. The next "Mark done" creates a new trade row.

- [ ] **Step 1: Implement actions**

```ts
// lib/trade/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";

async function partyOf(chatId: string, userId: string) {
  const supabase = await createClient();
  const { data: chat, error } = await supabase
    .from("chats")
    .select("id, listing_id, initiator_id, owner_id")
    .eq("id", chatId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!chat) throw new Error("Chat not found");
  const isParty = userId === chat.initiator_id || userId === chat.owner_id;
  if (!isParty) throw new Error("Not a party of this chat");
  const otherId = userId === chat.initiator_id ? chat.owner_id : chat.initiator_id;
  return { chat, otherId };
}

export async function markTradeDone(formData: FormData): Promise<void> {
  const user = await requireUser();
  const chatId = String(formData.get("chat_id") ?? "");
  if (!chatId) throw new Error("Missing chat_id");

  const supabase = await createClient();
  const { chat, otherId } = await partyOf(chatId, user.id);

  // Idempotent: pending trade already exists?
  const { data: existing } = await supabase
    .from("trades")
    .select("id")
    .eq("chat_id", chatId)
    .eq("status", "pending")
    .maybeSingle();
  if (existing) {
    revalidatePath(`/chats/${chatId}`);
    return;
  }

  const { error } = await supabase
    .from("trades")
    .insert({
      chat_id: chatId,
      listing_id: chat.listing_id,
      party_a: user.id,
      party_b: otherId,
      status: "pending",
    });
  if (error) throw new Error(error.message);

  revalidatePath(`/chats/${chatId}`);
}

export async function confirmTrade(formData: FormData): Promise<void> {
  const user = await requireUser();
  const tradeId = String(formData.get("trade_id") ?? "");
  if (!tradeId) throw new Error("Missing trade_id");

  const supabase = await createClient();
  const { data: trade, error: gerr } = await supabase
    .from("trades")
    .select("id, chat_id, party_a, party_b, status")
    .eq("id", tradeId)
    .maybeSingle();
  if (gerr) throw new Error(gerr.message);
  if (!trade) throw new Error("Trade not found");
  if (trade.status !== "pending") throw new Error("Trade is not pending");
  if (user.id !== trade.party_b) throw new Error("Only the other party can confirm");

  const { error } = await supabase
    .from("trades")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", tradeId)
    .eq("status", "pending");
  if (error) throw new Error(error.message);

  revalidatePath(`/chats/${trade.chat_id}`);
}

export async function cancelTrade(formData: FormData): Promise<void> {
  const user = await requireUser();
  const tradeId = String(formData.get("trade_id") ?? "");
  if (!tradeId) throw new Error("Missing trade_id");

  const supabase = await createClient();
  const { data: trade, error: gerr } = await supabase
    .from("trades")
    .select("id, chat_id, party_a, party_b, status")
    .eq("id", tradeId)
    .maybeSingle();
  if (gerr) throw new Error(gerr.message);
  if (!trade) throw new Error("Trade not found");
  if (trade.status !== "pending") throw new Error("Trade is not pending");
  if (user.id !== trade.party_a && user.id !== trade.party_b) {
    throw new Error("Not a party");
  }

  const { error } = await supabase
    .from("trades")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
    .eq("id", tradeId)
    .eq("status", "pending");
  if (error) throw new Error(error.message);

  revalidatePath(`/chats/${trade.chat_id}`);
}
```

- [ ] **Step 2: Implement queries**

```ts
// lib/trade/queries.ts
import { createClient } from "@/lib/supabase/server";

export type Trade = {
  id: string;
  chat_id: string;
  listing_id: string;
  party_a: string;
  party_b: string;
  status: "pending" | "completed" | "cancelled";
  created_at: string;
  completed_at: string | null;
  cancelled_at: string | null;
};

export async function getActiveTradeForChat(chatId: string): Promise<Trade | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("trades")
    .select("*")
    .eq("chat_id", chatId)
    .eq("status", "pending")
    .maybeSingle();
  if (error) throw error;
  return (data as Trade) ?? null;
}

export async function getCompletedTradesForChat(chatId: string): Promise<Trade[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("trades")
    .select("*")
    .eq("chat_id", chatId)
    .eq("status", "completed")
    .order("completed_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Trade[];
}
```

- [ ] **Step 3: Implement TradeActions UI**

```tsx
// components/chat/trade-actions.tsx
import { markTradeDone, confirmTrade, cancelTrade } from "@/lib/trade/actions";
import type { Trade } from "@/lib/trade/queries";

type Props = {
  chatId: string;
  viewerId: string;
  pending: Trade | null;
  hasCompleted: boolean;
};

export function TradeActions({ chatId, viewerId, pending, hasCompleted }: Props) {
  if (!pending) {
    return (
      <div className="rounded-lg border bg-white p-3">
        <p className="text-sm text-zinc-700">
          {hasCompleted
            ? "This trade is complete. Start another by marking it done."
            : "When you've agreed on the swap, mark the trade done."}
        </p>
        <form action={markTradeDone} className="mt-2">
          <input type="hidden" name="chat_id" value={chatId} />
          <button type="submit" className="rounded border px-3 py-1.5 text-sm">
            Mark trade done
          </button>
        </form>
      </div>
    );
  }

  if (viewerId === pending.party_a) {
    return (
      <div className="rounded-lg border bg-amber-50 p-3 text-sm text-amber-900">
        <p>Waiting for the other party to confirm the trade.</p>
        <form action={cancelTrade} className="mt-2">
          <input type="hidden" name="trade_id" value={pending.id} />
          <button type="submit" className="rounded border border-amber-300 px-3 py-1 text-xs">
            Cancel
          </button>
        </form>
      </div>
    );
  }

  // viewer is party_b
  return (
    <div className="rounded-lg border bg-emerald-50 p-3 text-sm text-emerald-900">
      <p>The other party marked this trade done. Confirm if it happened.</p>
      <div className="mt-2 flex gap-2">
        <form action={confirmTrade}>
          <input type="hidden" name="trade_id" value={pending.id} />
          <button type="submit" className="rounded bg-emerald-700 px-3 py-1.5 text-xs text-white">
            Confirm
          </button>
        </form>
        <form action={cancelTrade}>
          <input type="hidden" name="trade_id" value={pending.id} />
          <button type="submit" className="rounded border border-emerald-300 px-3 py-1.5 text-xs">
            Cancel
          </button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Mount in chat page**

In `app/chats/[id]/page.tsx`, add imports:

```tsx
import { getActiveTradeForChat, getCompletedTradesForChat } from "@/lib/trade/queries";
import { TradeActions } from "@/components/chat/trade-actions";
```

After `const messages = await getMessages(id);`, add:

```tsx
const [pendingTrade, completedTrades] = await Promise.all([
  getActiveTradeForChat(id),
  getCompletedTradesForChat(id),
]);
```

And inside `<main>`, between the message list section and the send form, add:

```tsx
<TradeActions
  chatId={chat.id}
  viewerId={user.id}
  pending={pendingTrade}
  hasCompleted={completedTrades.length > 0}
/>
```

- [ ] **Step 5: Smoke check**

By hand: as the listing owner, click Mark trade done in a chat. As the buyer in another browser, refresh — see Confirm/Cancel banner.

- [ ] **Step 6: Commit**

```bash
git add lib/trade components/chat/trade-actions.tsx app/chats/[id]/page.tsx
git commit -m "feat(interactions): trade lifecycle actions + chat UI"
```

---

## Task 13: Rating prompt + rateTrade action

**Files:**
- Create: `lib/rating/actions.ts`
- Create: `lib/rating/queries.ts`
- Create: `components/chat/rating-form.tsx`
- Modify: `app/chats/[id]/page.tsx` (mount the rating form)
- Test: `tests/e2e/trade-complete.spec.ts`

- [ ] **Step 1: Write the failing e2e**

```ts
// tests/e2e/trade-complete.spec.ts
import { test, expect } from "@playwright/test";
import { signInViaMailpit } from "./helpers/auth";

test("two users complete a trade and rate each other", async ({ browser, request }) => {
  // Alice posts
  const ctxA = await browser.newContext();
  const pageA = await ctxA.newPage();
  await signInViaMailpit(pageA, request, "Trade Alice");
  await pageA.goto("/listings/new");
  await pageA.getByLabel(/type/i).selectOption("offer_goods");
  await pageA.getByLabel(/title/i).fill("Honey jar from our hives");
  await pageA.locator("select[name=category_id]").selectOption({ label: "Food" });
  await pageA.locator("select[name=area_id]").selectOption({ label: "Quathiaski Cove" });
  await pageA.getByRole("button", { name: /publish/i }).click();
  const listingUrl = pageA.url();

  // Bob offers
  const ctxB = await browser.newContext();
  const pageB = await ctxB.newPage();
  await signInViaMailpit(pageB, request, "Trade Bob");
  await pageB.goto(listingUrl);
  await pageB.getByRole("button", { name: /offer a swap/i }).click();
  await expect(pageB).toHaveURL(/\/chats\/[0-9a-f-]+/);

  // Bob marks the trade done
  await pageB.getByRole("button", { name: /mark trade done/i }).click();
  await expect(pageB.getByText(/waiting for the other party/i)).toBeVisible();

  // Alice goes to chats and confirms
  await pageA.goto("/chats");
  await pageA.getByRole("link", { name: /honey jar/i }).click();
  await pageA.getByRole("button", { name: /^confirm$/i }).click();

  // Both see the rating form
  await expect(pageA.getByText(/how was the trade/i)).toBeVisible();
  await pageB.reload();
  await expect(pageB.getByText(/how was the trade/i)).toBeVisible();

  // Alice rates 5 stars
  await pageA.getByRole("button", { name: /^5 stars$/i }).click();
  await pageA.getByLabel(/comment/i).fill("Smooth and friendly.");
  await pageA.getByRole("button", { name: /submit rating/i }).click();
  await expect(pageA.getByText(/thanks for rating/i)).toBeVisible();
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
pnpm test:e2e tests/e2e/trade-complete.spec.ts
```

Expected: FAIL — components / actions don't exist yet.

- [ ] **Step 3: Implement queries**

```ts
// lib/rating/queries.ts
import { createClient } from "@/lib/supabase/server";

export type RatingSummary = { avg: number; count: number };

export async function getRatingSummary(userId: string): Promise<RatingSummary> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ratings")
    .select("stars")
    .eq("ratee_id", userId);
  if (error) throw error;
  const rows = data ?? [];
  if (rows.length === 0) return { avg: 0, count: 0 };
  const sum = rows.reduce((acc, r: any) => acc + r.stars, 0);
  return { avg: sum / rows.length, count: rows.length };
}

export async function myRatingForTrade(
  tradeId: string,
  raterId: string,
): Promise<{ stars: number; comment: string | null } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ratings")
    .select("stars, comment")
    .eq("trade_id", tradeId)
    .eq("rater_id", raterId)
    .maybeSingle();
  if (error) throw error;
  return data ? { stars: data.stars, comment: data.comment } : null;
}
```

- [ ] **Step 4: Implement action**

```ts
// lib/rating/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { rateTradeSchema } from "@/lib/rating/validation";

export async function rateTrade(formData: FormData): Promise<void> {
  const user = await requireUser();
  const parsed = rateTradeSchema.parse({
    trade_id: formData.get("trade_id"),
    stars: Number(formData.get("stars")),
    comment: formData.get("comment") || undefined,
  });

  const supabase = await createClient();
  const { data: trade, error: gerr } = await supabase
    .from("trades")
    .select("id, chat_id, party_a, party_b, status")
    .eq("id", parsed.trade_id)
    .maybeSingle();
  if (gerr) throw new Error(gerr.message);
  if (!trade) throw new Error("Trade not found");
  if (trade.status !== "completed") throw new Error("Trade is not completed");
  if (user.id !== trade.party_a && user.id !== trade.party_b) throw new Error("Not a party");

  const ratee = user.id === trade.party_a ? trade.party_b : trade.party_a;

  const { error } = await supabase.from("ratings").insert({
    trade_id: parsed.trade_id,
    rater_id: user.id,
    ratee_id: ratee,
    stars: parsed.stars,
    comment: parsed.comment ?? null,
  });
  if (error) throw new Error(error.message);

  revalidatePath(`/chats/${trade.chat_id}`);
}
```

- [ ] **Step 5: Implement RatingForm**

```tsx
// components/chat/rating-form.tsx
"use client";

import { useState } from "react";
import { rateTrade } from "@/lib/rating/actions";

export function RatingForm({ tradeId }: { tradeId: string }) {
  const [stars, setStars] = useState<number>(0);

  return (
    <div className="rounded-lg border bg-white p-3 text-sm">
      <h3 className="font-semibold">How was the trade?</h3>
      <form action={rateTrade} className="mt-2 space-y-2">
        <input type="hidden" name="trade_id" value={tradeId} />
        <input type="hidden" name="stars" value={stars} />
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              type="button"
              key={n}
              aria-label={`${n} star${n === 1 ? "" : "s"}`}
              onClick={() => setStars(n)}
              className={
                "rounded px-2 py-1 text-lg " +
                (stars >= n ? "text-amber-500" : "text-zinc-300")
              }
            >
              ★
            </button>
          ))}
        </div>
        <label htmlFor="rating-comment" className="block text-xs font-medium">Comment (optional)</label>
        <textarea
          id="rating-comment"
          name="comment"
          maxLength={500}
          rows={2}
          className="w-full rounded border px-3 py-2 text-sm"
          placeholder="Anything you'd like to say…"
        />
        <button
          type="submit"
          disabled={stars === 0}
          className="rounded bg-emerald-700 px-3 py-1.5 text-sm text-white disabled:opacity-50"
        >
          Submit rating
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 6: Mount in chat page**

In `app/chats/[id]/page.tsx`, add imports:

```tsx
import { RatingForm } from "@/components/chat/rating-form";
import { myRatingForTrade } from "@/lib/rating/queries";
```

Just after computing `completedTrades`, fetch the most recent one's rating-state for the current viewer:

```tsx
const lastCompleted = completedTrades[0] ?? null;
const myRating = lastCompleted
  ? await myRatingForTrade(lastCompleted.id, user.id)
  : null;
```

In the JSX, between `<TradeActions ... />` and `<SendMessageForm />`, add:

```tsx
{lastCompleted && !myRating && <RatingForm tradeId={lastCompleted.id} />}
{lastCompleted && myRating && (
  <p className="rounded-lg border bg-zinc-50 p-3 text-sm text-zinc-700">
    Thanks for rating — {myRating.stars} ★{myRating.comment ? ` · "${myRating.comment}"` : ""}
  </p>
)}
```

- [ ] **Step 7: Run e2e**

```bash
pnpm test:e2e tests/e2e/trade-complete.spec.ts
```

Expected: PASS.

- [ ] **Step 8: Run full suite**

```bash
pnpm test:unit && pnpm test:e2e
```

Expected: all green.

- [ ] **Step 9: Commit**

```bash
git add lib/rating components/chat/rating-form.tsx app/chats/[id]/page.tsx tests/e2e/trade-complete.spec.ts
git commit -m "feat(interactions): rating form + rateTrade action + e2e"
```

---

## Task 14: Rating summary on listing detail + unit test

**Files:**
- Create: `components/chat/rating-summary.tsx`
- Modify: `app/l/[id]/[slug]/page.tsx`
- Test: `tests/unit/rating-summary.test.ts`

The summary shows like "★ 4.5 · 12 reviews" under the owner's name on the listing detail page. We unit-test the formatting helper since it's pure.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/rating-summary.test.ts
import { describe, expect, it } from "vitest";
import { formatRatingSummary } from "@/components/chat/rating-summary";

describe("formatRatingSummary", () => {
  it("shows nothing for zero ratings", () => {
    expect(formatRatingSummary({ avg: 0, count: 0 })).toBe(null);
  });

  it("rounds to one decimal", () => {
    expect(formatRatingSummary({ avg: 4.27, count: 11 })).toBe("★ 4.3 · 11 reviews");
  });

  it("singular review", () => {
    expect(formatRatingSummary({ avg: 5, count: 1 })).toBe("★ 5.0 · 1 review");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
pnpm test:unit tests/unit/rating-summary.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the component + helper**

```tsx
// components/chat/rating-summary.tsx
import type { RatingSummary } from "@/lib/rating/queries";

export function formatRatingSummary(s: RatingSummary): string | null {
  if (s.count === 0) return null;
  const avg = s.avg.toFixed(1);
  const noun = s.count === 1 ? "review" : "reviews";
  return `★ ${avg} · ${s.count} ${noun}`;
}

export function RatingSummary({ summary }: { summary: RatingSummary }) {
  const text = formatRatingSummary(summary);
  if (!text) return null;
  return <span className="text-sm text-zinc-600">{text}</span>;
}
```

- [ ] **Step 4: Wire into listing detail**

In `app/l/[id]/[slug]/page.tsx`, add imports:

```tsx
import { getRatingSummary } from "@/lib/rating/queries";
import { RatingSummary } from "@/components/chat/rating-summary";
```

After `const l = await getListing(id);`, add:

```tsx
const ownerRating = await getRatingSummary(l.owner.id);
```

Find the existing line that says `Posted by {l.owner.display_name ?? "someone"}` and replace the surrounding `<p>` with:

```tsx
<p className="text-sm text-zinc-500">
  Posted by {l.owner.display_name ?? "someone"}{" "}
  <RatingSummary summary={ownerRating} />
</p>
```

- [ ] **Step 5: Run unit test**

```bash
pnpm test:unit tests/unit/rating-summary.test.ts
```

Expected: PASS, all 3 cases.

- [ ] **Step 6: Run full suite**

```bash
pnpm test:unit && pnpm test:e2e
```

Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add components/chat/rating-summary.tsx app/l/[id]/[slug]/page.tsx tests/unit/rating-summary.test.ts
git commit -m "feat(interactions): rating summary on listing detail"
```

---

## Out of scope (intentionally)

These belong to later plans, not Plan 3:

- **Realtime chat** (Supabase Realtime channels, presence, typing indicators) — Plan 5 (v1.5 polish).
- **14-day auto-confirm** of pending trades — Plan 5.
- **Web push notifications** for new messages — Plan 5.
- **Disputed-trade flow + admin moderation** — Plan 4.
- **Reports** (report a listing / user / message) — Plan 4.
- **Public profile page `/u/[handle]`** — Plan 4 (depends on a public-safe view of `users`).
- **Credits ledger writes** — v2.
- **Image attachments in messages** — Plan 5 polish.
- **Markdown / linkification in message body** — Plan 5 polish.

## Done means

- Anyone signed in can offer a swap on someone else's active listing and land on a chat.
- The two parties can exchange messages; new messages appear within ~5s without manual refresh.
- Either party can mark the trade done; the other confirms or cancels.
- Both parties can rate each other after a confirmed trade (one rating per side per trade).
- The listing detail page shows the owner's rating summary.
- All unit + all e2e tests pass.
- Migrations 0006–0009 apply cleanly on a fresh stack.
