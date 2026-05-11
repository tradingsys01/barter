# Rides Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add commuter ride-sharing as a listing category with route, schedule, seats, and gas-share fields.

**Architecture:** Extend the existing listings system with nullable ride-specific columns. When category is "rides", conditional form fields appear and validation enforces ride fields. Display shows structured ride info in cards and detail pages.

**Tech Stack:** Next.js 16, Supabase (Postgres), Zod, TypeScript, Tailwind CSS

---

## File Structure

| File | Responsibility |
|------|----------------|
| `supabase/migrations/0025_rides.sql` | Add rides category + ride columns to listings |
| `lib/listings/validation.ts` | Extend schemas with ride fields + conditional validation |
| `lib/listings/internal.ts` | Update ListingRow type + buildListingRow helper |
| `lib/listings/actions.ts` | Handle ride fields in create/edit actions |
| `lib/listings/queries.ts` | Include ride fields in FeedItem and ListingDetail |
| `lib/listings/search.ts` | Add route_from/route_to filtering |
| `components/listings/ride-fields.tsx` | New: conditional ride form fields |
| `components/listings/listing-card.tsx` | Display ride info when category is rides |
| `app/listings/new/page.tsx` | Add ride fields component |
| `app/me/listings/[id]/edit/page.tsx` | Add ride fields component |
| `app/l/[id]/[slug]/page.tsx` | Display ride details section |
| `tests/unit/rides-validation.test.ts` | New: ride validation tests |

---

### Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/0025_rides.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- supabase/migrations/0025_rides.sql
-- Add rides category and ride-specific columns to listings.

-- Add rides category
INSERT INTO public.categories (slug, name, icon, sort_order)
VALUES ('rides', 'Rides', '🚗', 85)
ON CONFLICT (slug) DO NOTHING;

-- Add ride-specific columns (nullable, only used when category is rides)
ALTER TABLE public.listings
  ADD COLUMN route_from text REFERENCES public.areas(slug) ON DELETE SET NULL,
  ADD COLUMN route_to text REFERENCES public.areas(slug) ON DELETE SET NULL,
  ADD COLUMN schedule text,
  ADD COLUMN seats smallint CHECK (seats IS NULL OR (seats >= 1 AND seats <= 6)),
  ADD COLUMN gas_share boolean NOT NULL DEFAULT false;

-- Index for route filtering
CREATE INDEX listings_route_from_idx ON public.listings(route_from) WHERE route_from IS NOT NULL;
CREATE INDEX listings_route_to_idx ON public.listings(route_to) WHERE route_to IS NOT NULL;
```

- [ ] **Step 2: Apply the migration**

Run:
```bash
docker exec -i supabase-db psql -U postgres -d postgres < supabase/migrations/0025_rides.sql
```

Expected: No errors, migration applies successfully.

- [ ] **Step 3: Verify migration applied**

Run:
```bash
docker exec supabase-db psql -U postgres -d postgres -c "\d public.listings" | grep -E "route_from|route_to|schedule|seats|gas_share"
```

Expected: Shows the five new columns.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0025_rides.sql
git commit -m "$(cat <<'EOF'
feat(rides): add database migration for ride columns

Adds rides category and ride-specific columns: route_from, route_to,
schedule, seats, gas_share. Columns are nullable for non-ride listings.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Validation Schema

**Files:**
- Create: `tests/unit/rides-validation.test.ts`
- Modify: `lib/listings/validation.ts`

- [ ] **Step 1: Write failing tests for ride validation**

```typescript
// tests/unit/rides-validation.test.ts
import { describe, expect, it } from "vitest";
import { createListingSchema, createRideListingSchema } from "@/lib/listings/validation";

const validRide = {
  type: "offer" as const,
  title: "Ride: Bold Point ↔ Ferry",
  description: "Daily commute, happy to help neighbours",
  category_id: "11111111-1111-1111-1111-111111111111",
  area_id: "22222222-2222-2222-2222-222222222222",
  wants_text: "Gas share or barter",
  route_from: "bold-point",
  route_to: "quathiaski-cove",
  schedule: "Mon-Fri 7am out, 4pm return",
  seats: 3,
  gas_share: true,
};

describe("createRideListingSchema", () => {
  it("accepts valid ride input", () => {
    const r = createRideListingSchema.safeParse(validRide);
    expect(r.success).toBe(true);
  });

  it("requires route_from", () => {
    const r = createRideListingSchema.safeParse({ ...validRide, route_from: undefined });
    expect(r.success).toBe(false);
  });

  it("requires route_to", () => {
    const r = createRideListingSchema.safeParse({ ...validRide, route_to: undefined });
    expect(r.success).toBe(false);
  });

  it("requires schedule", () => {
    const r = createRideListingSchema.safeParse({ ...validRide, schedule: undefined });
    expect(r.success).toBe(false);
  });

  it("requires seats between 1 and 6", () => {
    const zero = createRideListingSchema.safeParse({ ...validRide, seats: 0 });
    expect(zero.success).toBe(false);

    const seven = createRideListingSchema.safeParse({ ...validRide, seats: 7 });
    expect(seven.success).toBe(false);

    const valid = createRideListingSchema.safeParse({ ...validRide, seats: 4 });
    expect(valid.success).toBe(true);
  });

  it("gas_share defaults to false", () => {
    const r = createRideListingSchema.safeParse({ ...validRide, gas_share: undefined });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.gas_share).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test:unit tests/unit/rides-validation.test.ts`

Expected: FAIL — `createRideListingSchema` not exported.

- [ ] **Step 3: Update validation schema**

```typescript
// lib/listings/validation.ts
import { z } from "zod";

export const LISTING_TYPES = ["offer", "want"] as const;
export type ListingType = (typeof LISTING_TYPES)[number];

export const createListingSchema = z.object({
  type: z.enum(LISTING_TYPES),
  title: z.string().trim().min(3, "Title is too short").max(120, "Title is too long"),
  description: z.string().trim().max(2000).optional(),
  category_id: z.string().uuid(),
  area_id: z.string().uuid(),
  wants_text: z.string().trim().max(500).optional(),
});

export type CreateListingInput = z.infer<typeof createListingSchema>;

export const rideFieldsSchema = z.object({
  route_from: z.string().min(1, "From location is required"),
  route_to: z.string().min(1, "To location is required"),
  schedule: z.string().trim().min(1, "Schedule is required").max(200),
  seats: z.coerce.number().int().min(1, "At least 1 seat").max(6, "At most 6 seats"),
  gas_share: z.coerce.boolean().default(false),
});

export const createRideListingSchema = createListingSchema.merge(rideFieldsSchema);

export type CreateRideListingInput = z.infer<typeof createRideListingSchema>;

export const editListingSchema = createListingSchema.partial().extend({
  id: z.string().uuid(),
});

export const editRideListingSchema = editListingSchema.merge(rideFieldsSchema.partial());

export type EditListingInput = z.infer<typeof editListingSchema>;
export type EditRideListingInput = z.infer<typeof editRideListingSchema>;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test:unit tests/unit/rides-validation.test.ts`

Expected: All tests PASS.

- [ ] **Step 5: Run full test suite**

Run: `pnpm test:unit`

Expected: All tests pass including existing listing validation tests.

- [ ] **Step 6: Commit**

```bash
git add tests/unit/rides-validation.test.ts lib/listings/validation.ts
git commit -m "$(cat <<'EOF'
feat(rides): add ride validation schema

Adds createRideListingSchema with route_from, route_to, schedule,
seats, and gas_share fields. Includes tests for all validations.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Internal Helpers

**Files:**
- Modify: `lib/listings/internal.ts`

- [ ] **Step 1: Update ListingRow type and buildListingRow**

```typescript
// lib/listings/internal.ts
import { slugify } from "@/lib/slug";
import type { CreateListingInput, CreateRideListingInput } from "@/lib/listings/validation";

export const MAX_IMAGES = 3;
export const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2 MB (after client resize)

export type ListingRow = {
  owner_id: string;
  type: CreateListingInput["type"];
  title: string;
  slug: string;
  description: string | null;
  category_id: string;
  area_id: string;
  wants_text: string | null;
  status: "active";
  route_from: string | null;
  route_to: string | null;
  schedule: string | null;
  seats: number | null;
  gas_share: boolean;
};

export function buildListingRow(
  input: CreateListingInput | CreateRideListingInput,
  ownerId: string,
): ListingRow {
  const isRide = "route_from" in input;
  return {
    owner_id: ownerId,
    type: input.type,
    title: input.title,
    slug: slugify(input.title),
    description: input.description ?? null,
    category_id: input.category_id,
    area_id: input.area_id,
    wants_text: input.wants_text ?? null,
    status: "active",
    route_from: isRide ? input.route_from : null,
    route_to: isRide ? input.route_to : null,
    schedule: isRide ? input.schedule : null,
    seats: isRide ? input.seats : null,
    gas_share: isRide ? input.gas_share : false,
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

export function fileExt(name: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(name);
  return (m?.[1] ?? "jpg").toLowerCase();
}
```

- [ ] **Step 2: Run type check**

Run: `pnpm tsc --noEmit`

Expected: No type errors.

- [ ] **Step 3: Run existing tests**

Run: `pnpm test:unit`

Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add lib/listings/internal.ts
git commit -m "$(cat <<'EOF'
feat(rides): update ListingRow type with ride fields

Adds route_from, route_to, schedule, seats, gas_share to ListingRow.
buildListingRow detects ride input and populates fields accordingly.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Server Actions

**Files:**
- Modify: `lib/listings/actions.ts`

- [ ] **Step 1: Update createListing action**

In `lib/listings/actions.ts`, update the import and createListing function:

```typescript
// At top of file, update imports:
import {
  createListingSchema,
  createRideListingSchema,
  editListingSchema,
  editRideListingSchema,
} from "@/lib/listings/validation";

// Replace createListing function:
export async function createListing(form: FormData): Promise<void> {
  const user = await requireUser();

  const isRide = form.get("is_ride") === "true";

  const raw = {
    type: form.get("type"),
    title: form.get("title"),
    description: form.get("description") || undefined,
    category_id: form.get("category_id"),
    area_id: form.get("area_id"),
    wants_text: form.get("wants_text") || undefined,
    ...(isRide && {
      route_from: form.get("route_from"),
      route_to: form.get("route_to"),
      schedule: form.get("schedule"),
      seats: form.get("seats"),
      gas_share: form.get("gas_share") === "on",
    }),
  };

  const parsed = isRide
    ? createRideListingSchema.parse(raw)
    : createListingSchema.parse(raw);

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

- [ ] **Step 2: Update editListing action**

Replace editListing function in the same file:

```typescript
export async function editListing(form: FormData): Promise<void> {
  const user = await requireUser();
  const isRide = form.get("is_ride") === "true";

  const raw = {
    id: form.get("id"),
    type: form.get("type") || undefined,
    title: form.get("title") || undefined,
    description: form.get("description") || undefined,
    category_id: form.get("category_id") || undefined,
    area_id: form.get("area_id") || undefined,
    wants_text: form.get("wants_text") || undefined,
    ...(isRide && {
      route_from: form.get("route_from") || undefined,
      route_to: form.get("route_to") || undefined,
      schedule: form.get("schedule") || undefined,
      seats: form.get("seats") || undefined,
      gas_share: form.get("gas_share") === "on",
    }),
  };

  const parsed = isRide
    ? editRideListingSchema.parse(raw)
    : editListingSchema.parse(raw);

  const supabase = await createClient();
  const { id, ...patch } = parsed;
  const update: Record<string, unknown> = { ...patch };
  if (patch.title) update.slug = slugify(patch.title);

  const { data, error } = await supabase
    .from("listings")
    .update(update)
    .eq("id", id)
    .eq("owner_id", user.id)
    .select("id, slug")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Could not update listing");

  // Handle new photo uploads
  const files = form.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length > 0) {
    validateImageFiles(files);
    const { data: existingImages, count } = await supabase
      .from("listing_images")
      .select("sort_order", { count: "exact" })
      .eq("listing_id", id)
      .order("sort_order", { ascending: false });
    const existingCount = count ?? 0;
    if (existingCount + files.length > MAX_IMAGES) {
      throw new Error(`You can have at most ${MAX_IMAGES} photos. You have ${existingCount}, trying to add ${files.length}.`);
    }
    const startOrder = (existingImages?.[0]?.sort_order ?? -1) + 1;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const path = `${id}/${startOrder + i}.${fileExt(file.name)}`;
      const { error: upErr } = await supabase.storage.from("listings").upload(path, file, {
        contentType: file.type,
        upsert: false,
      });
      if (upErr) throw new Error(`Upload failed for ${file.name}: ${upErr.message}`);

      const { error: imgErr } = await supabase.from("listing_images").insert({
        listing_id: id,
        path,
        sort_order: startOrder + i,
      });
      if (imgErr) throw new Error(imgErr.message);
    }
  }

  redirect(`/l/${data.id}/${data.slug}`);
}
```

- [ ] **Step 3: Run type check**

Run: `pnpm tsc --noEmit`

Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
git add lib/listings/actions.ts
git commit -m "$(cat <<'EOF'
feat(rides): handle ride fields in create/edit actions

Actions detect is_ride flag and parse with ride schema accordingly.
Ride fields are included in database insert/update.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Queries

**Files:**
- Modify: `lib/listings/queries.ts`

- [ ] **Step 1: Update FeedItem type**

Add ride fields to FeedItem type:

```typescript
export type FeedItem = {
  id: string;
  slug: string;
  title: string;
  type: "offer" | "want";
  status: "active" | "reserved" | "completed" | "archived";
  area_name: string | null;
  category_name: string | null;
  category_slug: string | null;
  cover_path: string | null;
  created_at: string;
  // Ride fields
  route_from: string | null;
  route_to: string | null;
  schedule: string | null;
  seats: number | null;
  gas_share: boolean;
};
```

- [ ] **Step 2: Update FEED_SELECT and shapeFeedRow**

```typescript
const FEED_SELECT = `
  id, slug, title, type, status, created_at,
  route_from, route_to, schedule, seats, gas_share,
  areas:area_id ( name ),
  categories:category_id ( name, slug ),
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
    status: r.status,
    area_name: r.areas?.name ?? null,
    category_name: r.categories?.name ?? null,
    category_slug: r.categories?.slug ?? null,
    cover_path: cover,
    created_at: r.created_at,
    route_from: r.route_from ?? null,
    route_to: r.route_to ?? null,
    schedule: r.schedule ?? null,
    seats: r.seats ?? null,
    gas_share: r.gas_share ?? false,
  };
}
```

- [ ] **Step 3: Update ListingDetail type**

Add ride fields to ListingDetail:

```typescript
export type ListingDetail = FeedItem & {
  description: string | null;
  wants_text: string | null;
  owner: { id: string; display_name: string | null };
  images: { path: string; alt_text: string | null; sort_order: number }[];
  route_from_name: string | null;
  route_to_name: string | null;
};
```

- [ ] **Step 4: Update getListing function**

```typescript
export async function getListing(id: string): Promise<ListingDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("listings")
    .select(`
      id, slug, title, type, status, description, wants_text, created_at,
      route_from, route_to, schedule, seats, gas_share,
      areas:area_id ( name ),
      categories:category_id ( name, slug ),
      owner_id,
      public_users!owner_id ( id, display_name ),
      listing_images ( path, alt_text, sort_order )
    `)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const images = (data.listing_images ?? []).slice().sort((a: any, b: any) => a.sort_order - b.sort_order);

  // Resolve area names for routes if present
  let routeFromName: string | null = null;
  let routeToName: string | null = null;
  if (data.route_from || data.route_to) {
    const slugs = [data.route_from, data.route_to].filter(Boolean) as string[];
    const { data: areas } = await supabase
      .from("areas")
      .select("slug, name")
      .in("slug", slugs);
    const areaMap = new Map((areas ?? []).map((a) => [a.slug, a.name]));
    routeFromName = data.route_from ? areaMap.get(data.route_from) ?? null : null;
    routeToName = data.route_to ? areaMap.get(data.route_to) ?? null : null;
  }

  return {
    id: data.id,
    slug: data.slug,
    title: data.title,
    type: data.type,
    status: (data as any).status,
    description: data.description,
    wants_text: data.wants_text,
    area_name: (data as any).areas?.name ?? null,
    category_name: (data as any).categories?.name ?? null,
    category_slug: (data as any).categories?.slug ?? null,
    cover_path: images[0]?.path ?? null,
    created_at: data.created_at,
    owner: {
      id: (data as any).owner_id,
      display_name: (data as any).public_users?.display_name ?? null,
    },
    images,
    route_from: data.route_from ?? null,
    route_to: data.route_to ?? null,
    route_from_name: routeFromName,
    route_to_name: routeToName,
    schedule: data.schedule ?? null,
    seats: data.seats ?? null,
    gas_share: data.gas_share ?? false,
  };
}
```

- [ ] **Step 5: Run type check**

Run: `pnpm tsc --noEmit`

Expected: No type errors.

- [ ] **Step 6: Commit**

```bash
git add lib/listings/queries.ts
git commit -m "$(cat <<'EOF'
feat(rides): include ride fields in listing queries

FeedItem and ListingDetail now include route_from, route_to, schedule,
seats, gas_share. getListing resolves area names for route display.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Search with Route Filtering

**Files:**
- Modify: `lib/listings/search.ts`

- [ ] **Step 1: Add route filtering to SearchInput**

```typescript
export type SearchInput = {
  q?: string;
  categorySlug?: string;
  areaSlug?: string;
  routeFrom?: string;
  routeTo?: string;
  type?: "want";
  limit?: number;
};

export type SearchFilter = {
  q?: string;
  categorySlug?: string;
  areaSlug?: string;
  routeFrom?: string;
  routeTo?: string;
  type?: "want";
};
```

- [ ] **Step 2: Update buildSearchFilter**

```typescript
export function buildSearchFilter(input: SearchInput): SearchFilter {
  const out: SearchFilter = {};
  if (input.q != null) {
    const trimmed = input.q.trim().toLowerCase();
    if (trimmed.length >= 2) {
      out.q = trimmed;
    }
  }
  if (input.categorySlug && input.categorySlug.trim()) {
    const slug = input.categorySlug.trim();
    if (slug === "wanted") {
      out.type = "want";
    } else {
      out.categorySlug = slug;
    }
  }
  if (input.areaSlug && input.areaSlug.trim()) {
    out.areaSlug = input.areaSlug.trim();
  }
  if (input.routeFrom && input.routeFrom.trim()) {
    out.routeFrom = input.routeFrom.trim();
  }
  if (input.routeTo && input.routeTo.trim()) {
    out.routeTo = input.routeTo.trim();
  }
  if (input.type === "want") {
    out.type = "want";
  }
  return out;
}
```

- [ ] **Step 3: Update searchListings to filter by route**

Add route filtering after areaId resolution:

```typescript
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
      route_from, route_to, schedule, seats, gas_share,
      areas:area_id ( name ),
      categories:category_id ( name, slug ),
      listing_images ( path, sort_order )
    `)
    .eq("status", "active");
  if (categoryId) query = query.eq("category_id", categoryId);
  if (areaId) query = query.eq("area_id", areaId);
  if (filter.routeFrom) query = query.eq("route_from", filter.routeFrom);
  if (filter.routeTo) query = query.eq("route_to", filter.routeTo);
  if (filter.type === "want") query = query.eq("type", "want");
  if (filter.q) {
    query = query.textSearch("search_tsv", filter.q, {
      type: "websearch",
      config: "english",
    });
  }

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
    category_slug: r.categories?.slug ?? null,
    cover_path: (r.listing_images ?? [])
      .slice()
      .sort((a: any, b: any) => a.sort_order - b.sort_order)[0]?.path ?? null,
    created_at: r.created_at,
    route_from: r.route_from ?? null,
    route_to: r.route_to ?? null,
    schedule: r.schedule ?? null,
    seats: r.seats ?? null,
    gas_share: r.gas_share ?? false,
  }));
}
```

- [ ] **Step 4: Run type check**

Run: `pnpm tsc --noEmit`

Expected: No type errors.

- [ ] **Step 5: Commit**

```bash
git add lib/listings/search.ts
git commit -m "$(cat <<'EOF'
feat(rides): add route filtering to search

SearchInput accepts routeFrom and routeTo params to filter ride listings
by origin and destination area slugs.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Ride Fields Component

**Files:**
- Create: `components/listings/ride-fields.tsx`

- [ ] **Step 1: Create the ride fields component**

```tsx
// components/listings/ride-fields.tsx
"use client";

import { useState } from "react";

type Area = { id: string; name: string; slug: string };

type Props = {
  areas: Area[];
  ridesCategoryId: string;
  defaultValues?: {
    route_from?: string;
    route_to?: string;
    schedule?: string;
    seats?: number;
    gas_share?: boolean;
  };
};

export function RideFields({ areas, ridesCategoryId, defaultValues }: Props) {
  const [isRide, setIsRide] = useState(!!defaultValues?.route_from);

  return (
    <>
      <input type="hidden" name="is_ride" value={isRide ? "true" : "false"} />

      {isRide && (
        <div className="space-y-6 rounded-lg border border-emerald-200 bg-emerald-50/50 p-4">
          <p className="text-sm text-emerald-800">
            <strong>Tip:</strong> Example: &quot;I drive from Bold Point to the ferry Mon-Fri at 7am, returning at 4pm. 3 seats available. Gas share appreciated or happy to barter.&quot;
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="route_from" className="block text-sm font-medium text-zinc-700">
                From
              </label>
              <select
                id="route_from"
                name="route_from"
                required
                defaultValue={defaultValues?.route_from ?? ""}
                className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-zinc-900 shadow-sm transition-colors focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              >
                <option value="">Pick starting point…</option>
                {areas.map((a) => (
                  <option key={a.slug} value={a.slug}>{a.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label htmlFor="route_to" className="block text-sm font-medium text-zinc-700">
                To
              </label>
              <select
                id="route_to"
                name="route_to"
                required
                defaultValue={defaultValues?.route_to ?? ""}
                className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-zinc-900 shadow-sm transition-colors focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              >
                <option value="">Pick destination…</option>
                {areas.map((a) => (
                  <option key={a.slug} value={a.slug}>{a.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="schedule" className="block text-sm font-medium text-zinc-700">
              Schedule
            </label>
            <input
              id="schedule"
              name="schedule"
              required
              maxLength={200}
              defaultValue={defaultValues?.schedule ?? ""}
              placeholder="Mon-Fri 7am out, 4pm return"
              className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-zinc-900 shadow-sm transition-colors placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="seats" className="block text-sm font-medium text-zinc-700">
                Seats available
              </label>
              <input
                id="seats"
                name="seats"
                type="number"
                required
                min={1}
                max={6}
                defaultValue={defaultValues?.seats ?? 3}
                className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-zinc-900 shadow-sm transition-colors focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>

            <div className="flex items-center gap-3 pt-7">
              <input
                id="gas_share"
                name="gas_share"
                type="checkbox"
                defaultChecked={defaultValues?.gas_share ?? false}
                className="h-5 w-5 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
              />
              <label htmlFor="gas_share" className="text-sm font-medium text-zinc-700">
                Gas share welcome
              </label>
            </div>
          </div>
        </div>
      )}

      <script
        dangerouslySetInnerHTML={{
          __html: `
            (function() {
              var catSelect = document.getElementById('category_id');
              var ridesCatId = ${JSON.stringify(ridesCategoryId)};
              function updateRideState() {
                var isRide = catSelect.value === ridesCatId;
                document.querySelector('[name="is_ride"]').value = isRide ? 'true' : 'false';
                var container = document.querySelector('[data-ride-fields]');
                if (container) container.style.display = isRide ? 'block' : 'none';
              }
              catSelect.addEventListener('change', updateRideState);
            })();
          `,
        }}
      />
      <div data-ride-fields style={{ display: isRide ? "block" : "none" }}>
        {/* Fields rendered above when isRide */}
      </div>
    </>
  );
}
```

Wait — the above approach is awkward. Let me simplify with a proper client component.

- [ ] **Step 1 (revised): Create the ride fields component**

```tsx
// components/listings/ride-fields.tsx
"use client";

type Area = { id: string; name: string; slug: string };

type Props = {
  areas: Area[];
  defaultValues?: {
    route_from?: string;
    route_to?: string;
    schedule?: string;
    seats?: number;
    gas_share?: boolean;
  };
  show: boolean;
};

export function RideFields({ areas, defaultValues, show }: Props) {
  if (!show) return <input type="hidden" name="is_ride" value="false" />;

  return (
    <>
      <input type="hidden" name="is_ride" value="true" />

      <div className="space-y-6 rounded-lg border border-emerald-200 bg-emerald-50/50 p-4">
        <p className="text-sm text-emerald-800">
          <strong>Tip:</strong> Example: &quot;I drive from Bold Point to the ferry Mon-Fri at 7am, returning at 4pm. 3 seats available. Gas share appreciated or happy to barter.&quot;
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label htmlFor="route_from" className="block text-sm font-medium text-zinc-700">
              From
            </label>
            <select
              id="route_from"
              name="route_from"
              required
              defaultValue={defaultValues?.route_from ?? ""}
              className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-zinc-900 shadow-sm transition-colors focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            >
              <option value="">Pick starting point…</option>
              {areas.map((a) => (
                <option key={a.slug} value={a.slug}>{a.name}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label htmlFor="route_to" className="block text-sm font-medium text-zinc-700">
              To
            </label>
            <select
              id="route_to"
              name="route_to"
              required
              defaultValue={defaultValues?.route_to ?? ""}
              className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-zinc-900 shadow-sm transition-colors focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            >
              <option value="">Pick destination…</option>
              {areas.map((a) => (
                <option key={a.slug} value={a.slug}>{a.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-2">
          <label htmlFor="schedule" className="block text-sm font-medium text-zinc-700">
            Schedule
          </label>
          <input
            id="schedule"
            name="schedule"
            required
            maxLength={200}
            defaultValue={defaultValues?.schedule ?? ""}
            placeholder="Mon-Fri 7am out, 4pm return"
            className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-zinc-900 shadow-sm transition-colors placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label htmlFor="seats" className="block text-sm font-medium text-zinc-700">
              Seats available
            </label>
            <input
              id="seats"
              name="seats"
              type="number"
              required
              min={1}
              max={6}
              defaultValue={defaultValues?.seats ?? 3}
              className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-zinc-900 shadow-sm transition-colors focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>

          <div className="flex items-center gap-3 pt-7">
            <input
              id="gas_share"
              name="gas_share"
              type="checkbox"
              defaultChecked={defaultValues?.gas_share ?? false}
              className="h-5 w-5 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
            />
            <label htmlFor="gas_share" className="text-sm font-medium text-zinc-700">
              Gas share welcome
            </label>
          </div>
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Run type check**

Run: `pnpm tsc --noEmit`

Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add components/listings/ride-fields.tsx
git commit -m "$(cat <<'EOF'
feat(rides): add RideFields form component

Client component that renders ride-specific form fields (route_from,
route_to, schedule, seats, gas_share) with example guidance.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Create Listing Form with Ride Fields

**Files:**
- Create: `components/listings/listing-form.tsx`
- Modify: `app/listings/new/page.tsx`

- [ ] **Step 1: Create ListingForm client component**

```tsx
// components/listings/listing-form.tsx
"use client";

import { useState } from "react";
import { RideFields } from "./ride-fields";
import { PhotoUploader } from "./photo-uploader";

type Category = { id: string; name: string; slug: string };
type Area = { id: string; name: string; slug: string };

type Props = {
  action: (form: FormData) => Promise<void>;
  categories: Category[];
  areas: Area[];
  ridesCategoryId: string | null;
};

export function ListingForm({ action, categories, areas, ridesCategoryId }: Props) {
  const [selectedCategory, setSelectedCategory] = useState("");
  const isRide = ridesCategoryId !== null && selectedCategory === ridesCategoryId;

  return (
    <form action={action} className="space-y-8">
      {/* Type & Category row */}
      <div className="grid gap-6 sm:grid-cols-2">
        <Field label="Type" htmlFor="type">
          <select
            id="type"
            name="type"
            required
            className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-zinc-900 shadow-sm transition-colors focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          >
            <option value="offer">Offering</option>
            <option value="want">Wanted</option>
          </select>
        </Field>

        <Field label="Category" htmlFor="category_id">
          <select
            id="category_id"
            name="category_id"
            required
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-zinc-900 shadow-sm transition-colors focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          >
            <option value="">Pick one…</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </Field>
      </div>

      {/* Ride fields (conditional) */}
      <RideFields areas={areas} show={isRide} />

      {/* Title - full width, prominent */}
      <Field label="Title" htmlFor="title">
        <input
          id="title"
          name="title"
          required
          minLength={3}
          maxLength={120}
          placeholder={isRide ? "e.g. Ride: Bold Point ↔ Ferry" : "What are you offering or looking for?"}
          className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-lg text-zinc-900 shadow-sm transition-colors placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
        />
      </Field>

      {/* Description - larger textarea */}
      <Field label="Description" htmlFor="description" optional>
        <textarea
          id="description"
          name="description"
          maxLength={2000}
          rows={5}
          placeholder={isRide ? "Notes about flexibility, pickup spots, etc." : "Add details about condition, quantity, or anything else…"}
          className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-zinc-900 shadow-sm transition-colors placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
        />
      </Field>

      {/* Area & Swap preferences row */}
      <div className="grid gap-6 sm:grid-cols-2">
        <Field label="Area" htmlFor="area_id">
          <select
            id="area_id"
            name="area_id"
            required
            className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-zinc-900 shadow-sm transition-colors focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          >
            <option value="">Pick one…</option>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </Field>

        <Field label="What I'd swap for" htmlFor="wants_text" optional>
          <input
            id="wants_text"
            name="wants_text"
            maxLength={500}
            placeholder={isRide ? "e.g. gas share, eggs, produce" : "e.g. firewood, eggs, help with…"}
            className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-zinc-900 shadow-sm transition-colors placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          />
        </Field>
      </div>

      {/* Photos */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-zinc-700">
          Photos <span className="font-normal text-zinc-500">(optional)</span>
        </label>
        <PhotoUploader name="photos" />
      </div>

      {/* Submit */}
      <div className="flex justify-end border-t border-zinc-100 pt-6">
        <button
          type="submit"
          className="rounded-lg bg-emerald-600 px-8 py-3 text-base font-medium text-white shadow-md shadow-emerald-600/20 transition-all hover:bg-emerald-700 hover:shadow-lg hover:shadow-emerald-600/25 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 active:scale-[0.98]"
        >
          Publish listing
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  optional,
  children,
}: {
  label: string;
  htmlFor: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-zinc-700">
        {label}
        {optional && <span className="ml-1 font-normal text-zinc-500">(optional)</span>}
      </label>
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Update new listing page**

```tsx
// app/listings/new/page.tsx
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { createListing } from "@/lib/listings/actions";
import { ListingForm } from "@/components/listings/listing-form";

export const metadata = { title: "Post a listing — Quadra Barter" };

export default async function NewListingPage() {
  await requireUser();
  const supabase = await createClient();
  const [{ data: categories }, { data: areas }] = await Promise.all([
    supabase.from("categories").select("id, name, slug").order("sort_order"),
    supabase.from("areas").select("id, name, slug").order("sort_order"),
  ]);

  const ridesCat = (categories ?? []).find((c) => c.slug === "rides");

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:py-12">
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8 lg:p-10">
        <header className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">
            Post a listing
          </h1>
          <p className="mt-2 text-zinc-600">
            Share what you have or find what you need
          </p>
        </header>

        <ListingForm
          action={createListing}
          categories={categories ?? []}
          areas={areas ?? []}
          ridesCategoryId={ridesCat?.id ?? null}
        />
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Run type check**

Run: `pnpm tsc --noEmit`

Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
git add components/listings/listing-form.tsx app/listings/new/page.tsx
git commit -m "$(cat <<'EOF'
feat(rides): add conditional ride fields to create listing

ListingForm shows ride fields when Rides category is selected.
Includes helper text and ride-specific placeholders.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Edit Listing Form with Ride Fields

**Files:**
- Modify: `app/me/listings/[id]/edit/page.tsx`

- [ ] **Step 1: Update edit listing page**

```tsx
// app/me/listings/[id]/edit/page.tsx
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { editListing, deleteListingImage } from "@/lib/listings/actions";
import { listingImageUrl } from "@/lib/img";
import { PhotoUploader } from "@/components/listings/photo-uploader";
import { EditListingForm } from "@/components/listings/edit-listing-form";

export const metadata = { title: "Edit listing — Quadra Barter" };

export default async function EditListingPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: listing }, { data: categories }, { data: areas }, { data: images }] = await Promise.all([
    supabase.from("listings").select("*").eq("id", id).eq("owner_id", user.id).maybeSingle(),
    supabase.from("categories").select("id, name, slug").order("sort_order"),
    supabase.from("areas").select("id, name, slug").order("sort_order"),
    supabase.from("listing_images").select("id, path, sort_order").eq("listing_id", id).order("sort_order"),
  ]);
  if (!listing) notFound();
  const sortedImages = (images ?? []).slice().sort((a, b) => a.sort_order - b.sort_order);
  const ridesCat = (categories ?? []).find((c) => c.slug === "rides");

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:py-12">
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8 lg:p-10">
        <header className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">
            Edit listing
          </h1>
          <p className="mt-2 text-zinc-600">
            Update your listing details
          </p>
        </header>

        {/* Existing photos - outside form to allow nested delete forms */}
        {sortedImages.length > 0 && (
          <div className="mb-8 space-y-3">
            <label className="block text-sm font-medium text-zinc-700">
              Current photos
            </label>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
              {sortedImages.map((img) => (
                <div key={img.id} className="group relative aspect-square overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={listingImageUrl(img.path)}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                  <form action={deleteListingImage} className="absolute right-1 top-1">
                    <input type="hidden" name="image_id" value={img.id} />
                    <input type="hidden" name="listing_id" value={listing.id} />
                    <button
                      type="submit"
                      className="rounded-full bg-black/60 p-1.5 text-white opacity-0 transition-opacity hover:bg-red-600 group-hover:opacity-100"
                      title="Remove photo"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </form>
                </div>
              ))}
            </div>
          </div>
        )}

        <EditListingForm
          action={editListing}
          listing={listing}
          categories={categories ?? []}
          areas={areas ?? []}
          ridesCategoryId={ridesCat?.id ?? null}
        />
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Create EditListingForm component**

```tsx
// components/listings/edit-listing-form.tsx
"use client";

import { useState } from "react";
import { RideFields } from "./ride-fields";
import { PhotoUploader } from "./photo-uploader";

type Category = { id: string; name: string; slug: string };
type Area = { id: string; name: string; slug: string };
type Listing = {
  id: string;
  type: string;
  title: string;
  description: string | null;
  category_id: string | null;
  area_id: string | null;
  wants_text: string | null;
  route_from: string | null;
  route_to: string | null;
  schedule: string | null;
  seats: number | null;
  gas_share: boolean;
};

type Props = {
  action: (form: FormData) => Promise<void>;
  listing: Listing;
  categories: Category[];
  areas: Area[];
  ridesCategoryId: string | null;
};

export function EditListingForm({ action, listing, categories, areas, ridesCategoryId }: Props) {
  const [selectedCategory, setSelectedCategory] = useState(listing.category_id ?? "");
  const isRide = ridesCategoryId !== null && selectedCategory === ridesCategoryId;

  return (
    <form action={action} className="space-y-8">
      <input type="hidden" name="id" value={listing.id} />

      {/* Type & Category row */}
      <div className="grid gap-6 sm:grid-cols-2">
        <Field label="Type" htmlFor="type">
          <select
            id="type"
            name="type"
            defaultValue={listing.type}
            className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-zinc-900 shadow-sm transition-colors focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          >
            <option value="offer">Offering</option>
            <option value="want">Wanted</option>
          </select>
        </Field>

        <Field label="Category" htmlFor="category_id">
          <select
            id="category_id"
            name="category_id"
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-zinc-900 shadow-sm transition-colors focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </Field>
      </div>

      {/* Ride fields (conditional) */}
      <RideFields
        areas={areas}
        show={isRide}
        defaultValues={isRide ? {
          route_from: listing.route_from ?? undefined,
          route_to: listing.route_to ?? undefined,
          schedule: listing.schedule ?? undefined,
          seats: listing.seats ?? undefined,
          gas_share: listing.gas_share,
        } : undefined}
      />

      {/* Title */}
      <Field label="Title" htmlFor="title">
        <input
          id="title"
          name="title"
          defaultValue={listing.title}
          required
          minLength={3}
          maxLength={120}
          className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-lg text-zinc-900 shadow-sm transition-colors placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
        />
      </Field>

      {/* Description */}
      <Field label="Description" htmlFor="description" optional>
        <textarea
          id="description"
          name="description"
          defaultValue={listing.description ?? ""}
          rows={5}
          maxLength={2000}
          placeholder="Add details about condition, quantity, or anything else…"
          className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-zinc-900 shadow-sm transition-colors placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
        />
      </Field>

      {/* Area & Swap preferences row */}
      <div className="grid gap-6 sm:grid-cols-2">
        <Field label="Area" htmlFor="area_id">
          <select
            id="area_id"
            name="area_id"
            defaultValue={listing.area_id ?? ""}
            className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-zinc-900 shadow-sm transition-colors focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          >
            {areas.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </Field>

        <Field label="What I'd swap for" htmlFor="wants_text" optional>
          <input
            id="wants_text"
            name="wants_text"
            defaultValue={listing.wants_text ?? ""}
            maxLength={500}
            placeholder="e.g. firewood, eggs, help with…"
            className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-zinc-900 shadow-sm transition-colors placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          />
        </Field>
      </div>

      {/* Add new photos */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-zinc-700">
          Add photos <span className="font-normal text-zinc-500">(optional)</span>
        </label>
        <PhotoUploader name="photos" />
      </div>

      {/* Submit */}
      <div className="flex justify-end border-t border-zinc-100 pt-6">
        <button
          type="submit"
          className="rounded-lg bg-emerald-600 px-8 py-3 text-base font-medium text-white shadow-md shadow-emerald-600/20 transition-all hover:bg-emerald-700 hover:shadow-lg hover:shadow-emerald-600/25 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 active:scale-[0.98]"
        >
          Save changes
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  optional,
  children,
}: {
  label: string;
  htmlFor: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-zinc-700">
        {label}
        {optional && <span className="ml-1 font-normal text-zinc-500">(optional)</span>}
      </label>
      {children}
    </div>
  );
}
```

- [ ] **Step 3: Run type check**

Run: `pnpm tsc --noEmit`

Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
git add components/listings/edit-listing-form.tsx app/me/listings/[id]/edit/page.tsx
git commit -m "$(cat <<'EOF'
feat(rides): add conditional ride fields to edit listing

EditListingForm shows ride fields when Rides category is selected,
with existing values pre-populated.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Listing Card Ride Display

**Files:**
- Modify: `components/listings/listing-card.tsx`

- [ ] **Step 1: Update ListingCard to show ride info**

```tsx
// components/listings/listing-card.tsx
import Link from "next/link";
import Image from "next/image";
import { TypeBadge } from "./type-badge";
import { listingImageUrl } from "@/lib/img";
import type { FeedItem } from "@/lib/listings/queries";

export function ListingCard({ item }: { item: FeedItem }) {
  const isRide = item.category_slug === "rides";

  return (
    <Link
      href={`/l/${item.id}/${item.slug}`}
      className="group block overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm transition-all hover:border-zinc-300 hover:shadow-md"
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-gradient-to-br from-zinc-100 to-zinc-50 sm:aspect-square">
        {item.cover_path ? (
          <Image
            src={listingImageUrl(item.cover_path)}
            alt={item.title}
            fill
            sizes="(max-width:640px) 50vw, 33vw"
            className="object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : isRide ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-emerald-50 text-emerald-600">
            <span className="text-4xl">🚗</span>
            <span className="text-xs font-medium">Ride</span>
          </div>
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-zinc-300">
            <svg className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span className="text-xs font-medium">No photo</span>
          </div>
        )}
      </div>
      <div className="space-y-1 p-2.5 sm:space-y-1.5 sm:p-3">
        <div className="flex items-center justify-between gap-1.5 sm:gap-2">
          <TypeBadge type={item.type} />
          {item.area_name && (
            <span className="flex items-center gap-0.5 truncate text-[11px] text-zinc-500 sm:gap-1 sm:text-xs">
              <svg className="h-2.5 w-2.5 shrink-0 sm:h-3 sm:w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="truncate">{item.area_name}</span>
            </span>
          )}
        </div>
        <h3 className="line-clamp-2 text-[13px] font-medium leading-snug text-zinc-900 sm:text-sm">{item.title}</h3>
        {isRide && item.schedule && (
          <p className="line-clamp-1 text-[11px] text-zinc-500 sm:text-xs">
            {item.schedule} · {item.seats} seat{item.seats !== 1 ? "s" : ""}
          </p>
        )}
      </div>
    </Link>
  );
}
```

- [ ] **Step 2: Run type check**

Run: `pnpm tsc --noEmit`

Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add components/listings/listing-card.tsx
git commit -m "$(cat <<'EOF'
feat(rides): display ride info on listing cards

Shows schedule and seats for ride listings. Uses car emoji placeholder
when no photo is present for rides.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: Listing Detail Ride Display

**Files:**
- Modify: `app/l/[id]/[slug]/page.tsx`

- [ ] **Step 1: Update listing detail page for rides**

Add ride details section after the description. Find the existing `{l.description && ...}` block and add ride details after it:

```tsx
// In app/l/[id]/[slug]/page.tsx, add after the description block:

{l.category_slug === "rides" && l.route_from_name && l.route_to_name && (
  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 space-y-3">
    <h2 className="text-sm font-semibold text-emerald-800 flex items-center gap-2">
      <span>🚗</span> Ride Details
    </h2>
    <div className="grid gap-2 text-sm">
      <div className="flex items-center gap-2">
        <span className="font-medium text-zinc-700">Route:</span>
        <span className="text-zinc-800">{l.route_from_name} → {l.route_to_name}</span>
      </div>
      {l.schedule && (
        <div className="flex items-center gap-2">
          <span className="font-medium text-zinc-700">Schedule:</span>
          <span className="text-zinc-800">{l.schedule}</span>
        </div>
      )}
      {l.seats && (
        <div className="flex items-center gap-2">
          <span className="font-medium text-zinc-700">Seats:</span>
          <span className="text-zinc-800">{l.seats} available</span>
        </div>
      )}
      {l.gas_share && (
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
            Gas share welcome
          </span>
        </div>
      )}
    </div>
  </div>
)}
```

- [ ] **Step 2: Run type check**

Run: `pnpm tsc --noEmit`

Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add app/l/[id]/[slug]/page.tsx
git commit -m "$(cat <<'EOF'
feat(rides): display ride details on listing detail page

Shows route, schedule, seats, and gas share preference in a
highlighted section for ride listings.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: Route Filter in Feed (Optional Enhancement)

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: Add route filter params to feed**

Update the HomePage component to accept route filter params:

```tsx
// app/page.tsx
import Link from "next/link";
import { searchListings } from "@/lib/listings/search";
import { ListingGrid } from "@/components/listings/listing-grid";
import { SearchBar } from "@/components/feed/search-bar";
import { CategoryChips } from "@/components/feed/category-chips";
import { getSessionUser } from "@/lib/auth";

export default async function HomePage(
  { searchParams }: { searchParams: Promise<{ q?: string; c?: string; a?: string; from?: string; to?: string }> },
) {
  const sp = await searchParams;
  const [items, user] = await Promise.all([
    searchListings({
      q: sp.q,
      categorySlug: sp.c,
      areaSlug: sp.a,
      routeFrom: sp.from,
      routeTo: sp.to,
      limit: 24,
    }),
    getSessionUser(),
  ]);

  const isFiltered = !!(sp.q || sp.c || sp.a || sp.from || sp.to);


  return (
    <main className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      {!isFiltered && (
        <section className="hidden space-y-4 py-4 text-center sm:block sm:py-6">
          <h1 className="text-2xl font-semibold text-zinc-900 sm:text-3xl md:text-4xl">
            Swap goods and services on Quadra Island
          </h1>
          <p className="mx-auto max-w-md text-zinc-600">
            Just neighbours trading what they have for what they need.
          </p>
          {!user && (
            <Link
              href="/signin"
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 font-medium text-white shadow-sm transition hover:bg-emerald-700"
            >
              Get started
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </Link>
          )}
        </section>
      )}

      <div className="space-y-4">
        <SearchBar defaultValue={sp.q} />
        <CategoryChips
          active={sp.c}
          baseParams={{ q: sp.q, a: sp.a }}
        />
      </div>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-zinc-900 sm:text-xl">
          {isFiltered ? "Results" : "Latest listings"}
        </h2>
        <ListingGrid items={items} emptyText="No listings match your search." />
      </section>
    </main>
  );
}
```

- [ ] **Step 2: Run type check**

Run: `pnpm tsc --noEmit`

Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add app/page.tsx
git commit -m "$(cat <<'EOF'
feat(rides): support route filtering in feed search params

Feed accepts ?from=<area-slug>&to=<area-slug> to filter ride listings
by route origin and destination.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 13: Chat Prompt for Rides

**Files:**
- Modify: `lib/chat/queries.ts`
- Modify: `app/chats/[id]/page.tsx`

- [ ] **Step 1: Add category_slug to ChatHeader**

In `lib/chat/queries.ts`, update the ChatHeader type and getChat query:

```typescript
export type ChatHeader = {
  id: string;
  listing: {
    id: string;
    title: string;
    slug: string;
    owner_id: string;
    cover_path: string | null;
    category_slug: string | null;
  };
  initiator: { id: string; display_name: string | null };
  owner: { id: string; display_name: string | null };
};

export async function getChat(chatId: string): Promise<ChatHeader | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("chats")
    .select(`
      id, initiator_id, owner_id,
      listing:listing_id ( id, title, slug, owner_id, category_id, categories:category_id ( slug ), listing_images ( path, sort_order ) ),
      initiator:public_users!initiator_id ( id, display_name ),
      owner:public_users!owner_id ( id, display_name )
    `)
    .eq("id", chatId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const row = data as any;
  const cover = (row.listing?.listing_images ?? [])
    .slice()
    .sort((a: any, b: any) => a.sort_order - b.sort_order)[0]?.path ?? null;

  return {
    id: row.id,
    listing: {
      id: row.listing?.id,
      title: row.listing?.title ?? "",
      slug: row.listing?.slug ?? "",
      owner_id: row.listing?.owner_id ?? row.owner_id,
      cover_path: cover,
      category_slug: row.listing?.categories?.slug ?? null,
    },
    initiator: {
      id: row.initiator?.id ?? row.initiator_id,
      display_name: row.initiator?.display_name ?? null,
    },
    owner: {
      id: row.owner?.id ?? row.owner_id,
      display_name: row.owner?.display_name ?? null,
    },
  };
}
```

- [ ] **Step 2: Add ride prompt to chat page**

In `app/chats/[id]/page.tsx`, add after the header section:

```tsx
{chat.listing.category_slug === "rides" && (
  <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
    <strong>Tip:</strong> Let the driver know which days you need, where to meet, and what you can offer in return.
  </div>
)}
```

- [ ] **Step 3: Run type check**

Run: `pnpm tsc --noEmit`

Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
git add lib/chat/queries.ts app/chats/[id]/page.tsx
git commit -m "$(cat <<'EOF'
feat(rides): add contextual tip in ride listing chats

Shows a prompt suggesting what to tell the driver when chatting
about a ride listing.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 14: Manual Testing

- [ ] **Step 1: Start dev server**

Run: `pnpm dev`

Expected: Server starts without errors.

- [ ] **Step 2: Test creating a ride listing**

1. Open http://localhost:3000/listings/new
2. Select "Rides" category
3. Verify ride fields appear (From, To, Schedule, Seats, Gas share)
4. Fill in all fields
5. Submit
6. Verify ride details display on detail page

Expected: Ride listing created and displayed correctly.

- [ ] **Step 3: Test editing a ride listing**

1. Go to /me/listings
2. Edit the ride listing
3. Verify ride fields show existing values
4. Update a field
5. Save
6. Verify changes persisted

Expected: Edit flow works for ride listings.

- [ ] **Step 4: Test feed display**

1. Go to home feed
2. Click "Rides" category chip
3. Verify only ride listings appear
4. Verify ride cards show schedule and seats

Expected: Feed filtering and display works.

- [ ] **Step 5: Test non-ride listing**

1. Create a normal listing (not Rides category)
2. Verify ride fields don't appear in form
3. Verify listing displays normally

Expected: Non-ride listings unaffected.

---

### Task 15: Final Verification

- [ ] **Step 1: Run full test suite**

Run: `pnpm test:unit && pnpm tsc --noEmit`

Expected: All tests pass, no type errors.

- [ ] **Step 2: Run e2e tests**

Run: `pnpm test:e2e`

Expected: Existing e2e tests still pass.

- [ ] **Step 3: Final commit summary**

Verify all changes committed. Run: `git log --oneline -15`

Expected: See all rides feature commits.
