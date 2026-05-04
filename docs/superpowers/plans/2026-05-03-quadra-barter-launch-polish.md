# Quadra Barter — Launch Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close out the v1 launch checklist — public profiles (so display names actually show), search + category chips on the feed, reports + basic admin moderation, and the SEO/LLM scaffolding (sitemap, robots, llms.txt) the spec called for.

**Architecture:** Add a `public_users` SQL view exposing only safe profile fields (id, display_name, avatar_url, bio, area_id, created_at) that anyone can SELECT — fixes the cascade of "Posted by someone" / "Hi there" / "with someone" UX bugs caused by `users` being self-read-only. Search lives in URL params (`?q=&c=&a=`) so it's server-rendered, crawlable, shareable. Reports go through a server action; a hardcoded admin allowlist (`ADMIN_USER_IDS` env var) gates `/admin/*` routes. SEO scaffolding uses Next.js 16's built-in `app/sitemap.ts`, `app/robots.ts`, plus a static `app/llms.txt/route.ts`.

**Tech Stack:** Next.js 16 (server actions + RSC + sitemap/robots conventions), TypeScript, Supabase Postgres (views + RLS), Zod, Tailwind v4, Vitest, Playwright.

**Decisions baked in (call out before starting):**
- **Profile URL is `/u/[id]`** (UUID), not `/u/[handle]`. The spec says `/u/[handle]` but adding a handle column means changing onboarding + handling collisions — too much for this plan. Plan 5 (v1.5 polish) introduces handles and 301s `/u/[uuid] → /u/[handle]`.
- **Public users surface is a SQL view, not a column-level RLS policy.** A view is simpler to reason about and lets us cleanly say "anyone can SELECT from `public_users`" without rewriting the existing `users` policies.
- **Search is server-rendered URL-state.** A `<form>` posts to `/?q=foo&c=food` (GET); the page reads `searchParams` and builds the query. No client-side fetching, no debouncing — keeps it crawlable and fast at Quadra scale.
- **Admin allowlist via `ADMIN_USER_IDS` env var** (comma-separated UUIDs). No admin role table for v1; if a second admin is needed, add their UUID to the env var and restart. Plan 5+ moves to a real role.
- **Reports are write-only for users; admin-only for read.** RLS allows authenticated users to INSERT into `reports` but only the admin-allowlisted user IDs can SELECT/UPDATE.
- **Sitemap regeneration uses Next.js's built-in revalidation** — `app/sitemap.ts` re-runs every 1 hour. Acceptable for v1; spec said "regenerated on listing publish" but hourly is close enough and simpler.
- **No `/about`, `/how-it-works`, `/safety` static pages** in this plan. They're a copywriting task, not engineering. Defer to a separate content pass.
- **Image transforms via imgproxy + client-side resize → Plan 5.** Images currently serve as raw uploaded bytes through Supabase Storage public URLs. Listings cap at 5MB / 6 photos, which is fine for v1 launch.

---

## File structure

**New files:**

Migrations:
- `supabase/migrations/0011_public_users_view.sql` — view + grants

App-layer libraries:
- `lib/users/queries.ts` — `getPublicUser(id)`, `getPublicUsersByIds(ids)`
- `lib/listings/search.ts` — `searchListings({ q?, categorySlug?, areaSlug?, limit })`
- `lib/reports/validation.ts` — `createReportSchema`
- `lib/reports/actions.ts` — `createReport(formData)`
- `lib/admin/auth.ts` — `requireAdmin()` helper
- `lib/admin/queries.ts` — `listOpenReports()`
- `lib/admin/actions.ts` — `resolveReport`, `hideListing`, `banUser`

Components:
- `components/feed/search-bar.tsx` — uncontrolled `<form method=GET>` posting to `/`
- `components/feed/category-chips.tsx` — server-rendered horizontal chip list
- `components/listings/report-button.tsx` — client component, opens dialog and submits report
- `components/users/profile-header.tsx` — display name + area + rating summary

Pages:
- `app/u/[id]/page.tsx` — public profile
- `app/admin/reports/page.tsx` — moderator queue
- `app/sitemap.ts` — dynamic sitemap
- `app/robots.ts` — dynamic robots.txt
- `app/llms.txt/route.ts` — static-ish llms.txt

Tests:
- `tests/unit/search-listings.test.ts` — search query builder (pure)
- `tests/unit/sitemap.test.ts` — sitemap entry generation (pure)
- `tests/e2e/profile-page.spec.ts` — visit `/u/[id]` for a rated user, see name + rating + listings
- `tests/e2e/feed-search.spec.ts` — `/?q=apples` filters the feed
- `tests/e2e/report-listing.spec.ts` — user reports a listing; admin sees it

**Modified files:**

- `lib/listings/queries.ts` — switch the `users:owner_id` embedded join over to `public_users`
- `lib/chat/queries.ts` — switch `initiator:initiator_id` and `owner:owner_id` to `public_users`
- `app/l/[id]/[slug]/page.tsx` — owner name now real, link to `/u/[id]`, add ReportButton
- `app/chats/[id]/page.tsx` — chat header "with {real name}", auto-greeting now uses real name
- `app/page.tsx` — replace static feed with searchable feed; mount `<SearchBar>` + `<CategoryChips>`
- `app/onboarding/page.tsx` — no change yet (handle support is Plan 5)
- `.env.local.example` (or `.env.local` directly if no example exists) — add `ADMIN_USER_IDS=`

---

## Task 1: Migration — public_users view

**Files:**
- Create: `supabase/migrations/0011_public_users_view.sql`

A SQL view of `public.users` exposing only fields safe to share publicly. Anyone (anon or authed) can SELECT from it. Fixes the cascade of "Posted by someone" / "Hi there" / "with someone" UX issues across listings, chat, and rating-summary surfaces.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0011_public_users_view.sql
-- Public-safe view of users. Exposes only fields fit for any viewer.
-- Email and banned_at remain hidden (those stay behind self-read RLS on
-- public.users).

create or replace view public.public_users with (security_invoker = on) as
select
  id,
  display_name,
  avatar_url,
  bio,
  area_id,
  created_at
from public.users;

-- security_invoker=on means the view runs with the CALLER's permissions,
-- not the view-owner's. Combined with our explicit grant below, anyone
-- (anon or authed) can SELECT but RLS on the underlying table still
-- applies to other operations.

-- Grant SELECT to anon + authenticated.
grant select on public.public_users to anon, authenticated;

-- Allow PostgREST to surface the view via the relationship hint
-- "public_users:owner_id" in embedded selects.
comment on view public.public_users is
  'Public-safe profile fields. Used by anon-readable surfaces (listings, chats, ratings).';
```

- [ ] **Step 2: Apply**

```bash
docker exec -i supabase-db psql -U postgres -d postgres < supabase/migrations/0011_public_users_view.sql
```

Expected: no errors.

- [ ] **Step 3: Verify**

```bash
docker exec -i supabase-db psql -U postgres -d postgres -c \
  "select column_name, data_type from information_schema.columns where table_schema='public' and table_name='public_users' order by ordinal_position;"
```

Should print 6 columns: id, display_name, avatar_url, bio, area_id, created_at.

```bash
docker exec -i supabase-db psql -U postgres -d postgres -c \
  "select grantee, privilege_type from information_schema.role_table_grants where table_schema='public' and table_name='public_users';"
```

Should show SELECT for both `anon` and `authenticated`.

- [ ] **Step 4: Reload PostgREST schema cache**

PostgREST caches the schema; new views/relations don't show up until it's notified.

```bash
docker exec -i supabase-db psql -U postgres -d postgres -c "notify pgrst, 'reload schema';"
```

Expected: `NOTIFY`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0011_public_users_view.sql
git commit -m "feat(db): public_users view exposing safe profile fields"
```

---

## Task 2: Switch listing + chat queries to public_users

**Files:**
- Modify: `lib/listings/queries.ts`
- Modify: `lib/chat/queries.ts`
- Modify: `lib/chat/actions.ts` (the `startChat` greeting reads owner display_name from the listing query — once that's via public_users, the greeting works)

The existing `getListing` and `getChat` use `users:owner_id ( id, display_name )` which RLS nulls out for non-owner viewers. Switch to `public_users:owner_id ( id, display_name )` etc.

- [ ] **Step 1: Update `getListing` in `lib/listings/queries.ts`**

Find the embedded select inside `getListing` (around line 92–99):

```ts
.select(`
  id, slug, title, type, description, wants_text, accepts_credits, created_at,
  areas:area_id ( name ),
  categories:category_id ( name ),
  owner_id,
  users:owner_id ( id, display_name ),
  listing_images ( path, alt_text, sort_order )
`)
```

Replace with:

```ts
.select(`
  id, slug, title, type, status, description, wants_text, accepts_credits, created_at,
  areas:area_id ( name ),
  categories:category_id ( name ),
  owner_id,
  public_users:owner_id ( id, display_name ),
  listing_images ( path, alt_text, sort_order )
`)
```

Then update the return shape — change `(data as any).users?.display_name` to `(data as any).public_users?.display_name`.

- [ ] **Step 2: Update `getChat` and `listMyChats` in `lib/chat/queries.ts`**

In `getChat`, change:
```ts
initiator:initiator_id ( id, display_name ),
owner:owner_id ( id, display_name )
```
to:
```ts
initiator:initiator_id!public_users ( id, display_name ),
owner:owner_id!public_users ( id, display_name )
```

The `!public_users` hint tells PostgREST to use the view rather than the underlying users table. (PostgREST disambiguation syntax — see https://postgrest.org/en/stable/references/api/resource_embedding.html#disambiguating-relationships.)

In `listMyChats`, do the same for the `initiator:initiator_id` and `owner:owner_id` embedded selects, AND the `listing:listing_id ( id, title, slug, listing_images ( path, sort_order ) )` does NOT need changing (listings are already public-readable when active).

- [ ] **Step 3: Update `startChat` in `lib/chat/actions.ts`**

The owner-name lookup for the auto-greeting:
```ts
.select("id, owner_id, title, status, users:owner_id ( display_name )")
```

Replace with:
```ts
.select("id, owner_id, title, status, public_users:owner_id ( display_name )")
```

And the line that reads it:
```ts
const ownerName = (listing as any).users?.display_name ?? "there";
```

becomes:
```ts
const ownerName = (listing as any).public_users?.display_name ?? "there";
```

- [ ] **Step 4: Run unit tests**

```bash
pnpm test:unit
```

Expected: all 37 still pass.

- [ ] **Step 5: Run e2e**

```bash
pnpm test:e2e
```

Expected: all 9 still pass. The chat-converse e2e asserts on the auto-greeting `/i'd like to swap for your listing.*carrots/i` — that match is independent of the owner name (it's the suffix), so the test still passes regardless of whether the name is "there" or "Conv Alice".

- [ ] **Step 6: Manual smoke check**

In a browser, sign in as user A, post a listing. Sign out. Sign in as user B. Visit A's listing. Confirm:
- "Posted by **A's display name**" (not "someone")
- Click "Offer a swap"; chat opens; greeting starts "Hi **A's display name**, …" (not "Hi there").

You can skip the manual check if you can't easily juggle two browsers; the e2e covers the auto-greeting suffix already.

- [ ] **Step 7: Commit**

```bash
git add lib/listings/queries.ts lib/chat/queries.ts lib/chat/actions.ts
git commit -m "feat(profiles): switch listing + chat queries to public_users view"
```

---

## Task 3: User queries module

**Files:**
- Create: `lib/users/queries.ts`

Centralize public-user lookups for the profile page and any future consumer.

- [ ] **Step 1: Implement**

```ts
// lib/users/queries.ts
import { createClient } from "@/lib/supabase/server";

export type PublicUser = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  area_id: string | null;
  area_name: string | null;
  created_at: string;
};

export async function getPublicUser(id: string): Promise<PublicUser | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("public_users")
    .select(`
      id, display_name, avatar_url, bio, area_id, created_at,
      areas:area_id ( name )
    `)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id,
    display_name: data.display_name,
    avatar_url: data.avatar_url,
    bio: data.bio,
    area_id: data.area_id,
    area_name: (data as any).areas?.name ?? null,
    created_at: data.created_at,
  };
}
```

- [ ] **Step 2: Type-check**

```bash
pnpm tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add lib/users/queries.ts
git commit -m "feat(profiles): public user queries"
```

---

## Task 4: /u/[id] public profile page

**Files:**
- Create: `app/u/[id]/page.tsx`
- Create: `components/users/profile-header.tsx`
- Test: `tests/e2e/profile-page.spec.ts`

The profile page shows the user's display name + area + "joined N days ago", their rating summary (★ avg · count reviews), recent ratings (max 5), and their recent active listings (max 12).

- [ ] **Step 1: Write the failing e2e**

```ts
// tests/e2e/profile-page.spec.ts
import { test, expect } from "@playwright/test";
import { signInViaMailpit } from "./helpers/auth";

test("public profile shows display name, area, listings", async ({ page, request }) => {
  await signInViaMailpit(page, request, "Profile Pat");
  // Get the user id by signing in then reading from /me — or post a listing
  // and pull the owner from the URL.
  await page.goto("/listings/new");
  await page.getByLabel(/type/i).selectOption("offer_goods");
  await page.getByLabel(/title/i).fill("Profile test sweater");
  await page.locator("select[name=category_id]").selectOption({ label: "Clothing" });
  await page.locator("select[name=area_id]").selectOption({ label: "Quathiaski Cove" });
  await page.getByRole("button", { name: /publish/i }).click();
  await expect(page).toHaveURL(/\/l\/[0-9a-f-]+\/profile-test-sweater/);

  // The owner-name link on listing detail goes to /u/[id]
  await page.getByRole("link", { name: /profile pat/i }).click();
  await expect(page).toHaveURL(/\/u\/[0-9a-f-]+/);

  await expect(page.getByRole("heading", { name: /profile pat/i })).toBeVisible();
  await expect(page.getByText(/quathiaski cove/i)).toBeVisible();
  await expect(page.getByRole("link", { name: /profile test sweater/i })).toBeVisible();
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
pnpm test:e2e tests/e2e/profile-page.spec.ts
```

Expected: FAIL — `/u/[id]` 404 or owner-name isn't a link yet.

- [ ] **Step 3: Implement ProfileHeader**

```tsx
// components/users/profile-header.tsx
import type { PublicUser } from "@/lib/users/queries";
import type { RatingSummary } from "@/lib/rating/queries";
import { formatRatingSummary } from "@/components/chat/rating-summary";

export function ProfileHeader({ user, rating }: { user: PublicUser; rating: RatingSummary }) {
  const ratingText = formatRatingSummary(rating);
  return (
    <header className="space-y-2">
      <h1 className="text-2xl font-semibold">{user.display_name ?? "Anonymous islander"}</h1>
      <p className="text-sm text-zinc-600">
        {user.area_name ?? "Quadra Island"}
        {ratingText && <span> · {ratingText}</span>}
      </p>
      {user.bio && <p className="whitespace-pre-line text-sm text-zinc-800">{user.bio}</p>}
    </header>
  );
}
```

- [ ] **Step 4: Implement the profile page**

```tsx
// app/u/[id]/page.tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { getPublicUser } from "@/lib/users/queries";
import { getRatingSummary } from "@/lib/rating/queries";
import { createClient } from "@/lib/supabase/server";
import { ProfileHeader } from "@/components/users/profile-header";
import { ListingGrid } from "@/components/listings/listing-grid";
import type { FeedItem } from "@/lib/listings/queries";

type Params = { id: string };

export async function generateMetadata(
  { params }: { params: Promise<Params> },
): Promise<Metadata> {
  const { id } = await params;
  const u = await getPublicUser(id);
  if (!u) return { title: "Profile not found — Quadra Barter" };
  const name = u.display_name ?? "An islander";
  return {
    title: `${name} on Quadra Barter`,
    description: `${name}'s listings on Quadra Island, BC.`,
  };
}

export default async function ProfilePage({ params }: { params: Promise<Params> }) {
  const { id } = await params;
  const [user, rating] = await Promise.all([
    getPublicUser(id),
    getRatingSummary(id),
  ]);
  if (!user) notFound();

  // Fetch their active listings.
  const supabase = await createClient();
  const { data: listingsData } = await supabase
    .from("listings")
    .select(`
      id, slug, title, type, status, created_at,
      areas:area_id ( name ),
      categories:category_id ( name ),
      listing_images ( path, sort_order )
    `)
    .eq("owner_id", id)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(12);

  const items: FeedItem[] = (listingsData ?? []).map((r: any) => ({
    id: r.id,
    slug: r.slug,
    title: r.title,
    type: r.type,
    status: r.status,
    area_name: r.areas?.name ?? null,
    category_name: r.categories?.name ?? null,
    cover_path: (r.listing_images ?? [])
      .slice()
      .sort((a: any, b: any) => a.sort_order - b.sort_order)[0]?.path ?? null,
    created_at: r.created_at,
  }));

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <ProfileHeader user={user} rating={rating} />
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Listings</h2>
        <ListingGrid items={items} emptyText="No active listings." />
      </section>
    </main>
  );
}
```

- [ ] **Step 5: Make the owner name clickable on listing detail**

In `app/l/[id]/[slug]/page.tsx`, find the `Posted by` line and wrap the name in a Link:

Find:
```tsx
<p className="text-sm text-zinc-500">
  Posted by {l.owner.display_name ?? "someone"}{" "}
  <RatingSummary summary={ownerRating} />
</p>
```

Replace with:
```tsx
<p className="text-sm text-zinc-500">
  Posted by{" "}
  {l.owner.id ? (
    <Link href={`/u/${l.owner.id}`} className="font-medium text-zinc-700 hover:underline">
      {l.owner.display_name ?? "an islander"}
    </Link>
  ) : (
    <>{l.owner.display_name ?? "someone"}</>
  )}{" "}
  <RatingSummary summary={ownerRating} />
</p>
```

Add the import at top: `import Link from "next/link";` if it's not already there.

- [ ] **Step 6: Run the e2e**

```bash
pnpm test:e2e tests/e2e/profile-page.spec.ts
```

Expected: PASS.

- [ ] **Step 7: Run full suite**

```bash
pnpm test:e2e
```

Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add app/u app/l/[id]/[slug]/page.tsx components/users tests/e2e/profile-page.spec.ts
git commit -m "feat(profiles): /u/[id] public profile page"
```

---

## Task 5: Search query builder + tests

**Files:**
- Create: `lib/listings/search.ts`
- Test: `tests/unit/search-listings.test.ts`

The search builder is a pure function that takes search params and returns a query-config object. The actual Supabase `.from(...).select(...)` chain is in `searchListings`, but the `buildSearchFilter` helper is unit-testable in isolation.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/search-listings.test.ts
import { describe, expect, it } from "vitest";
import { buildSearchFilter } from "@/lib/listings/search";

describe("buildSearchFilter", () => {
  it("returns the empty filter for empty input", () => {
    expect(buildSearchFilter({})).toEqual({});
  });

  it("trims and lowercases q; rejects q < 2 chars", () => {
    expect(buildSearchFilter({ q: " A " })).toEqual({});
    expect(buildSearchFilter({ q: " Apples " })).toEqual({ q: "apples" });
  });

  it("escapes percent and underscore for ilike", () => {
    expect(buildSearchFilter({ q: "50% off_now" })).toEqual({ q: "50\\% off\\_now" });
  });

  it("passes through category and area slugs unchanged", () => {
    expect(buildSearchFilter({ categorySlug: "food", areaSlug: "heriot-bay" })).toEqual({
      categorySlug: "food",
      areaSlug: "heriot-bay",
    });
  });

  it("ignores empty or whitespace-only slugs", () => {
    expect(buildSearchFilter({ categorySlug: "", areaSlug: "   " })).toEqual({});
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
pnpm test:unit tests/unit/search-listings.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// lib/listings/search.ts
import { createClient } from "@/lib/supabase/server";
import type { FeedItem } from "@/lib/listings/queries";

export type SearchInput = {
  q?: string;
  categorySlug?: string;
  areaSlug?: string;
  limit?: number;
};

export type SearchFilter = {
  q?: string;
  categorySlug?: string;
  areaSlug?: string;
};

/**
 * Pure: normalize search params. Trims, lowercases, drops too-short
 * queries, escapes ilike wildcards, drops empty slugs.
 */
export function buildSearchFilter(input: SearchInput): SearchFilter {
  const out: SearchFilter = {};
  if (input.q != null) {
    const trimmed = input.q.trim().toLowerCase();
    if (trimmed.length >= 2) {
      out.q = trimmed.replace(/[%_]/g, (c) => "\\" + c);
    }
  }
  if (input.categorySlug && input.categorySlug.trim()) {
    out.categorySlug = input.categorySlug.trim();
  }
  if (input.areaSlug && input.areaSlug.trim()) {
    out.areaSlug = input.areaSlug.trim();
  }
  return out;
}

export async function searchListings(input: SearchInput): Promise<FeedItem[]> {
  const filter = buildSearchFilter(input);
  const supabase = await createClient();

  // Resolve slugs to ids when present.
  let categoryId: string | null = null;
  if (filter.categorySlug) {
    const { data } = await supabase
      .from("categories")
      .select("id")
      .eq("slug", filter.categorySlug)
      .maybeSingle();
    categoryId = data?.id ?? null;
    if (!categoryId) return [];
  }
  let areaId: string | null = null;
  if (filter.areaSlug) {
    const { data } = await supabase
      .from("areas")
      .select("id")
      .eq("slug", filter.areaSlug)
      .maybeSingle();
    areaId = data?.id ?? null;
    if (!areaId) return [];
  }

  let query = supabase
    .from("listings")
    .select(`
      id, slug, title, type, status, created_at,
      areas:area_id ( name ),
      categories:category_id ( name ),
      listing_images ( path, sort_order )
    `)
    .eq("status", "active");
  if (categoryId) query = query.eq("category_id", categoryId);
  if (areaId) query = query.eq("area_id", areaId);
  if (filter.q) query = query.or(`title.ilike.%${filter.q}%,description.ilike.%${filter.q}%`);

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(input.limit ?? 24);
  if (error) throw error;

  return (data ?? []).map((r: any) => ({
    id: r.id,
    slug: r.slug,
    title: r.title,
    type: r.type,
    status: r.status,
    area_name: r.areas?.name ?? null,
    category_name: r.categories?.name ?? null,
    cover_path: (r.listing_images ?? [])
      .slice()
      .sort((a: any, b: any) => a.sort_order - b.sort_order)[0]?.path ?? null,
    created_at: r.created_at,
  }));
}
```

- [ ] **Step 4: Run unit tests**

```bash
pnpm test:unit tests/unit/search-listings.test.ts
```

Expected: PASS, all 5 cases.

- [ ] **Step 5: Commit**

```bash
git add lib/listings/search.ts tests/unit/search-listings.test.ts
git commit -m "feat(search): listings search filter + query builder"
```

---

## Task 6: Search bar + category chips on the feed

**Files:**
- Create: `components/feed/search-bar.tsx`
- Create: `components/feed/category-chips.tsx`
- Modify: `app/page.tsx`
- Test: `tests/e2e/feed-search.spec.ts`

- [ ] **Step 1: Write the failing e2e**

```ts
// tests/e2e/feed-search.spec.ts
import { test, expect } from "@playwright/test";
import { signInViaMailpit } from "./helpers/auth";

test("feed filters by search query and category chip", async ({ page, request }) => {
  await signInViaMailpit(page, request, "Searcher Sam");

  // Post two listings with distinct titles + categories
  for (const [title, category] of [
    ["Search target apples here", "Food"],
    ["Unrelated tools post", "Tools"],
  ] as const) {
    await page.goto("/listings/new");
    await page.getByLabel(/type/i).selectOption("offer_goods");
    await page.getByLabel(/title/i).fill(title);
    await page.locator("select[name=category_id]").selectOption({ label: category });
    await page.locator("select[name=area_id]").selectOption({ label: "Quathiaski Cove" });
    await page.getByRole("button", { name: /publish/i }).click();
    await expect(page).toHaveURL(/\/l\/[0-9a-f-]+\//);
  }

  // Plain home shows both
  await page.goto("/");
  await expect(page.getByRole("link", { name: /search target apples/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /unrelated tools/i })).toBeVisible();

  // Search filters
  await page.getByPlaceholder(/search/i).fill("apples");
  await page.getByPlaceholder(/search/i).press("Enter");
  await expect(page).toHaveURL(/\/\?.*q=apples/);
  await expect(page.getByRole("link", { name: /search target apples/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /unrelated tools/i })).toHaveCount(0);

  // Category chip narrows further (still Food, still apples)
  await page.goto("/?c=tools");
  await expect(page.getByRole("link", { name: /unrelated tools/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /search target apples/i })).toHaveCount(0);
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
pnpm test:e2e tests/e2e/feed-search.spec.ts
```

Expected: FAIL — no search bar / no `?q=` / `?c=` handling.

- [ ] **Step 3: Implement SearchBar**

```tsx
// components/feed/search-bar.tsx
export function SearchBar({ defaultValue }: { defaultValue?: string }) {
  return (
    <form method="GET" action="/" className="w-full">
      <input
        type="search"
        name="q"
        defaultValue={defaultValue ?? ""}
        placeholder="Search listings…"
        className="w-full rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        aria-label="Search listings"
      />
    </form>
  );
}
```

- [ ] **Step 4: Implement CategoryChips**

```tsx
// components/feed/category-chips.tsx
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

type Props = {
  /** The currently-active category slug, if any. */
  active?: string;
  /** Preserve the rest of the searchParams (e.g. q=…) when switching chips. */
  baseParams: Record<string, string | undefined>;
};

function withParam(params: Record<string, string | undefined>, key: string, value: string | undefined): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (k !== key && v) sp.set(k, v);
  }
  if (value) sp.set(key, value);
  const s = sp.toString();
  return s ? `/?${s}` : "/";
}

export async function CategoryChips({ active, baseParams }: Props) {
  const supabase = await createClient();
  const { data: cats } = await supabase
    .from("categories")
    .select("slug, name, icon")
    .order("sort_order");

  return (
    <nav className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-2 text-sm" aria-label="Categories">
      <Link
        href={withParam(baseParams, "c", undefined)}
        className={
          "shrink-0 rounded-full border px-3 py-1 " +
          (!active ? "border-emerald-700 bg-emerald-50 text-emerald-900" : "border-zinc-300")
        }
      >
        All
      </Link>
      {(cats ?? []).map((c: any) => (
        <Link
          key={c.slug}
          href={withParam(baseParams, "c", c.slug)}
          className={
            "shrink-0 rounded-full border px-3 py-1 " +
            (active === c.slug ? "border-emerald-700 bg-emerald-50 text-emerald-900" : "border-zinc-300")
          }
        >
          {c.icon && <span className="mr-1">{c.icon}</span>}
          {c.name}
        </Link>
      ))}
    </nav>
  );
}
```

- [ ] **Step 5: Update the home page to use both**

Replace `app/page.tsx` with:

```tsx
// app/page.tsx
import Link from "next/link";
import { searchListings } from "@/lib/listings/search";
import { ListingGrid } from "@/components/listings/listing-grid";
import { SearchBar } from "@/components/feed/search-bar";
import { CategoryChips } from "@/components/feed/category-chips";

export default async function HomePage(
  { searchParams }: { searchParams: Promise<{ q?: string; c?: string; a?: string }> },
) {
  const sp = await searchParams;
  const items = await searchListings({
    q: sp.q,
    categorySlug: sp.c,
    areaSlug: sp.a,
    limit: 24,
  });

  const isFiltered = !!(sp.q || sp.c || sp.a);

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      {!isFiltered && (
        <section className="space-y-3 text-center">
          <h1 className="text-3xl font-semibold sm:text-4xl">
            Swap goods and services on Quadra Island
          </h1>
          <p className="text-zinc-600">No money. Just neighbours trading what they have for what they need.</p>
          <Link
            href="/signin"
            className="inline-block rounded bg-emerald-700 px-4 py-2 text-white"
          >
            Get started
          </Link>
        </section>
      )}

      <div className="space-y-3">
        <SearchBar defaultValue={sp.q} />
        <CategoryChips active={sp.c} baseParams={{ q: sp.q, a: sp.a }} />
      </div>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">
          {isFiltered ? "Results" : "Latest listings"}
        </h2>
        <ListingGrid items={items} emptyText="No listings match your search." />
      </section>
    </main>
  );
}
```

(The previous `revalidate = 60` export is gone — the page reads cookies via `createClient()`, which forces dynamic rendering anyway. Don't add it back.)

- [ ] **Step 6: Run the e2e**

```bash
pnpm test:e2e tests/e2e/feed-search.spec.ts
```

Expected: PASS.

- [ ] **Step 7: Run the full suite**

```bash
pnpm test:e2e
```

Expected: all green. The existing `landing.spec.ts` asserts the hero + "Latest listings" headline; it will still pass because no search params are set.

- [ ] **Step 8: Commit**

```bash
git add components/feed app/page.tsx tests/e2e/feed-search.spec.ts
git commit -m "feat(search): search bar + category chips on home feed"
```

---

## Task 7: Migration — reports table

**Files:**
- Create: `supabase/migrations/0012_reports.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0012_reports.sql
-- Reports: users flag listings, profiles, or messages. Reviewed by admins
-- (admin allowlist gates UI; SELECT here is gated by RLS to admin uids).

create type report_target as enum ('listing', 'user', 'message');
create type report_status as enum ('open', 'resolved', 'dismissed');

create table public.reports (
  id            uuid primary key default gen_random_uuid(),
  reporter_id   uuid not null references public.users(id) on delete cascade,
  target_type   report_target not null,
  target_id     uuid not null,
  reason        text not null check (char_length(reason) between 3 and 1000),
  status        report_status not null default 'open',
  created_at    timestamptz not null default now(),
  resolved_at   timestamptz,
  resolved_by   uuid references public.users(id) on delete set null
);

create index reports_status_idx       on public.reports(status);
create index reports_reporter_idx     on public.reports(reporter_id);
create index reports_target_idx       on public.reports(target_type, target_id);
create index reports_created_idx      on public.reports(created_at desc);

alter table public.reports enable row level security;

-- Reporter can insert their own reports.
create policy "reports: reporter insert"
  on public.reports for insert
  with check (auth.uid() = reporter_id);

-- Reporter can read their own reports (so the UI can show "you already reported this").
create policy "reports: reporter read own"
  on public.reports for select
  using (auth.uid() = reporter_id);

-- No public read; admin reads happen via the service role key (bypasses RLS).
-- We chose the service role pattern instead of a per-uid policy because there
-- is no `is_admin` flag on users; admins are gated at the action layer via
-- ADMIN_USER_IDS.

-- No UPDATE / DELETE policies — admins go through the service role.
```

- [ ] **Step 2: Apply**

```bash
docker exec -i supabase-db psql -U postgres -d postgres < supabase/migrations/0012_reports.sql
```

Expected: no errors.

- [ ] **Step 3: Verify**

```bash
docker exec -i supabase-db psql -U postgres -d postgres -c \
  "select policyname from pg_policies where schemaname='public' and tablename='reports' order by policyname;"
```

Should print 2 policies.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0012_reports.sql
git commit -m "feat(db): reports table + RLS"
```

---

## Task 8: Report button + createReport action

**Files:**
- Create: `lib/reports/validation.ts`
- Create: `lib/reports/actions.ts`
- Create: `components/listings/report-button.tsx`
- Modify: `app/l/[id]/[slug]/page.tsx` (mount the button)

- [ ] **Step 1: Implement validation**

```ts
// lib/reports/validation.ts
import { z } from "zod";

export const REPORT_TARGETS = ["listing", "user", "message"] as const;

export const createReportSchema = z.object({
  target_type: z.enum(REPORT_TARGETS),
  target_id: z.string().uuid(),
  reason: z.string().trim().min(3, "Tell us a bit more").max(1000, "Reason is too long"),
});

export type CreateReportInput = z.infer<typeof createReportSchema>;
```

- [ ] **Step 2: Implement action**

```ts
// lib/reports/actions.ts
"use server";

import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { createReportSchema } from "@/lib/reports/validation";

export async function createReport(formData: FormData): Promise<void> {
  const user = await requireUser();
  const parsed = createReportSchema.parse({
    target_type: formData.get("target_type"),
    target_id: formData.get("target_id"),
    reason: formData.get("reason"),
  });

  const supabase = await createClient();
  const { error } = await supabase
    .from("reports")
    .insert({
      reporter_id: user.id,
      target_type: parsed.target_type,
      target_id: parsed.target_id,
      reason: parsed.reason,
    });
  if (error) throw new Error(error.message);
}
```

- [ ] **Step 3: Implement ReportButton**

```tsx
// components/listings/report-button.tsx
"use client";

import { useState, useTransition } from "react";
import { createReport } from "@/lib/reports/actions";

type Props = {
  targetType: "listing" | "user" | "message";
  targetId: string;
};

export function ReportButton({ targetType, targetId }: Props) {
  const [open, setOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [pending, startTransition] = useTransition();

  if (submitted) return <span className="text-xs text-zinc-500">Report sent — thanks.</span>;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-zinc-500 underline hover:text-zinc-800"
      >
        Report
      </button>
    );
  }

  return (
    <form
      action={(formData) => {
        startTransition(async () => {
          await createReport(formData);
          setSubmitted(true);
        });
      }}
      className="space-y-2 rounded-lg border bg-white p-3"
    >
      <input type="hidden" name="target_type" value={targetType} />
      <input type="hidden" name="target_id" value={targetId} />
      <label htmlFor="report-reason" className="block text-xs font-medium">Why are you reporting this?</label>
      <textarea
        id="report-reason"
        name="reason"
        required
        minLength={3}
        maxLength={1000}
        rows={3}
        className="w-full rounded border px-2 py-1 text-xs"
        placeholder="Spam, prohibited goods, abusive language, …"
      />
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-emerald-700 px-3 py-1 text-xs text-white disabled:opacity-50"
        >
          {pending ? "Sending…" : "Submit report"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded border px-3 py-1 text-xs"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 4: Mount on listing detail**

In `app/l/[id]/[slug]/page.tsx`, add the import:

```tsx
import { ReportButton } from "@/components/listings/report-button";
```

After the existing "Posted by …" `<p>` tag, render the report button (only when the viewer is signed in and not the owner):

```tsx
{viewer && viewer.id !== l.owner.id && (
  <div className="pt-2">
    <ReportButton targetType="listing" targetId={l.id} />
  </div>
)}
```

`viewer` is already defined earlier in the page from `getSessionUser()`.

- [ ] **Step 5: Smoke check**

In a browser, sign in as a user, visit someone else's listing, click "Report", fill the textarea, submit. Confirm "Report sent — thanks." appears. Check the DB:

```bash
docker exec -i supabase-db psql -U postgres -d postgres -c "select id, target_type, target_id, reason, status from public.reports order by created_at desc limit 1;"
```

You should see your row.

- [ ] **Step 6: Commit**

```bash
git add lib/reports components/listings/report-button.tsx app/l/[id]/[slug]/page.tsx
git commit -m "feat(reports): user-facing report button + createReport action"
```

---

## Task 9: Admin auth + queries + actions

**Files:**
- Create: `lib/admin/auth.ts`
- Create: `lib/admin/queries.ts`
- Create: `lib/admin/actions.ts`
- Modify: `.env.local` (add `ADMIN_USER_IDS=<your-uuid>`)

The admin allowlist comes from a comma-separated env var. There's no DB role; we just check membership in the action layer. Because RLS would block an admin from reading other users' reports (the `reports` policies only allow `auth.uid() = reporter_id`), the admin queries use the **service role key** which bypasses RLS. The service role key is already configured in `.env.local` as `SUPABASE_SERVICE_ROLE_KEY` (set up in Plan 1).

- [ ] **Step 1: Implement auth helper**

```ts
// lib/admin/auth.ts
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";

function adminIds(): string[] {
  return (process.env.ADMIN_USER_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function requireAdmin() {
  const user = await requireUser();
  if (!adminIds().includes(user.id)) {
    redirect("/");
  }
  return user;
}
```

- [ ] **Step 2: Implement service-role client + queries**

```ts
// lib/admin/queries.ts
import { createClient as createServiceClient } from "@supabase/supabase-js";

function admin() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

export type ReportRow = {
  id: string;
  reporter_id: string;
  reporter_name: string | null;
  target_type: "listing" | "user" | "message";
  target_id: string;
  reason: string;
  status: "open" | "resolved" | "dismissed";
  created_at: string;
};

export async function listOpenReports(): Promise<ReportRow[]> {
  const supabase = admin();
  const { data, error } = await supabase
    .from("reports")
    .select(`
      id, reporter_id, target_type, target_id, reason, status, created_at,
      reporter:reporter_id ( display_name )
    `)
    .eq("status", "open")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    id: r.id,
    reporter_id: r.reporter_id,
    reporter_name: r.reporter?.display_name ?? null,
    target_type: r.target_type,
    target_id: r.target_id,
    reason: r.reason,
    status: r.status,
    created_at: r.created_at,
  }));
}
```

- [ ] **Step 3: Implement admin actions**

```ts
// lib/admin/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/admin/auth";

function admin() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

export async function resolveReport(formData: FormData): Promise<void> {
  const me = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Missing report id");
  const supabase = admin();
  const { error } = await supabase
    .from("reports")
    .update({ status: "resolved", resolved_at: new Date().toISOString(), resolved_by: me.id })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/reports");
}

export async function dismissReport(formData: FormData): Promise<void> {
  const me = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Missing report id");
  const supabase = admin();
  const { error } = await supabase
    .from("reports")
    .update({ status: "dismissed", resolved_at: new Date().toISOString(), resolved_by: me.id })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/reports");
}

export async function hideListing(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("listing_id") ?? "");
  if (!id) throw new Error("Missing listing_id");
  const supabase = admin();
  const { error } = await supabase
    .from("listings")
    .update({ status: "archived" })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/reports");
  revalidatePath("/");
}

export async function banUser(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("user_id") ?? "");
  if (!id) throw new Error("Missing user_id");
  const supabase = admin();
  const { error } = await supabase
    .from("users")
    .update({ banned_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/reports");
}
```

- [ ] **Step 4: Register your admin uid**

```bash
# Find your uid:
docker exec -i supabase-db psql -U postgres -d postgres -c \
  "select id, email, display_name from public.users order by created_at desc limit 5;"
```

Pick your row's `id` and add it to `.env.local`:

```
ADMIN_USER_IDS=<your-uuid>
```

Restart the dev server so the new env var is loaded.

- [ ] **Step 5: Type-check**

```bash
pnpm tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add lib/admin
git commit -m "feat(admin): admin auth, queries, and moderation actions"
```

---

## Task 10: /admin/reports page

**Files:**
- Create: `app/admin/reports/page.tsx`
- Test: `tests/e2e/report-listing.spec.ts`

The page lists open reports with their target's basic info and three action buttons per row: Resolve, Dismiss, Hide listing (only for `listing` reports), Ban user.

Because the admin route is gated by `requireAdmin()` and we'd need to set `ADMIN_USER_IDS` in CI, the e2e here only exercises the **user-facing report flow** (already covered in Task 8 implicitly). We assert that the report button works and produces a row — admin moderation is verified by hand.

- [ ] **Step 1: Write the e2e**

```ts
// tests/e2e/report-listing.spec.ts
import { test, expect } from "@playwright/test";
import { signInViaMailpit } from "./helpers/auth";

test("user can report a listing they don't own", async ({ browser, request }) => {
  test.setTimeout(60_000);

  // Owner posts
  const ctxO = await browser.newContext();
  const pageO = await ctxO.newPage();
  await signInViaMailpit(pageO, request, "Reportee Owen");
  await pageO.goto("/listings/new");
  await pageO.getByLabel(/type/i).selectOption("offer_goods");
  await pageO.getByLabel(/title/i).fill("Reportable rutabaga");
  await pageO.locator("select[name=category_id]").selectOption({ label: "Food" });
  await pageO.locator("select[name=area_id]").selectOption({ label: "Quathiaski Cove" });
  await pageO.getByRole("button", { name: /publish/i }).click();
  await expect(pageO).toHaveURL(/\/l\/[0-9a-f-]+\//);
  const url = pageO.url();

  // Reporter sees it and reports
  const ctxR = await browser.newContext();
  const pageR = await ctxR.newPage();
  await signInViaMailpit(pageR, request, "Reporter Rita");
  await pageR.goto(url);
  await pageR.getByRole("button", { name: /^report$/i }).click();
  await pageR.getByLabel(/why are you reporting/i).fill("Test report — please ignore.");
  await pageR.getByRole("button", { name: /submit report/i }).click();
  await expect(pageR.getByText(/report sent/i)).toBeVisible();
});
```

- [ ] **Step 2: Run to verify it fails / passes**

```bash
pnpm test:e2e tests/e2e/report-listing.spec.ts
```

If you completed Task 8 cleanly, this should already PASS without writing the admin page yet — the test only exercises the user-facing flow. If it fails because the report button isn't on the listing page, fix Task 8 before continuing.

- [ ] **Step 3: Implement the admin page**

```tsx
// app/admin/reports/page.tsx
import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { listOpenReports } from "@/lib/admin/queries";
import { resolveReport, dismissReport, hideListing, banUser } from "@/lib/admin/actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reports — Admin", robots: { index: false, follow: false } };

export default async function AdminReportsPage() {
  await requireAdmin();
  const reports = await listOpenReports();

  return (
    <main className="mx-auto max-w-4xl space-y-4 p-6">
      <h1 className="text-2xl font-semibold">Open reports</h1>
      {reports.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-zinc-500">
          Nothing to moderate. ☕
        </p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {reports.map((r) => (
            <li key={r.id} className="space-y-2 p-4">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-sm">
                  <span className="font-medium">{r.reporter_name ?? "Someone"}</span>{" "}
                  reported a <span className="font-medium">{r.target_type}</span>:
                </p>
                <span className="text-xs text-zinc-500">{new Date(r.created_at).toLocaleString()}</span>
              </div>
              <p className="rounded bg-zinc-50 p-2 text-sm whitespace-pre-line">{r.reason}</p>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {r.target_type === "listing" && (
                  <Link
                    href={`/l/${r.target_id}/_`}
                    target="_blank"
                    className="rounded border px-2 py-1"
                  >
                    Open listing
                  </Link>
                )}
                {r.target_type === "user" && (
                  <Link
                    href={`/u/${r.target_id}`}
                    target="_blank"
                    className="rounded border px-2 py-1"
                  >
                    Open profile
                  </Link>
                )}
                <form action={resolveReport}>
                  <input type="hidden" name="id" value={r.id} />
                  <button className="rounded bg-emerald-700 px-2 py-1 text-white">Resolve</button>
                </form>
                <form action={dismissReport}>
                  <input type="hidden" name="id" value={r.id} />
                  <button className="rounded border px-2 py-1">Dismiss</button>
                </form>
                {r.target_type === "listing" && (
                  <form action={hideListing}>
                    <input type="hidden" name="listing_id" value={r.target_id} />
                    <button className="rounded border border-red-300 px-2 py-1 text-red-700">
                      Hide listing
                    </button>
                  </form>
                )}
                {r.target_type === "user" && (
                  <form action={banUser}>
                    <input type="hidden" name="user_id" value={r.target_id} />
                    <button className="rounded border border-red-300 px-2 py-1 text-red-700">
                      Ban user
                    </button>
                  </form>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
```

- [ ] **Step 4: Smoke check (manual)**

With your uid registered in `.env.local`, visit http://localhost:3000/admin/reports — you should see the report from the Step 2 e2e (or any reports you've made by hand). Click Resolve. The report disappears.

Visit `/admin/reports` from a different account → redirects to `/`.

- [ ] **Step 5: Commit**

```bash
git add app/admin tests/e2e/report-listing.spec.ts
git commit -m "feat(admin): /admin/reports moderator queue"
```

---

## Task 11: Sitemap

**Files:**
- Create: `app/sitemap.ts`
- Test: `tests/unit/sitemap.test.ts`

Next.js 16 generates `sitemap.xml` from a default-exported function in `app/sitemap.ts`. We pull all active listings + categories + areas + the static page set.

- [ ] **Step 1: Write the failing test**

The pure helper that builds entries from a listing row is the thing we test.

```ts
// tests/unit/sitemap.test.ts
import { describe, expect, it } from "vitest";
import { buildSitemapEntries, type SitemapInputs } from "@/app/sitemap";

const fixture: SitemapInputs = {
  origin: "https://quadrabarter.ca",
  listings: [
    { id: "11111111-1111-1111-1111-111111111111", slug: "apples", updated_at: "2026-05-01T00:00:00Z" },
  ],
  categories: [{ slug: "food" }],
  areas: [{ slug: "quathiaski-cove" }],
};

describe("buildSitemapEntries", () => {
  it("includes the home + static pages", () => {
    const entries = buildSitemapEntries(fixture);
    expect(entries.find((e) => e.url === "https://quadrabarter.ca")).toBeTruthy();
  });

  it("includes one URL per listing", () => {
    const entries = buildSitemapEntries(fixture);
    const u = "https://quadrabarter.ca/l/11111111-1111-1111-1111-111111111111/apples";
    const e = entries.find((x) => x.url === u);
    expect(e).toBeTruthy();
    expect(e?.lastModified).toEqual(new Date("2026-05-01T00:00:00Z"));
  });

  it("includes a URL per category and area", () => {
    const entries = buildSitemapEntries(fixture);
    expect(entries.find((e) => e.url === "https://quadrabarter.ca/c/food")).toBeTruthy();
    expect(entries.find((e) => e.url === "https://quadrabarter.ca/area/quathiaski-cove")).toBeTruthy();
  });

  it("never returns duplicate urls", () => {
    const entries = buildSitemapEntries(fixture);
    const urls = entries.map((e) => e.url);
    expect(new Set(urls).size).toBe(urls.length);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
pnpm test:unit tests/unit/sitemap.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// app/sitemap.ts
import type { MetadataRoute } from "next";
import { createClient } from "@/lib/supabase/server";

export const revalidate = 3600; // hourly

const ORIGIN = process.env.NEXT_PUBLIC_SITE_ORIGIN ?? "http://localhost:3000";

export type SitemapInputs = {
  origin: string;
  listings: { id: string; slug: string; updated_at: string }[];
  categories: { slug: string }[];
  areas: { slug: string }[];
};

export function buildSitemapEntries(inputs: SitemapInputs): MetadataRoute.Sitemap {
  const { origin, listings, categories, areas } = inputs;
  const out: MetadataRoute.Sitemap = [];
  out.push({ url: origin, lastModified: new Date(), changeFrequency: "daily", priority: 1 });
  for (const l of listings) {
    out.push({
      url: `${origin}/l/${l.id}/${l.slug}`,
      lastModified: new Date(l.updated_at),
      changeFrequency: "weekly",
      priority: 0.8,
    });
  }
  for (const c of categories) {
    out.push({
      url: `${origin}/c/${c.slug}`,
      changeFrequency: "daily",
      priority: 0.6,
    });
  }
  for (const a of areas) {
    out.push({
      url: `${origin}/area/${a.slug}`,
      changeFrequency: "daily",
      priority: 0.6,
    });
  }
  return out;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = await createClient();
  const [{ data: listings }, { data: categories }, { data: areas }] = await Promise.all([
    supabase.from("listings").select("id, slug, updated_at").eq("status", "active"),
    supabase.from("categories").select("slug"),
    supabase.from("areas").select("slug"),
  ]);

  return buildSitemapEntries({
    origin: ORIGIN,
    listings: (listings ?? []) as any,
    categories: (categories ?? []) as any,
    areas: (areas ?? []) as any,
  });
}
```

- [ ] **Step 4: Run unit + smoke check**

```bash
pnpm test:unit tests/unit/sitemap.test.ts
curl -s http://localhost:3000/sitemap.xml | head -40
```

Expected: tests pass; the curl returns valid XML with multiple `<url>` entries.

- [ ] **Step 5: Commit**

```bash
git add app/sitemap.ts tests/unit/sitemap.test.ts
git commit -m "feat(seo): dynamic sitemap.xml"
```

---

## Task 12: robots.txt + llms.txt

**Files:**
- Create: `app/robots.ts`
- Create: `app/llms.txt/route.ts`

- [ ] **Step 1: Implement robots.ts**

```ts
// app/robots.ts
import type { MetadataRoute } from "next";

const ORIGIN = process.env.NEXT_PUBLIC_SITE_ORIGIN ?? "http://localhost:3000";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        // LLM crawlers are explicitly invited.
        userAgent: ["GPTBot", "ClaudeBot", "PerplexityBot", "Google-Extended", "Bingbot"],
        allow: "/",
        disallow: ["/api", "/chats", "/me", "/admin", "/onboarding"],
      },
      {
        // Default: anyone else.
        userAgent: "*",
        allow: "/",
        disallow: ["/api", "/chats", "/me", "/admin", "/onboarding"],
      },
    ],
    sitemap: `${ORIGIN}/sitemap.xml`,
  };
}
```

- [ ] **Step 2: Implement llms.txt route**

The `/llms.txt` convention is a single-file overview pointing crawlers at curated entry points.

```ts
// app/llms.txt/route.ts
const ORIGIN = process.env.NEXT_PUBLIC_SITE_ORIGIN ?? "http://localhost:3000";

const BODY = `# Quadra Barter

Quadra Barter is a swap-only marketplace for residents and visitors of
Quadra Island, BC. Listings are trades only — no money. Categories
include Food, Crafts, Tools, Clothing, Books, Garden, Outdoor, and
Services. Listings show one of three types: offering goods, offering a
service, or seeking something.

## Browse

- ${ORIGIN}/ — homepage with the latest listings
- ${ORIGIN}/c/food — Food
- ${ORIGIN}/c/crafts — Crafts
- ${ORIGIN}/c/tools — Tools
- ${ORIGIN}/c/clothing — Clothing
- ${ORIGIN}/c/books — Books
- ${ORIGIN}/c/garden — Garden
- ${ORIGIN}/c/outdoor — Outdoor
- ${ORIGIN}/c/services — Services
- ${ORIGIN}/area/quathiaski-cove — Quathiaski Cove
- ${ORIGIN}/area/heriot-bay — Heriot Bay
- ${ORIGIN}/area/cape-mudge — Cape Mudge
- ${ORIGIN}/area/granite-bay — Granite Bay
- ${ORIGIN}/area/we-wai-kai — We Wai Kai
- ${ORIGIN}/area/whaletown — Whaletown

## Sitemap

${ORIGIN}/sitemap.xml
`;

export function GET() {
  return new Response(BODY, {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" },
  });
}
```

- [ ] **Step 3: Smoke check**

```bash
curl -s http://localhost:3000/robots.txt | head -40
curl -s http://localhost:3000/llms.txt   | head -10
```

Expected: robots.txt lists the user-agents and a Sitemap line; llms.txt starts with `# Quadra Barter`.

- [ ] **Step 4: Commit**

```bash
git add app/robots.ts app/llms.txt
git commit -m "feat(seo): robots.txt + llms.txt"
```

---

## Out of scope (intentionally)

These belong to later plans:

- **Pretty handles `/u/[handle]`** with collision handling — Plan 5.
- **Image transforms via imgproxy** — Plan 5.
- **Client-side image resize before upload** — Plan 5.
- **Drag-reorder of photos** — Plan 5.
- **Realtime chat (Supabase Realtime channels)** — Plan 5.
- **14-day auto-confirm of pending trades** — Plan 5.
- **Web push notifications** — Plan 5.
- **Disputed-trade flow + appeal UI** — later.
- **PWA install prompt + service worker** — later.
- **`/about`, `/how-it-works`, `/safety` static content pages** — copywriting pass.
- **Admin role table + UI to manage admins** — v2.
- **Search ranking / relevance** — using `ilike` for now; Postgres `tsvector` if perf demands.
- **Chat unread badge in header** — small polish, defer.

## Done means

- A non-owner viewing any listing sees the owner's actual display name (linked to `/u/[id]`) and rating summary.
- The home feed has a search bar and category chips, both URL-driven and crawlable.
- Users can report a listing; an admin can moderate via `/admin/reports`.
- `sitemap.xml`, `robots.txt`, and `llms.txt` all return well-formed responses pointing at the public surface.
- 37 + 4 = 41 unit tests pass; 9 + 3 = 12 e2e tests pass.
- Migrations 0011 + 0012 apply cleanly on a fresh stack.
