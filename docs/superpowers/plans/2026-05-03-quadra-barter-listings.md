# Quadra Barter — Listings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let signed-in users post offer / wanted / service listings with photos, browse a feed, view detail pages indexable by search engines and LLMs, and manage their own listings.

**Architecture:** Postgres tables behind RLS. Photos in a public Supabase Storage bucket; INSERT/DELETE gated by RLS so only the owner can write. Server actions handle create/edit/archive — uploads go through the server (no client-side resize in v1). Server-rendered pages everywhere except `/me/*` for SEO. URL shape: `/l/[id]/[slug]`, `/c/[slug]`, `/area/[slug]`.

**Tech Stack:** Next.js 16 App Router (server actions + RSC), TypeScript, Supabase (Postgres + Storage) via `@supabase/ssr`, Zod for validation, Tailwind v4 + shadcn/ui, Vitest (unit), Playwright (e2e).

**Decisions baked in (call out before starting):**
- **Photos via server action.** Form posts FormData with file blobs; server action uploads to Storage and inserts rows in one transaction-ish path. Simpler RLS, no signed-URL dance. Reconsider if perf becomes an issue.
- **No client-side resize for v1.** Enforce 5MB-per-file + 6-photo cap server-side. Add browser-image-compression or canvas resize later under "polish".
- **Imgproxy / transforms deferred.** Listings serve raw uploaded URLs. Transformation happens in Plan 4.
- **Feed lives at `/`.** Current marketing copy moves into a small hero strip above the feed; the `Get started` CTA still goes to `/signin`. Empty state covers "no listings yet".
- **Categories are seeded constants** (Food, Crafts, Tools, Clothing, Books, Garden, Outdoor, Services, Other). Adding categories is a SQL change, not a feature.

---

## File structure

**New files:**
- `supabase/migrations/0003_listings.sql` — tables: listings, listing_images, categories, plus seed for categories
- `supabase/migrations/0004_listings_rls.sql` — RLS policies
- `supabase/migrations/0005_listings_storage.sql` — public bucket + storage policies
- `lib/slug.ts` — `slugify(title)` helper
- `lib/listings/validation.ts` — Zod schemas (`createListingSchema`, `editListingSchema`)
- `lib/listings/actions.ts` — server actions (`createListing`, `editListing`, `archiveListing`)
- `lib/listings/queries.ts` — server-side data fetchers (`listFeed`, `getListing`, `listMyListings`, `listByCategory`, `listByArea`)
- `lib/img.ts` — `listingImageUrl(path)` returns the public Supabase Storage URL
- `components/listings/listing-card.tsx` — single listing card (used in feed + grids)
- `components/listings/listing-grid.tsx` — responsive grid wrapper
- `components/listings/photo-uploader.tsx` — client component, file picker + previews + drag-reorder
- `components/listings/type-badge.tsx` — small badge for offer / service / want
- `app/listings/new/page.tsx` — create form
- `app/l/[id]/[slug]/page.tsx` — listing detail (server-rendered)
- `app/c/[slug]/page.tsx` — listings by category
- `app/area/[slug]/page.tsx` — listings by area
- `app/me/listings/page.tsx` — manage own listings
- `app/me/listings/[id]/edit/page.tsx` — edit form
- `tests/unit/slug.test.ts`
- `tests/unit/listings-validation.test.ts`
- `tests/unit/listings-queries.test.ts`
- `tests/e2e/listings-create.spec.ts`
- `tests/e2e/listings-detail.spec.ts`
- `tests/e2e/listings-manage.spec.ts`

**Modified files:**
- `app/page.tsx` — replace static landing with feed (RSC, calls `listFeed`)
- `components/site-header.tsx` — add "Post" link (visible when signed in) → `/listings/new`
- `package.json` — add `zod`
- `tests/e2e/landing.spec.ts` — update to expect feed + hero, not standalone marketing copy

---

## Task 1: Migration — listings, listing_images, categories

**Files:**
- Create: `supabase/migrations/0003_listings.sql`
- Modify: `supabase/seed.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0003_listings.sql
-- Listings core tables.

create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  icon        text,                       -- emoji or icon-set key
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now()
);

create type listing_type   as enum ('offer_goods', 'offer_service', 'want');
create type listing_status as enum ('active', 'reserved', 'completed', 'archived');

create table public.listings (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null references public.users(id) on delete cascade,
  type              listing_type not null,
  title             text not null,
  slug              text not null,
  description       text,
  category_id       uuid references public.categories(id) on delete set null,
  area_id           uuid references public.areas(id) on delete set null,
  wants_text        text,                 -- "what I'd swap for", free text
  accepts_credits   boolean not null default false,
  status            listing_status not null default 'active',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  expires_at        timestamptz
);

create index listings_owner_idx     on public.listings(owner_id);
create index listings_category_idx  on public.listings(category_id);
create index listings_area_idx      on public.listings(area_id);
create index listings_status_idx    on public.listings(status);
create index listings_created_idx   on public.listings(created_at desc);

create table public.listing_images (
  id          uuid primary key default gen_random_uuid(),
  listing_id  uuid not null references public.listings(id) on delete cascade,
  path        text not null,              -- object path in Storage bucket "listings"
  alt_text    text,
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now()
);

create index listing_images_listing_idx on public.listing_images(listing_id);

-- Keep updated_at fresh.
create or replace function public.tg_listings_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger listings_set_updated_at
  before update on public.listings
  for each row execute function public.tg_listings_set_updated_at();
```

- [ ] **Step 2: Append category seed**

Append to `supabase/seed.sql`:

```sql

insert into public.categories (slug, name, icon, sort_order) values
  ('food',     'Food',     '🥖', 10),
  ('crafts',   'Crafts',   '🧶', 20),
  ('tools',    'Tools',    '🛠️', 30),
  ('clothing', 'Clothing', '👕', 40),
  ('books',    'Books',    '📚', 50),
  ('garden',   'Garden',   '🌱', 60),
  ('outdoor',  'Outdoor',  '🏕️', 70),
  ('services', 'Services', '🔧', 80),
  ('other',    'Other',    '✳️', 99)
on conflict (slug) do nothing;
```

- [ ] **Step 3: Apply the migration**

Run from repo root:

```bash
docker exec -i supabase-db psql -U postgres -d postgres < supabase/migrations/0003_listings.sql
docker exec -i supabase-db psql -U postgres -d postgres < supabase/seed.sql
```

Expected: no errors. Verify:

```bash
docker exec -i supabase-db psql -U postgres -d postgres -c "select slug, name from public.categories order by sort_order;"
```

Should print all 9 categories.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0003_listings.sql supabase/seed.sql
git commit -m "feat(db): listings, listing_images, categories tables + seed"
```

---

## Task 2: Migration — RLS policies for listings

**Files:**
- Create: `supabase/migrations/0004_listings_rls.sql`

- [ ] **Step 1: Write the policies**

```sql
-- supabase/migrations/0004_listings_rls.sql
-- RLS for listings + listing_images + categories.

alter table public.categories     enable row level security;
alter table public.listings       enable row level security;
alter table public.listing_images enable row level security;

-- Categories: public reference data.
create policy "categories readable by anyone"
  on public.categories for select using (true);

-- Listings:
-- Anyone can read active listings (powers the public feed + LLM/SEO crawlers).
-- Owners can read their own regardless of status.
create policy "listings public read active"
  on public.listings for select using (status = 'active');

create policy "listings owner read all"
  on public.listings for select using (auth.uid() = owner_id);

create policy "listings owner insert"
  on public.listings for insert with check (auth.uid() = owner_id);

create policy "listings owner update"
  on public.listings for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- Soft-delete only via update (status='archived'); no hard DELETE from clients.
-- (No DELETE policy = denied by default.)

-- Listing images: public read for active listings, owner write.
create policy "listing_images public read active"
  on public.listing_images for select using (
    exists (
      select 1 from public.listings l
       where l.id = listing_images.listing_id
         and l.status = 'active'
    )
  );

create policy "listing_images owner read all"
  on public.listing_images for select using (
    exists (
      select 1 from public.listings l
       where l.id = listing_images.listing_id
         and l.owner_id = auth.uid()
    )
  );

create policy "listing_images owner insert"
  on public.listing_images for insert with check (
    exists (
      select 1 from public.listings l
       where l.id = listing_images.listing_id
         and l.owner_id = auth.uid()
    )
  );

create policy "listing_images owner update"
  on public.listing_images for update using (
    exists (
      select 1 from public.listings l
       where l.id = listing_images.listing_id
         and l.owner_id = auth.uid()
    )
  );

create policy "listing_images owner delete"
  on public.listing_images for delete using (
    exists (
      select 1 from public.listings l
       where l.id = listing_images.listing_id
         and l.owner_id = auth.uid()
    )
  );
```

- [ ] **Step 2: Apply**

```bash
docker exec -i supabase-db psql -U postgres -d postgres < supabase/migrations/0004_listings_rls.sql
```

Expected: no errors.

- [ ] **Step 3: Sanity check policies are in place**

```bash
docker exec -i supabase-db psql -U postgres -d postgres -c \
  "select tablename, policyname from pg_policies where schemaname='public' and tablename in ('listings','listing_images','categories') order by tablename, policyname;"
```

Should list all the policies created above.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0004_listings_rls.sql
git commit -m "feat(db): RLS policies for listings, listing_images, categories"
```

---

## Task 3: Migration — Storage bucket "listings" + storage RLS

**Files:**
- Create: `supabase/migrations/0005_listings_storage.sql`

- [ ] **Step 1: Write the migration**

The `storage.objects.name` is the path within the bucket. We require all object names to start with the listing UUID, e.g. `<listing_id>/<n>.<ext>`. RLS joins through `public.listings` to verify the caller owns that listing.

```sql
-- supabase/migrations/0005_listings_storage.sql
-- Public bucket for listing photos. Path convention: "<listing_id>/<n>.<ext>".

insert into storage.buckets (id, name, public)
values ('listings', 'listings', true)
on conflict (id) do nothing;

-- Public read (already implied by bucket public=true, but explicit for clarity).
create policy "listings bucket: public read"
  on storage.objects for select
  using (bucket_id = 'listings');

-- Authed users can write only into a path whose first segment is a listing
-- they own.
create policy "listings bucket: owner insert"
  on storage.objects for insert
  with check (
    bucket_id = 'listings'
    and exists (
      select 1 from public.listings l
       where l.id::text = split_part(name, '/', 1)
         and l.owner_id = auth.uid()
    )
  );

create policy "listings bucket: owner update"
  on storage.objects for update
  using (
    bucket_id = 'listings'
    and exists (
      select 1 from public.listings l
       where l.id::text = split_part(name, '/', 1)
         and l.owner_id = auth.uid()
    )
  );

create policy "listings bucket: owner delete"
  on storage.objects for delete
  using (
    bucket_id = 'listings'
    and exists (
      select 1 from public.listings l
       where l.id::text = split_part(name, '/', 1)
         and l.owner_id = auth.uid()
    )
  );
```

- [ ] **Step 2: Apply**

```bash
docker exec -i supabase-db psql -U postgres -d postgres < supabase/migrations/0005_listings_storage.sql
```

Expected: no errors.

- [ ] **Step 3: Verify the bucket exists**

```bash
docker exec -i supabase-db psql -U postgres -d postgres -c \
  "select id, name, public from storage.buckets where id='listings';"
```

Should return one row with `public = t`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0005_listings_storage.sql
git commit -m "feat(db): public listings storage bucket + owner-write RLS"
```

---

## Task 4: Slug helper

**Files:**
- Create: `lib/slug.ts`
- Test: `tests/unit/slug.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/slug.test.ts
import { describe, expect, it } from "vitest";
import { slugify } from "@/lib/slug";

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("Hello World")).toBe("hello-world");
  });

  it("strips punctuation", () => {
    expect(slugify("Apples & oranges, half-ripe!")).toBe("apples-oranges-half-ripe");
  });

  it("collapses runs of whitespace and dashes", () => {
    expect(slugify("  too   many   spaces  ")).toBe("too-many-spaces");
    expect(slugify("a---b")).toBe("a-b");
  });

  it("strips diacritics", () => {
    expect(slugify("Café crème")).toBe("cafe-creme");
  });

  it("truncates to 60 chars on a word boundary", () => {
    const long = "a".repeat(80);
    expect(slugify(long).length).toBeLessThanOrEqual(60);
  });

  it("returns 'untitled' for empty input", () => {
    expect(slugify("")).toBe("untitled");
    expect(slugify("   ---   ")).toBe("untitled");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test:unit tests/unit/slug.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// lib/slug.ts
const MAX_LEN = 60;

export function slugify(input: string): string {
  const normalized = input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!normalized) return "untitled";

  if (normalized.length <= MAX_LEN) return normalized;

  // Truncate, then trim back to last hyphen so we don't cut a word.
  const cut = normalized.slice(0, MAX_LEN);
  const lastDash = cut.lastIndexOf("-");
  return lastDash > 0 ? cut.slice(0, lastDash) : cut;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm test:unit tests/unit/slug.test.ts
```

Expected: PASS, all 6 cases.

- [ ] **Step 5: Commit**

```bash
git add lib/slug.ts tests/unit/slug.test.ts
git commit -m "feat(listings): slugify helper for listing URLs"
```

---

## Task 5: Listing validation (Zod)

**Files:**
- Modify: `package.json` (add `zod`)
- Create: `lib/listings/validation.ts`
- Test: `tests/unit/listings-validation.test.ts`

- [ ] **Step 1: Add zod**

```bash
pnpm add zod
```

- [ ] **Step 2: Write the failing test**

```ts
// tests/unit/listings-validation.test.ts
import { describe, expect, it } from "vitest";
import { createListingSchema } from "@/lib/listings/validation";

const valid = {
  type: "offer_goods" as const,
  title: "Two ripe apples",
  description: "From our backyard tree",
  category_id: "11111111-1111-1111-1111-111111111111",
  area_id:     "22222222-2222-2222-2222-222222222222",
  wants_text: "Eggs or jam",
  accepts_credits: false,
};

describe("createListingSchema", () => {
  it("accepts valid input", () => {
    const r = createListingSchema.safeParse(valid);
    expect(r.success).toBe(true);
  });

  it("rejects too-short title", () => {
    const r = createListingSchema.safeParse({ ...valid, title: "ab" });
    expect(r.success).toBe(false);
  });

  it("rejects too-long title", () => {
    const r = createListingSchema.safeParse({ ...valid, title: "x".repeat(121) });
    expect(r.success).toBe(false);
  });

  it("rejects unknown listing type", () => {
    const r = createListingSchema.safeParse({ ...valid, type: "barter" });
    expect(r.success).toBe(false);
  });

  it("requires category_id and area_id as uuids", () => {
    const r = createListingSchema.safeParse({ ...valid, category_id: "nope" });
    expect(r.success).toBe(false);
  });

  it("trims title whitespace", () => {
    const r = createListingSchema.safeParse({ ...valid, title: "   Apples   " });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.title).toBe("Apples");
  });

  it("description is optional, max 2000", () => {
    const without = createListingSchema.safeParse({ ...valid, description: undefined });
    expect(without.success).toBe(true);
    const tooLong = createListingSchema.safeParse({ ...valid, description: "x".repeat(2001) });
    expect(tooLong.success).toBe(false);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
pnpm test:unit tests/unit/listings-validation.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 4: Implement**

```ts
// lib/listings/validation.ts
import { z } from "zod";

export const LISTING_TYPES = ["offer_goods", "offer_service", "want"] as const;
export type ListingType = (typeof LISTING_TYPES)[number];

export const createListingSchema = z.object({
  type: z.enum(LISTING_TYPES),
  title: z.string().trim().min(3, "Title is too short").max(120, "Title is too long"),
  description: z.string().trim().max(2000).optional(),
  category_id: z.string().uuid(),
  area_id: z.string().uuid(),
  wants_text: z.string().trim().max(500).optional(),
  accepts_credits: z.boolean().default(false),
});

export type CreateListingInput = z.infer<typeof createListingSchema>;

export const editListingSchema = createListingSchema.partial().extend({
  id: z.string().uuid(),
});

export type EditListingInput = z.infer<typeof editListingSchema>;
```

- [ ] **Step 5: Run test to verify it passes**

```bash
pnpm test:unit tests/unit/listings-validation.test.ts
```

Expected: PASS, all cases.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml lib/listings/validation.ts tests/unit/listings-validation.test.ts
git commit -m "feat(listings): zod schemas for create/edit input"
```

---

## Task 6: createListing server action

**Files:**
- Create: `lib/listings/actions.ts`
- Create: `lib/listings/queries.ts` (stub `getListing` for redirect-after-create)
- Test: `tests/unit/listings-actions.test.ts`

The action accepts FormData (typed inputs + 0–6 image files), validates, inserts the listing, uploads each file to `listings/<listing_id>/<n>.<ext>`, inserts `listing_images` rows, and returns `{ id, slug }` on success.

- [ ] **Step 1: Write the failing test**

We test the inner pure function `buildListingRow(input, ownerId)` and the file-validation helper `validateImageFiles(files)` so we don't need a live Supabase client in unit tests.

```ts
// tests/unit/listings-actions.test.ts
import { describe, expect, it } from "vitest";
import { buildListingRow, validateImageFiles, MAX_IMAGES, MAX_FILE_BYTES } from "@/lib/listings/actions";

const validInput = {
  type: "offer_goods" as const,
  title: "Two ripe apples",
  description: undefined,
  category_id: "11111111-1111-1111-1111-111111111111",
  area_id:     "22222222-2222-2222-2222-222222222222",
  wants_text: undefined,
  accepts_credits: false,
};

function makeFile(name: string, bytes: number, type = "image/jpeg"): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

describe("buildListingRow", () => {
  it("derives slug from title and stamps owner_id", () => {
    const row = buildListingRow(validInput, "owner-uuid");
    expect(row.owner_id).toBe("owner-uuid");
    expect(row.slug).toBe("two-ripe-apples");
    expect(row.title).toBe("Two ripe apples");
    expect(row.status).toBe("active");
  });
});

describe("validateImageFiles", () => {
  it("accepts 0 files", () => {
    expect(() => validateImageFiles([])).not.toThrow();
  });

  it("accepts up to MAX_IMAGES image files", () => {
    const files = Array.from({ length: MAX_IMAGES }, (_, i) => makeFile(`p${i}.jpg`, 1000));
    expect(() => validateImageFiles(files)).not.toThrow();
  });

  it("rejects more than MAX_IMAGES", () => {
    const files = Array.from({ length: MAX_IMAGES + 1 }, (_, i) => makeFile(`p${i}.jpg`, 1000));
    expect(() => validateImageFiles(files)).toThrow(/at most/i);
  });

  it("rejects files over MAX_FILE_BYTES", () => {
    expect(() => validateImageFiles([makeFile("big.jpg", MAX_FILE_BYTES + 1)])).toThrow(/too large/i);
  });

  it("rejects non-image mime types", () => {
    expect(() => validateImageFiles([makeFile("x.exe", 100, "application/octet-stream")])).toThrow(/image/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test:unit tests/unit/listings-actions.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// lib/listings/actions.ts
"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { slugify } from "@/lib/slug";
import { createListingSchema, type CreateListingInput } from "@/lib/listings/validation";

export const MAX_IMAGES = 6;
export const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB

export type ListingRow = {
  owner_id: string;
  type: CreateListingInput["type"];
  title: string;
  slug: string;
  description: string | null;
  category_id: string;
  area_id: string;
  wants_text: string | null;
  accepts_credits: boolean;
  status: "active";
};

export function buildListingRow(input: CreateListingInput, ownerId: string): ListingRow {
  return {
    owner_id: ownerId,
    type: input.type,
    title: input.title,
    slug: slugify(input.title),
    description: input.description ?? null,
    category_id: input.category_id,
    area_id: input.area_id,
    wants_text: input.wants_text ?? null,
    accepts_credits: input.accepts_credits,
    status: "active",
  };
}

export function validateImageFiles(files: File[]): void {
  if (files.length > MAX_IMAGES) {
    throw new Error(`Please attach at most ${MAX_IMAGES} photos.`);
  }
  for (const f of files) {
    if (f.size > MAX_FILE_BYTES) {
      throw new Error(`"${f.name}" is too large (max 5 MB).`);
    }
    if (!f.type.startsWith("image/")) {
      throw new Error(`"${f.name}" is not an image file.`);
    }
  }
}

function fileExt(name: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(name);
  return (m?.[1] ?? "jpg").toLowerCase();
}

export async function createListing(form: FormData): Promise<void> {
  const user = await requireUser();

  const raw = {
    type: form.get("type"),
    title: form.get("title"),
    description: form.get("description") || undefined,
    category_id: form.get("category_id"),
    area_id: form.get("area_id"),
    wants_text: form.get("wants_text") || undefined,
    accepts_credits: form.get("accepts_credits") === "on",
  };
  const parsed = createListingSchema.parse(raw);

  const files = form.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
  validateImageFiles(files);

  const supabase = await createClient();
  const row = buildListingRow(parsed, user.id);

  const { data: listing, error: insertErr } = await supabase
    .from("listings")
    .insert(row)
    .select("id, slug")
    .single();
  if (insertErr || !listing) throw new Error(insertErr?.message ?? "Could not create listing");

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const path = `${listing.id}/${i}.${fileExt(file.name)}`;
    const { error: upErr } = await supabase.storage.from("listings").upload(path, file, {
      contentType: file.type,
      upsert: false,
    });
    if (upErr) throw new Error(`Upload failed for ${file.name}: ${upErr.message}`);

    const { error: imgErr } = await supabase.from("listing_images").insert({
      listing_id: listing.id,
      path,
      sort_order: i,
    });
    if (imgErr) throw new Error(imgErr.message);
  }

  redirect(`/l/${listing.id}/${listing.slug}`);
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm test:unit tests/unit/listings-actions.test.ts
```

Expected: PASS, all cases.

- [ ] **Step 5: Commit**

```bash
git add lib/listings/actions.ts tests/unit/listings-actions.test.ts
git commit -m "feat(listings): createListing server action with image upload"
```

---

## Task 7: Listing queries + image URL helper

**Files:**
- Create: `lib/listings/queries.ts`
- Create: `lib/img.ts`
- Test: `tests/unit/img.test.ts`

The queries module centralizes reads. We test only `listingImageUrl` (pure) at unit level; query functions are exercised by e2e.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/img.test.ts
import { describe, expect, it, beforeEach } from "vitest";
import { listingImageUrl } from "@/lib/img";

describe("listingImageUrl", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:8000";
  });

  it("builds the public storage URL", () => {
    expect(listingImageUrl("abc/0.jpg")).toBe(
      "http://localhost:8000/storage/v1/object/public/listings/abc/0.jpg",
    );
  });

  it("strips a leading slash from the path", () => {
    expect(listingImageUrl("/abc/0.jpg")).toBe(
      "http://localhost:8000/storage/v1/object/public/listings/abc/0.jpg",
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test:unit tests/unit/img.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement helpers + queries**

```ts
// lib/img.ts
export function listingImageUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const clean = path.replace(/^\/+/, "");
  return `${base}/storage/v1/object/public/listings/${clean}`;
}
```

```ts
// lib/listings/queries.ts
import { createClient } from "@/lib/supabase/server";

export type FeedItem = {
  id: string;
  slug: string;
  title: string;
  type: "offer_goods" | "offer_service" | "want";
  area_name: string | null;
  category_name: string | null;
  cover_path: string | null;
  created_at: string;
};

const FEED_SELECT = `
  id, slug, title, type, created_at,
  areas:area_id ( name ),
  categories:category_id ( name ),
  listing_images ( path, sort_order )
`;

function shapeFeedRow(r: any): FeedItem {
  const cover = (r.listing_images ?? [])
    .slice()
    .sort((a: any, b: any) => a.sort_order - b.sort_order)[0]?.path ?? null;
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    type: r.type,
    area_name: r.areas?.name ?? null,
    category_name: r.categories?.name ?? null,
    cover_path: cover,
    created_at: r.created_at,
  };
}

export async function listFeed(limit = 30): Promise<FeedItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("listings")
    .select(FEED_SELECT)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map(shapeFeedRow);
}

export async function listByCategory(slug: string, limit = 60): Promise<FeedItem[]> {
  const supabase = await createClient();
  const { data: cat } = await supabase.from("categories").select("id, name").eq("slug", slug).maybeSingle();
  if (!cat) return [];
  const { data, error } = await supabase
    .from("listings")
    .select(FEED_SELECT)
    .eq("status", "active")
    .eq("category_id", cat.id)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map(shapeFeedRow);
}

export async function listByArea(slug: string, limit = 60): Promise<FeedItem[]> {
  const supabase = await createClient();
  const { data: area } = await supabase.from("areas").select("id, name").eq("slug", slug).maybeSingle();
  if (!area) return [];
  const { data, error } = await supabase
    .from("listings")
    .select(FEED_SELECT)
    .eq("status", "active")
    .eq("area_id", area.id)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map(shapeFeedRow);
}

export type ListingDetail = FeedItem & {
  description: string | null;
  wants_text: string | null;
  accepts_credits: boolean;
  owner: { id: string; display_name: string | null };
  images: { path: string; alt_text: string | null; sort_order: number }[];
};

export async function getListing(id: string): Promise<ListingDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("listings")
    .select(`
      id, slug, title, type, description, wants_text, accepts_credits, created_at,
      areas:area_id ( name ),
      categories:category_id ( name ),
      users:owner_id ( id, display_name ),
      listing_images ( path, alt_text, sort_order )
    `)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const images = (data.listing_images ?? []).slice().sort((a: any, b: any) => a.sort_order - b.sort_order);
  return {
    id: data.id,
    slug: data.slug,
    title: data.title,
    type: data.type,
    description: data.description,
    wants_text: data.wants_text,
    accepts_credits: data.accepts_credits,
    area_name: (data as any).areas?.name ?? null,
    category_name: (data as any).categories?.name ?? null,
    cover_path: images[0]?.path ?? null,
    created_at: data.created_at,
    owner: {
      id: (data as any).users?.id ?? "",
      display_name: (data as any).users?.display_name ?? null,
    },
    images,
  };
}

export async function listMyListings(): Promise<FeedItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("listings")
    .select(FEED_SELECT)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(shapeFeedRow);
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm test:unit tests/unit/img.test.ts
```

Expected: PASS, both cases.

- [ ] **Step 5: Commit**

```bash
git add lib/img.ts lib/listings/queries.ts tests/unit/img.test.ts
git commit -m "feat(listings): server-side queries + storage URL helper"
```

---

## Task 8: ListingCard + ListingGrid + TypeBadge components

**Files:**
- Create: `components/listings/type-badge.tsx`
- Create: `components/listings/listing-card.tsx`
- Create: `components/listings/listing-grid.tsx`

These are server components — pure presentation, no client interactivity.

- [ ] **Step 1: Implement TypeBadge**

```tsx
// components/listings/type-badge.tsx
const LABELS = {
  offer_goods:   { label: "Offering",  className: "bg-emerald-100 text-emerald-900" },
  offer_service: { label: "Service",   className: "bg-sky-100 text-sky-900" },
  want:          { label: "Wanted",    className: "bg-amber-100 text-amber-900" },
} as const;

export function TypeBadge({ type }: { type: keyof typeof LABELS }) {
  const { label, className } = LABELS[type];
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${className}`}>
      {label}
    </span>
  );
}
```

- [ ] **Step 2: Implement ListingCard**

```tsx
// components/listings/listing-card.tsx
import Link from "next/link";
import Image from "next/image";
import { TypeBadge } from "./type-badge";
import { listingImageUrl } from "@/lib/img";
import type { FeedItem } from "@/lib/listings/queries";

export function ListingCard({ item }: { item: FeedItem }) {
  return (
    <Link
      href={`/l/${item.id}/${item.slug}`}
      className="block overflow-hidden rounded-lg border bg-white transition hover:shadow-md"
    >
      <div className="relative aspect-square w-full bg-zinc-100">
        {item.cover_path ? (
          <Image
            src={listingImageUrl(item.cover_path)}
            alt={item.title}
            fill
            sizes="(max-width:640px) 50vw, 33vw"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-zinc-400">no photo</div>
        )}
      </div>
      <div className="space-y-1 p-3">
        <div className="flex items-center justify-between gap-2">
          <TypeBadge type={item.type} />
          {item.area_name && <span className="text-xs text-zinc-500">{item.area_name}</span>}
        </div>
        <h3 className="line-clamp-2 text-sm font-medium">{item.title}</h3>
      </div>
    </Link>
  );
}
```

- [ ] **Step 3: Implement ListingGrid**

```tsx
// components/listings/listing-grid.tsx
import { ListingCard } from "./listing-card";
import type { FeedItem } from "@/lib/listings/queries";

export function ListingGrid({ items, emptyText }: { items: FeedItem[]; emptyText?: string }) {
  if (items.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-8 text-center text-sm text-zinc-500">
        {emptyText ?? "Nothing here yet."}
      </p>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
      {items.map((item) => <ListingCard key={item.id} item={item} />)}
    </div>
  );
}
```

- [ ] **Step 4: Allow Next/Image to load from the Supabase host**

Update `next.config.ts` (or `next.config.js`) to allow remote images from the Supabase URL.

```ts
// next.config.ts (add or merge)
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "http",  hostname: "localhost" },
      { protocol: "https", hostname: new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname },
    ],
  },
};

export default nextConfig;
```

If `next.config.ts` already exists, merge the `images` block; don't replace existing fields.

- [ ] **Step 5: Type-check**

```bash
pnpm tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add components/listings next.config.ts
git commit -m "feat(listings): ListingCard, ListingGrid, TypeBadge"
```

---

## Task 9: PhotoUploader (client component)

**Files:**
- Create: `components/listings/photo-uploader.tsx`

A simple client component: file input, image previews, "remove" buttons. No drag-reorder in v1.

- [ ] **Step 1: Implement**

```tsx
// components/listings/photo-uploader.tsx
"use client";

import { useState } from "react";
import { MAX_IMAGES } from "@/lib/listings/constants";

export function PhotoUploader({ name }: { name: string }) {
  const [files, setFiles] = useState<File[]>([]);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []).slice(0, MAX_IMAGES);
    setFiles(picked);
  }

  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium">
        Photos <span className="text-zinc-500">(up to {MAX_IMAGES})</span>
      </label>
      <input
        type="file"
        name={name}
        accept="image/*"
        multiple
        onChange={onPick}
        className="block w-full text-sm"
      />
      {files.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {files.map((f, i) => (
            <div key={i} className="aspect-square overflow-hidden rounded border bg-zinc-50">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={URL.createObjectURL(f)} alt="" className="h-full w-full object-cover" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Hoist MAX_IMAGES into a constants module**

Server actions can't be imported by client components, so move the constants out.

```ts
// lib/listings/constants.ts
export const MAX_IMAGES = 6;
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
```

Update `lib/listings/actions.ts` to re-export from constants:

```ts
// near the top of lib/listings/actions.ts, replace the existing MAX_IMAGES / MAX_FILE_BYTES constants with:
import { MAX_IMAGES, MAX_FILE_BYTES } from "@/lib/listings/constants";
export { MAX_IMAGES, MAX_FILE_BYTES };
```

- [ ] **Step 3: Re-run unit tests**

```bash
pnpm test:unit
```

Expected: still all green.

- [ ] **Step 4: Commit**

```bash
git add lib/listings/constants.ts lib/listings/actions.ts components/listings/photo-uploader.tsx
git commit -m "feat(listings): PhotoUploader client component + shared constants"
```

---

## Task 10: /listings/new — create form

**Files:**
- Create: `app/listings/new/page.tsx`
- Modify: `components/site-header.tsx` (add "Post" link)
- Test: `tests/e2e/listings-create.spec.ts`

- [ ] **Step 1: Write the failing e2e**

```ts
// tests/e2e/listings-create.spec.ts
import { test, expect } from "@playwright/test";
import { signInViaMailpit } from "./helpers/auth";

test("authed user can post a listing", async ({ page, request }) => {
  await signInViaMailpit(page, request, "Test User");

  await page.goto("/listings/new");
  await page.getByLabel(/type/i).selectOption("offer_goods");
  await page.getByLabel(/title/i).fill("Two ripe apples from our tree");
  await page.getByLabel(/description/i).fill("Picked this morning.");
  await page.locator("select[name=category_id]").selectOption({ label: "Food" });
  await page.locator("select[name=area_id]").selectOption({ label: "Quathiaski Cove" });
  await page.getByLabel(/what.*swap.*for/i).fill("Eggs or jam");

  await page.getByRole("button", { name: /publish/i }).click();

  await expect(page).toHaveURL(/\/l\/[0-9a-f-]+\/two-ripe-apples-from-our-tree/);
  await expect(page.getByRole("heading", { name: /two ripe apples/i })).toBeVisible();
});
```

You'll also need a tiny shared helper used by this spec and the existing `signup.spec.ts`. Move the Mailpit polling into one place:

```ts
// tests/e2e/helpers/auth.ts
import type { Page, APIRequestContext } from "@playwright/test";

const MAILPIT_URL = process.env.MAILPIT_URL ?? "http://localhost:8025";

export async function signInViaMailpit(
  page: Page,
  request: APIRequestContext,
  displayName: string,
): Promise<string> {
  const email = `quadra-test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`;
  await page.goto("/signin");
  await page.getByLabel(/email/i).fill(email);
  await page.getByRole("button", { name: /send link/i }).click();

  const link = await waitForMagicLink(email, request);
  await page.goto(link);
  if (page.url().includes("/onboarding")) {
    await page.getByLabel(/display name/i).fill(displayName);
    await page.locator("select#area_id").selectOption({ label: "Quathiaski Cove" });
    await page.getByRole("button", { name: /continue/i }).click();
  }
  return email;
}

async function waitForMagicLink(email: string, request: APIRequestContext): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const search = await request.get(
      `${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`,
    );
    if (search.ok()) {
      const { messages = [] } = await search.json();
      if (messages.length > 0) {
        const msgRes = await request.get(`${MAILPIT_URL}/api/v1/message/${messages[0].ID}`);
        const msg = await msgRes.json();
        const haystack = `${msg.HTML ?? ""}\n${msg.Text ?? ""}`;
        const m = haystack.match(/https?:\/\/localhost:8000\/auth\/v1\/verify[^\s"<]+/);
        if (m) return m[0];
      }
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No magic link in Mailpit for ${email}`);
}
```

Update `tests/e2e/signup.spec.ts` to import from `./helpers/auth` (delete the inline copy).

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test:e2e tests/e2e/listings-create.spec.ts
```

Expected: FAIL — `/listings/new` 404 or no Publish button.

- [ ] **Step 3: Implement the page**

```tsx
// app/listings/new/page.tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { createListing } from "@/lib/listings/actions";
import { PhotoUploader } from "@/components/listings/photo-uploader";

export const metadata = { title: "Post a listing — Quadra Barter" };

export default async function NewListingPage() {
  await requireUser();
  const supabase = await createClient();
  const [{ data: categories }, { data: areas }] = await Promise.all([
    supabase.from("categories").select("id, name, slug").order("sort_order"),
    supabase.from("areas").select("id, name, slug").order("sort_order"),
  ]);

  return (
    <main className="mx-auto max-w-xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">Post a listing</h1>
      <form action={createListing} encType="multipart/form-data" className="space-y-4">
        <Field label="Type" htmlFor="type">
          <select id="type" name="type" required className="w-full rounded border px-3 py-2">
            <option value="offer_goods">Offering goods</option>
            <option value="offer_service">Offering a service</option>
            <option value="want">Wanted</option>
          </select>
        </Field>

        <Field label="Title" htmlFor="title">
          <input id="title" name="title" required minLength={3} maxLength={120}
                 className="w-full rounded border px-3 py-2" />
        </Field>

        <Field label="Description" htmlFor="description">
          <textarea id="description" name="description" maxLength={2000} rows={4}
                    className="w-full rounded border px-3 py-2" />
        </Field>

        <Field label="Category" htmlFor="category_id">
          <select id="category_id" name="category_id" required className="w-full rounded border px-3 py-2">
            <option value="">Pick one…</option>
            {(categories ?? []).map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </Field>

        <Field label="Area" htmlFor="area_id">
          <select id="area_id" name="area_id" required className="w-full rounded border px-3 py-2">
            <option value="">Pick one…</option>
            {(areas ?? []).map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </Field>

        <Field label="What I'd swap for" htmlFor="wants_text">
          <input id="wants_text" name="wants_text" maxLength={500}
                 className="w-full rounded border px-3 py-2" />
        </Field>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="accepts_credits" />
          Also accept community credits
        </label>

        <PhotoUploader name="photos" />

        <button type="submit" className="rounded bg-emerald-700 px-4 py-2 text-white">Publish</button>
      </form>
    </main>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label htmlFor={htmlFor} className="block text-sm font-medium">{label}</label>
      {children}
    </div>
  );
}
```

- [ ] **Step 4: Add "Post" link to the header**

Modify `components/site-header.tsx` — when the user is signed in, add a "Post" nav link to `/listings/new` next to "My account". (Match the existing pattern in that file; one line of JSX.)

- [ ] **Step 5: Run e2e**

You may need to wait for `/l/[id]/[slug]` to exist before this test fully passes — Task 11 implements that route. To unblock this task, assert on the URL only (not `<h1>`):

```ts
// In Step 1 above, replace the heading assertion with just:
await expect(page).toHaveURL(/\/l\/[0-9a-f-]+\/two-ripe-apples-from-our-tree/);
```

Re-run:

```bash
pnpm test:e2e tests/e2e/listings-create.spec.ts
```

Expected: PASS (heading assertion comes back in Task 11).

- [ ] **Step 6: Commit**

```bash
git add app/listings/new tests/e2e/listings-create.spec.ts tests/e2e/helpers tests/e2e/signup.spec.ts components/site-header.tsx
git commit -m "feat(listings): /listings/new create form + auth e2e helper"
```

---

## Task 11: /l/[id]/[slug] — listing detail page with JSON-LD

**Files:**
- Create: `app/l/[id]/[slug]/page.tsx`
- Test: `tests/e2e/listings-detail.spec.ts`

- [ ] **Step 1: Write the failing e2e**

```ts
// tests/e2e/listings-detail.spec.ts
import { test, expect } from "@playwright/test";
import { signInViaMailpit } from "./helpers/auth";

test("listing detail page renders title, description, and JSON-LD", async ({ page, request }) => {
  await signInViaMailpit(page, request, "Tester");

  // Post a listing
  await page.goto("/listings/new");
  await page.getByLabel(/type/i).selectOption("offer_goods");
  await page.getByLabel(/title/i).fill("Detail page test apples");
  await page.getByLabel(/description/i).fill("Just for the detail page test.");
  await page.locator("select[name=category_id]").selectOption({ label: "Food" });
  await page.locator("select[name=area_id]").selectOption({ label: "Quathiaski Cove" });
  await page.getByRole("button", { name: /publish/i }).click();

  await expect(page).toHaveURL(/\/l\/[0-9a-f-]+\/detail-page-test-apples/);
  await expect(page.getByRole("heading", { name: /detail page test apples/i })).toBeVisible();
  await expect(page.getByText(/just for the detail page test/i)).toBeVisible();
  await expect(page.getByText(/quathiaski cove/i)).toBeVisible();

  // JSON-LD present and parseable.
  const ld = await page.locator('script[type="application/ld+json"]').first().textContent();
  expect(ld).toBeTruthy();
  const data = JSON.parse(ld!);
  expect(data["@context"]).toBe("https://schema.org");
  expect(data.name).toMatch(/detail page test apples/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test:e2e tests/e2e/listings-detail.spec.ts
```

Expected: FAIL — page renders 404 or missing JSON-LD.

- [ ] **Step 3: Implement the page**

```tsx
// app/l/[id]/[slug]/page.tsx
import { notFound, redirect } from "next/navigation";
import Image from "next/image";
import { TypeBadge } from "@/components/listings/type-badge";
import { listingImageUrl } from "@/lib/img";
import { getListing } from "@/lib/listings/queries";
import type { Metadata } from "next";

type Params = { id: string; slug: string };

export async function generateMetadata(
  { params }: { params: Promise<Params> },
): Promise<Metadata> {
  const { id } = await params;
  const l = await getListing(id);
  if (!l) return { title: "Listing not found — Quadra Barter" };
  const description = (l.description ?? l.wants_text ?? "").slice(0, 160);
  return {
    title: `${l.title} — Quadra Barter`,
    description,
    openGraph: {
      title: l.title,
      description,
      images: l.cover_path ? [listingImageUrl(l.cover_path)] : [],
      type: "article",
    },
  };
}

export default async function ListingPage({ params }: { params: Promise<Params> }) {
  const { id, slug } = await params;
  const l = await getListing(id);
  if (!l) notFound();
  if (l.slug !== slug) redirect(`/l/${l.id}/${l.slug}`);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": l.type === "offer_service" ? "Service" : "Product",
    name: l.title,
    description: l.description ?? undefined,
    image: l.images.map((i) => listingImageUrl(i.path)),
    areaServed: l.area_name ? `${l.area_name}, Quadra Island, BC` : "Quadra Island, BC",
    offers: {
      "@type": "Offer",
      availability: "https://schema.org/InStock",
      priceCurrency: "CAD",
      price: 0,
      description: l.wants_text ? `Swap for: ${l.wants_text}` : "Trade only — no cash",
    },
  };

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="flex items-center gap-2">
        <TypeBadge type={l.type} />
        {l.area_name && <span className="text-sm text-zinc-500">{l.area_name}</span>}
        {l.category_name && <span className="text-sm text-zinc-500">· {l.category_name}</span>}
      </div>

      <h1 className="text-3xl font-semibold">{l.title}</h1>

      {l.images.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {l.images.map((img) => (
            <div key={img.path} className="relative aspect-square overflow-hidden rounded-lg bg-zinc-100">
              <Image
                src={listingImageUrl(img.path)}
                alt={img.alt_text ?? l.title}
                fill
                sizes="(max-width:640px) 50vw, 33vw"
                className="object-cover"
              />
            </div>
          ))}
        </div>
      )}

      {l.description && <p className="whitespace-pre-line text-zinc-800">{l.description}</p>}

      {l.wants_text && (
        <div className="rounded-lg border bg-zinc-50 p-4">
          <h2 className="text-sm font-semibold text-zinc-700">What I'd swap for</h2>
          <p className="mt-1 text-zinc-800">{l.wants_text}</p>
        </div>
      )}

      <p className="text-sm text-zinc-500">
        Posted by {l.owner.display_name ?? "someone"}
      </p>
    </main>
  );
}
```

- [ ] **Step 4: Run e2e**

```bash
pnpm test:e2e tests/e2e/listings-detail.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/l tests/e2e/listings-detail.spec.ts
git commit -m "feat(listings): /l/[id]/[slug] detail page with JSON-LD"
```

---

## Task 12: Feed at /

**Files:**
- Modify: `app/page.tsx`
- Modify: `tests/e2e/landing.spec.ts`

- [ ] **Step 1: Update the landing test**

```ts
// tests/e2e/landing.spec.ts
import { test, expect } from "@playwright/test";

test("landing page shows hero + feed", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Quadra Barter" })).toBeVisible();
  // Hero + CTA still present.
  await expect(page.getByRole("heading", { name: /swap goods and services/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /get started/i })).toBeVisible();
  // Feed section heading.
  await expect(page.getByRole("heading", { name: /latest listings/i })).toBeVisible();
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test:e2e tests/e2e/landing.spec.ts
```

Expected: FAIL — no "Latest listings" heading yet.

- [ ] **Step 3: Implement the feed**

```tsx
// app/page.tsx
import Link from "next/link";
import { listFeed } from "@/lib/listings/queries";
import { ListingGrid } from "@/components/listings/listing-grid";

export const revalidate = 60; // ISR — feed re-renders at most once a minute

export default async function HomePage() {
  const items = await listFeed(24);

  return (
    <main className="mx-auto max-w-5xl space-y-10 p-6">
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

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Latest listings</h2>
        <ListingGrid items={items} emptyText="Nothing posted yet — be the first." />
      </section>
    </main>
  );
}
```

- [ ] **Step 4: Run e2e**

```bash
pnpm test:e2e tests/e2e/landing.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/page.tsx tests/e2e/landing.spec.ts
git commit -m "feat(listings): home feed wired to listings table"
```

---

## Task 13: /c/[slug] and /area/[slug] pages

**Files:**
- Create: `app/c/[slug]/page.tsx`
- Create: `app/area/[slug]/page.tsx`

- [ ] **Step 1: Implement /c/[slug]**

```tsx
// app/c/[slug]/page.tsx
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listByCategory } from "@/lib/listings/queries";
import { ListingGrid } from "@/components/listings/listing-grid";
import type { Metadata } from "next";

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: cat } = await supabase.from("categories").select("name").eq("slug", slug).maybeSingle();
  if (!cat) return { title: "Category not found" };
  return {
    title: `${cat.name} on Quadra Island — Quadra Barter`,
    description: `Swap, find, and offer ${cat.name.toLowerCase()} with neighbours on Quadra Island.`,
  };
}

export default async function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: cat } = await supabase.from("categories").select("name").eq("slug", slug).maybeSingle();
  if (!cat) notFound();
  const items = await listByCategory(slug);

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">{cat.name} on Quadra Island</h1>
      <ListingGrid items={items} emptyText={`No ${cat.name.toLowerCase()} listings yet.`} />
    </main>
  );
}
```

- [ ] **Step 2: Implement /area/[slug]**

```tsx
// app/area/[slug]/page.tsx
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listByArea } from "@/lib/listings/queries";
import { ListingGrid } from "@/components/listings/listing-grid";
import type { Metadata } from "next";

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: area } = await supabase.from("areas").select("name").eq("slug", slug).maybeSingle();
  if (!area) return { title: "Area not found" };
  return {
    title: `${area.name}, Quadra Island — Quadra Barter`,
    description: `Listings posted in ${area.name}. Trade with your neighbours.`,
  };
}

export default async function AreaPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: area } = await supabase.from("areas").select("name").eq("slug", slug).maybeSingle();
  if (!area) notFound();
  const items = await listByArea(slug);

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">{area.name}, Quadra Island</h1>
      <ListingGrid items={items} emptyText={`No listings in ${area.name} yet.`} />
    </main>
  );
}
```

- [ ] **Step 3: Smoke check both pages render**

```bash
curl -s -o /dev/null -w "/c/food: %{http_code}\n"  http://localhost:3000/c/food
curl -s -o /dev/null -w "/c/none: %{http_code}\n"  http://localhost:3000/c/zzzz
curl -s -o /dev/null -w "/area/quathiaski-cove: %{http_code}\n" http://localhost:3000/area/quathiaski-cove
curl -s -o /dev/null -w "/area/none: %{http_code}\n"           http://localhost:3000/area/zzzz
```

Expected: known slugs → 200; unknown → 404.

- [ ] **Step 4: Commit**

```bash
git add app/c app/area
git commit -m "feat(listings): /c/[slug] category pages + /area/[slug] area pages"
```

---

## Task 14: /me/listings + edit + archive

**Files:**
- Create: `app/me/listings/page.tsx`
- Create: `app/me/listings/[id]/edit/page.tsx`
- Modify: `lib/listings/actions.ts` (add `editListing` and `archiveListing`)
- Test: `tests/e2e/listings-manage.spec.ts`

- [ ] **Step 1: Add editListing and archiveListing actions**

Append to `lib/listings/actions.ts`:

```ts
import { editListingSchema } from "@/lib/listings/validation";

export async function editListing(form: FormData): Promise<void> {
  const user = await requireUser();
  const raw = {
    id: form.get("id"),
    type: form.get("type") || undefined,
    title: form.get("title") || undefined,
    description: form.get("description") || undefined,
    category_id: form.get("category_id") || undefined,
    area_id: form.get("area_id") || undefined,
    wants_text: form.get("wants_text") || undefined,
    accepts_credits: form.get("accepts_credits") === "on",
  };
  const parsed = editListingSchema.parse(raw);
  const supabase = await createClient();
  const { id, ...patch } = parsed;
  const update: Record<string, unknown> = { ...patch };
  if (patch.title) update.slug = slugify(patch.title);

  const { error } = await supabase
    .from("listings")
    .update(update)
    .eq("id", id)
    .eq("owner_id", user.id);
  if (error) throw new Error(error.message);

  redirect(`/l/${id}/${update.slug ?? ""}`);
}

export async function archiveListing(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Missing listing id");
  const supabase = await createClient();
  const { error } = await supabase
    .from("listings")
    .update({ status: "archived" })
    .eq("id", id)
    .eq("owner_id", user.id);
  if (error) throw new Error(error.message);
  redirect("/me/listings");
}
```

- [ ] **Step 2: Implement /me/listings**

```tsx
// app/me/listings/page.tsx
import Link from "next/link";
import { listMyListings } from "@/lib/listings/queries";
import { archiveListing } from "@/lib/listings/actions";
import { TypeBadge } from "@/components/listings/type-badge";
import { listingImageUrl } from "@/lib/img";

export const dynamic = "force-dynamic";
export const metadata = { title: "My listings — Quadra Barter" };

export default async function MyListingsPage() {
  const items = await listMyListings();

  return (
    <main className="mx-auto max-w-3xl space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">My listings</h1>
        <Link href="/listings/new" className="rounded bg-emerald-700 px-3 py-1.5 text-sm text-white">
          + Post
        </Link>
      </div>
      <ul className="divide-y rounded-lg border">
        {items.length === 0 && <li className="p-6 text-center text-sm text-zinc-500">No listings yet.</li>}
        {items.map((it) => (
          <li key={it.id} className="flex items-center gap-4 p-3">
            <div className="h-16 w-16 shrink-0 overflow-hidden rounded bg-zinc-100">
              {it.cover_path && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={listingImageUrl(it.cover_path)} alt="" className="h-full w-full object-cover" />
              )}
            </div>
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2"><TypeBadge type={it.type} /></div>
              <Link href={`/l/${it.id}/${it.slug}`} className="text-sm font-medium hover:underline">
                {it.title}
              </Link>
            </div>
            <div className="flex items-center gap-2">
              <Link href={`/me/listings/${it.id}/edit`} className="rounded border px-2 py-1 text-xs">Edit</Link>
              <form action={archiveListing}>
                <input type="hidden" name="id" value={it.id} />
                <button type="submit" className="rounded border px-2 py-1 text-xs text-red-700">Archive</button>
              </form>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
```

- [ ] **Step 3: Implement /me/listings/[id]/edit**

```tsx
// app/me/listings/[id]/edit/page.tsx
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { editListing } from "@/lib/listings/actions";

export const metadata = { title: "Edit listing — Quadra Barter" };

export default async function EditListingPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: listing }, { data: categories }, { data: areas }] = await Promise.all([
    supabase.from("listings").select("*").eq("id", id).eq("owner_id", user.id).maybeSingle(),
    supabase.from("categories").select("id, name").order("sort_order"),
    supabase.from("areas").select("id, name").order("sort_order"),
  ]);
  if (!listing) notFound();

  return (
    <main className="mx-auto max-w-xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">Edit listing</h1>
      <form action={editListing} className="space-y-4">
        <input type="hidden" name="id" value={listing.id} />
        <div>
          <label className="block text-sm font-medium">Type</label>
          <select name="type" defaultValue={listing.type} className="w-full rounded border px-3 py-2">
            <option value="offer_goods">Offering goods</option>
            <option value="offer_service">Offering a service</option>
            <option value="want">Wanted</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium">Title</label>
          <input name="title" defaultValue={listing.title} required minLength={3} maxLength={120}
                 className="w-full rounded border px-3 py-2" />
        </div>
        <div>
          <label className="block text-sm font-medium">Description</label>
          <textarea name="description" defaultValue={listing.description ?? ""} rows={4} maxLength={2000}
                    className="w-full rounded border px-3 py-2" />
        </div>
        <div>
          <label className="block text-sm font-medium">Category</label>
          <select name="category_id" defaultValue={listing.category_id ?? ""} className="w-full rounded border px-3 py-2">
            {(categories ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium">Area</label>
          <select name="area_id" defaultValue={listing.area_id ?? ""} className="w-full rounded border px-3 py-2">
            {(areas ?? []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium">What I'd swap for</label>
          <input name="wants_text" defaultValue={listing.wants_text ?? ""} maxLength={500}
                 className="w-full rounded border px-3 py-2" />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="accepts_credits" defaultChecked={listing.accepts_credits} />
          Also accept community credits
        </label>
        <button type="submit" className="rounded bg-emerald-700 px-4 py-2 text-white">Save</button>
      </form>
    </main>
  );
}
```

- [ ] **Step 4: Write the e2e**

```ts
// tests/e2e/listings-manage.spec.ts
import { test, expect } from "@playwright/test";
import { signInViaMailpit } from "./helpers/auth";

test("user can edit and archive their own listing", async ({ page, request }) => {
  await signInViaMailpit(page, request, "Manager");

  // Post one
  await page.goto("/listings/new");
  await page.getByLabel(/type/i).selectOption("offer_goods");
  await page.getByLabel(/title/i).fill("Manage me apples");
  await page.locator("select[name=category_id]").selectOption({ label: "Food" });
  await page.locator("select[name=area_id]").selectOption({ label: "Quathiaski Cove" });
  await page.getByRole("button", { name: /publish/i }).click();
  await expect(page).toHaveURL(/\/l\/[0-9a-f-]+\/manage-me-apples/);

  // Edit it
  await page.goto("/me/listings");
  await page.getByRole("link", { name: /^edit$/i }).first().click();
  await page.getByLabel(/title/i).fill("Manage me apples (edited)");
  await page.getByRole("button", { name: /save/i }).click();
  await expect(page).toHaveURL(/\/l\/[0-9a-f-]+\/manage-me-apples-edited/);

  // Archive it
  await page.goto("/me/listings");
  await page.getByRole("button", { name: /archive/i }).first().click();
  await expect(page).toHaveURL(/\/me\/listings$/);
  await expect(page.getByText(/manage me apples \(edited\)/i)).toHaveCount(0);
});
```

- [ ] **Step 5: Run e2e**

```bash
pnpm test:e2e tests/e2e/listings-manage.spec.ts
```

Expected: PASS.

- [ ] **Step 6: Run the full suite**

```bash
pnpm test:unit && pnpm test:e2e
```

Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add app/me/listings lib/listings/actions.ts tests/e2e/listings-manage.spec.ts
git commit -m "feat(listings): /me/listings management page + edit/archive actions"
```

---

## Out of scope (intentionally)

These belong to later plans, not Plan 2:

- **Search bar + free-text filter** — Plan 4 polish (uses Postgres `tsvector` or simple `ilike`).
- **Category chips on home feed** — Plan 4 polish.
- **Public profile `/u/[handle]`** — Plan 4 (depends on a public-safe view of `users`).
- **Sitemap.xml regeneration on publish** — Plan 4.
- **Image transforms via imgproxy** — Plan 4.
- **Client-side image resize before upload** — Plan 4.
- **Drag-reorder of photos** — Plan 4.
- **Chat / offers / trade / ratings** — Plan 3.
- **Reports + admin** — Plan 4.

## Done means

- Logged-in users can post a listing in under a minute.
- Anyone can browse `/`, `/l/[id]/[slug]`, `/c/[slug]`, `/area/[slug]` without signing in.
- Listing detail pages emit Open Graph + JSON-LD.
- Owners can edit + archive their own listings; non-owners cannot (RLS).
- All unit tests + all e2e tests pass.
- Migrations apply cleanly on a fresh stack.
