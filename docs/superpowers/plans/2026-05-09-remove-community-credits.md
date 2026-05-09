# Remove Community Credits Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove every reference to `accepts_credits` from the codebase and from the `listings` table — the unbuilt community-credits feature that today is a no-op UI checkbox plus an unused boolean column.

**Architecture:** A unit-test tripwire goes in first to lock in "no `accepts_credits` in the parsed schema or in `buildListingRow`'s output." Then the field is removed from validation → internal/types → server actions → queries → UI forms → existing test fixtures. The Postgres column is dropped last, after all selecting code is gone, so the migration cannot break a running build. The tripwire test stays in the repo as a permanent guard against an accidental re-introduction.

**Tech Stack:** Next.js 16 (App Router) + TypeScript + zod, Supabase Postgres, vitest for unit tests, pnpm.

**Spec:** `docs/superpowers/specs/2026-05-09-remove-community-credits-design.md`

---

## File map

Files modified or created in this plan:

| File | Action | Purpose |
|---|---|---|
| `tests/unit/listings-no-credits.test.ts` | **Create** | Permanent regression test asserting the schema and row-builder no longer carry `accepts_credits`. |
| `lib/listings/validation.ts` | Modify | Drop `accepts_credits: z.boolean().default(false)` from `createListingSchema`. |
| `lib/listings/internal.ts` | Modify | Drop `accepts_credits: boolean` from `ListingRow`; drop the field from `buildListingRow`'s returned object. |
| `tests/unit/listings-actions.test.ts` | Modify | Drop `accepts_credits: false` from `validInput` (TS-required: the `CreateListingInput` type no longer has the field). |
| `tests/unit/listings-validation.test.ts` | Modify | Drop `accepts_credits: false` from `valid` (cleanup; not TS-required because zod strips unknowns). |
| `lib/listings/actions.ts` | Modify | Drop `accepts_credits: form.get("accepts_credits") === "on"` from the `raw` objects in both `createListing` and `editListing`. |
| `lib/listings/queries.ts` | Modify | Drop `accepts_credits: boolean` from `ListingDetail`; remove from the `.select(...)` string in `getListing`; remove from the returned object in `getListing`. |
| `app/listings/new/page.tsx` | Modify | Remove the "Also accept community credits" `<label>…<input>` block. |
| `app/me/listings/[id]/edit/page.tsx` | Modify | Same removal (this version uses `defaultChecked={listing.accepts_credits}`). |
| `supabase/migrations/0015_drop_accepts_credits.sql` | **Create** | `alter table public.listings drop column accepts_credits;` |

Total: 1 new test file, 7 file edits, 1 new migration.

---

## Conventions and commands

- **Run unit tests:** `pnpm test:unit -- <file or pattern>` (with `dotenv -e .env.local`). Project script defined in `package.json`.
- **Type-check the whole project:** `pnpm exec tsc --noEmit`
- **Apply migrations to local Supabase:** `pnpm db:apply` — loops every file in `supabase/migrations/*.sql` and pipes it into the running `supabase-db` Docker container, then runs `seed.sql`.
- **Smoke-test a page:** `pnpm dev` then open `http://localhost:3000/...` in a browser.
- **Repo-wide grep for stragglers:** `grep -RIniE 'accepts_credits' --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=docs --exclude-dir=.git .`

---

## Task 1: Add the regression test (failing)

**Files:**
- Create: `tests/unit/listings-no-credits.test.ts`

This test asserts the post-state we want to enforce — the schema and `buildListingRow` MUST NOT emit an `accepts_credits` field. Currently this fails because zod's `.default(false)` populates the field and `buildListingRow` echoes it.

After Task 2 makes it pass, the test stays in the repo as a permanent tripwire: anyone trying to re-add the credits feature without thinking will get a red CI signal that points at this spec.

- [ ] **Step 1: Create the test file**

Write `tests/unit/listings-no-credits.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { createListingSchema } from "@/lib/listings/validation";
import { buildListingRow } from "@/lib/listings/internal";

// See docs/superpowers/specs/2026-05-09-remove-community-credits-design.md
// for why community credits were removed. This file exists as a regression
// guard. If you are tempted to re-add the field to satisfy this test,
// re-read the spec first.

const validInput = {
  type: "offer_goods" as const,
  title: "Two ripe apples",
  category_id: "11111111-1111-1111-1111-111111111111",
  area_id:     "22222222-2222-2222-2222-222222222222",
  wants_text: "Eggs or jam",
};

describe("community credits removed", () => {
  it("createListingSchema parses input that omits accepts_credits", () => {
    const r = createListingSchema.safeParse(validInput);
    expect(r.success).toBe(true);
  });

  it("createListingSchema does not emit an accepts_credits field", () => {
    const parsed = createListingSchema.parse(validInput);
    expect("accepts_credits" in parsed).toBe(false);
  });

  it("buildListingRow output does not include accepts_credits", () => {
    const parsed = createListingSchema.parse(validInput);
    const row = buildListingRow(parsed, "owner-uuid");
    expect("accepts_credits" in row).toBe(false);
  });
});
```

- [ ] **Step 2: Run the new test and verify it fails**

Run:
```bash
pnpm test:unit -- tests/unit/listings-no-credits.test.ts
```

Expected: 1 test passes (the `safeParse` succeeds because zod is permissive on missing fields when defaults exist), 2 tests fail:
- `createListingSchema does not emit an accepts_credits field` — fails because `.default(false)` populates `parsed.accepts_credits = false`.
- `buildListingRow output does not include accepts_credits` — fails because `buildListingRow` always sets `accepts_credits: input.accepts_credits`.

- [ ] **Step 3: Commit the failing test**

```bash
git add tests/unit/listings-no-credits.test.ts
git commit -m "test(listings): regression guard for community-credits removal"
```

It is unusual to commit a failing test, but legitimate here: the next task is what makes it pass, and the commit boundary documents the intent before the change.

---

## Task 2: Remove `accepts_credits` from validation, internal types, and the actions test fixture

**Files:**
- Modify: `lib/listings/validation.ts:13`
- Modify: `lib/listings/internal.ts:16,30`
- Modify: `tests/unit/listings-actions.test.ts:11`

These three files must change in one commit because they are TS-coupled:
1. Drop `accepts_credits` from the schema → `CreateListingInput` no longer has the field.
2. `buildListingRow` (in `internal.ts`) currently reads `input.accepts_credits` and writes it into `ListingRow`. After step 1 that property is gone from `CreateListingInput`, so `internal.ts` errors. Drop both the `ListingRow` field and the assignment.
3. `tests/unit/listings-actions.test.ts` defines `validInput` of inferred type matching `CreateListingInput` and passes it to `buildListingRow`. With `accepts_credits: false` still in the literal, TS errors with "Object literal may only specify known properties." Drop it.

The other test fixture (`tests/unit/listings-validation.test.ts`) is *not* TS-required because that fixture is passed to `createListingSchema.safeParse(...)`, which accepts `unknown`. It is cleaned up in Task 3.

- [ ] **Step 1: Remove `accepts_credits` from `createListingSchema`**

Edit `lib/listings/validation.ts`. Replace this block:

```typescript
export const createListingSchema = z.object({
  type: z.enum(LISTING_TYPES),
  title: z.string().trim().min(3, "Title is too short").max(120, "Title is too long"),
  description: z.string().trim().max(2000).optional(),
  category_id: z.string().uuid(),
  area_id: z.string().uuid(),
  wants_text: z.string().trim().max(500).optional(),
  accepts_credits: z.boolean().default(false),
});
```

with:

```typescript
export const createListingSchema = z.object({
  type: z.enum(LISTING_TYPES),
  title: z.string().trim().min(3, "Title is too short").max(120, "Title is too long"),
  description: z.string().trim().max(2000).optional(),
  category_id: z.string().uuid(),
  area_id: z.string().uuid(),
  wants_text: z.string().trim().max(500).optional(),
});
```

- [ ] **Step 2: Remove `accepts_credits` from `ListingRow` and `buildListingRow`**

Edit `lib/listings/internal.ts`. Replace the `ListingRow` type:

```typescript
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
```

with:

```typescript
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
};
```

And replace the body of `buildListingRow`:

```typescript
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
```

with:

```typescript
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
    status: "active",
  };
}
```

- [ ] **Step 3: Remove `accepts_credits` from the actions test fixture**

Edit `tests/unit/listings-actions.test.ts`. Replace this block:

```typescript
const validInput = {
  type: "offer_goods" as const,
  title: "Two ripe apples",
  description: undefined,
  category_id: "11111111-1111-1111-1111-111111111111",
  area_id:     "22222222-2222-2222-2222-222222222222",
  wants_text: undefined,
  accepts_credits: false,
};
```

with:

```typescript
const validInput = {
  type: "offer_goods" as const,
  title: "Two ripe apples",
  description: undefined,
  category_id: "11111111-1111-1111-1111-111111111111",
  area_id:     "22222222-2222-2222-2222-222222222222",
  wants_text: undefined,
};
```

- [ ] **Step 4: Run TypeScript check**

Run:
```bash
pnpm exec tsc --noEmit
```

Expected: zero errors. (If you see "Property 'accepts_credits' does not exist", you missed a spot — most likely `actions.ts` or `queries.ts`. Those are intentionally addressed in Tasks 3 and 4. If `tsc` complains about a file other than `actions.ts` or `queries.ts`, stop and investigate before proceeding.)

If `tsc` reports errors only in `lib/listings/actions.ts` or `lib/listings/queries.ts`, that is **expected** — both still mention `accepts_credits` and will be cleaned up in the next two tasks. They will not error, however, because:
- `actions.ts` builds a `Record`-shaped `raw` object and passes it to `createListingSchema.parse(...)`, which now silently strips the unknown key. No TS error.
- `queries.ts` reshapes a `data: any` from supabase. No TS error.

So in practice `tsc` should pass cleanly here.

- [ ] **Step 5: Run unit tests**

Run:
```bash
pnpm test:unit
```

Expected: all tests pass, including the three in `listings-no-credits.test.ts` from Task 1.

- [ ] **Step 6: Commit**

```bash
git add lib/listings/validation.ts lib/listings/internal.ts tests/unit/listings-actions.test.ts
git commit -m "feat(listings): drop accepts_credits from schema and ListingRow"
```

---

## Task 3: Remove `accepts_credits` from server actions and the validation test fixture

**Files:**
- Modify: `lib/listings/actions.ts:20,67`
- Modify: `tests/unit/listings-validation.test.ts:11`

After Task 2, both `raw` objects in `actions.ts` set `accepts_credits` for nothing — zod silently drops it. Remove the dead lines. Same for the leftover field in `tests/unit/listings-validation.test.ts`.

- [ ] **Step 1: Remove `accepts_credits` from `createListing`**

Edit `lib/listings/actions.ts`. In `createListing`, replace this block:

```typescript
  const raw = {
    type: form.get("type"),
    title: form.get("title"),
    description: form.get("description") || undefined,
    category_id: form.get("category_id"),
    area_id: form.get("area_id"),
    wants_text: form.get("wants_text") || undefined,
    accepts_credits: form.get("accepts_credits") === "on",
  };
```

with:

```typescript
  const raw = {
    type: form.get("type"),
    title: form.get("title"),
    description: form.get("description") || undefined,
    category_id: form.get("category_id"),
    area_id: form.get("area_id"),
    wants_text: form.get("wants_text") || undefined,
  };
```

- [ ] **Step 2: Remove `accepts_credits` from `editListing`**

In the same file, in `editListing`, replace this block:

```typescript
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
```

with:

```typescript
  const raw = {
    id: form.get("id"),
    type: form.get("type") || undefined,
    title: form.get("title") || undefined,
    description: form.get("description") || undefined,
    category_id: form.get("category_id") || undefined,
    area_id: form.get("area_id") || undefined,
    wants_text: form.get("wants_text") || undefined,
  };
```

- [ ] **Step 3: Remove `accepts_credits` from the validation test fixture**

Edit `tests/unit/listings-validation.test.ts`. Replace:

```typescript
const valid = {
  type: "offer_goods" as const,
  title: "Two ripe apples",
  description: "From our backyard tree",
  category_id: "11111111-1111-1111-1111-111111111111",
  area_id:     "22222222-2222-2222-2222-222222222222",
  wants_text: "Eggs or jam",
  accepts_credits: false,
};
```

with:

```typescript
const valid = {
  type: "offer_goods" as const,
  title: "Two ripe apples",
  description: "From our backyard tree",
  category_id: "11111111-1111-1111-1111-111111111111",
  area_id:     "22222222-2222-2222-2222-222222222222",
  wants_text: "Eggs or jam",
};
```

- [ ] **Step 4: Run unit tests**

Run:
```bash
pnpm test:unit
```

Expected: all tests still pass (these changes don't change observable behaviour — the validation fixture's removed field was already silently stripped by zod, and the actions changes only remove dead key writes).

- [ ] **Step 5: Commit**

```bash
git add lib/listings/actions.ts tests/unit/listings-validation.test.ts
git commit -m "refactor(listings): drop dead accepts_credits writes from actions"
```

---

## Task 4: Remove `accepts_credits` from queries

**Files:**
- Modify: `lib/listings/queries.ts:84,94,114`

`getListing` selects `accepts_credits` from the `listings` table and surfaces it on the `ListingDetail` type. After this task, `ListingDetail` no longer has the field and the SELECT no longer requests it. This must happen before the migration in Task 7 — otherwise the running app would issue a SELECT on a column that no longer exists.

- [ ] **Step 1: Remove `accepts_credits` from `ListingDetail`**

Edit `lib/listings/queries.ts`. Replace this block (around line 81):

```typescript
export type ListingDetail = FeedItem & {
  description: string | null;
  wants_text: string | null;
  accepts_credits: boolean;
  owner: { id: string; display_name: string | null };
  images: { path: string; alt_text: string | null; sort_order: number }[];
};
```

with:

```typescript
export type ListingDetail = FeedItem & {
  description: string | null;
  wants_text: string | null;
  owner: { id: string; display_name: string | null };
  images: { path: string; alt_text: string | null; sort_order: number }[];
};
```

- [ ] **Step 2: Remove `accepts_credits` from the SELECT in `getListing`**

In the same file, replace:

```typescript
    .select(`
      id, slug, title, type, status, description, wants_text, accepts_credits, created_at,
      areas:area_id ( name ),
      categories:category_id ( name ),
      owner_id,
      public_users!owner_id ( id, display_name ),
      listing_images ( path, alt_text, sort_order )
    `)
```

with:

```typescript
    .select(`
      id, slug, title, type, status, description, wants_text, created_at,
      areas:area_id ( name ),
      categories:category_id ( name ),
      owner_id,
      public_users!owner_id ( id, display_name ),
      listing_images ( path, alt_text, sort_order )
    `)
```

- [ ] **Step 3: Remove `accepts_credits` from the returned object**

In the same file, replace:

```typescript
  return {
    id: data.id,
    slug: data.slug,
    title: data.title,
    type: data.type,
    status: (data as any).status,
    description: data.description,
    wants_text: data.wants_text,
    accepts_credits: data.accepts_credits,
    area_name: (data as any).areas?.name ?? null,
    category_name: (data as any).categories?.name ?? null,
    cover_path: images[0]?.path ?? null,
    created_at: data.created_at,
    owner: {
      id: (data as any).owner_id,
      display_name: (data as any).public_users?.display_name ?? null,
    },
    images,
  };
```

with:

```typescript
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
    cover_path: images[0]?.path ?? null,
    created_at: data.created_at,
    owner: {
      id: (data as any).owner_id,
      display_name: (data as any).public_users?.display_name ?? null,
    },
    images,
  };
```

- [ ] **Step 4: TypeScript check**

Run:
```bash
pnpm exec tsc --noEmit
```

Expected: zero errors. If `tsc` reports an error in `app/me/listings/[id]/edit/page.tsx` referencing `listing.accepts_credits`, that is **expected** — Task 6 removes that line. Continue to the next step.

(In practice the `accepts_credits` use in the edit page reads from a `select("*")` result typed as `any`, so TS is unlikely to complain. But if it does, the next two tasks fix it.)

- [ ] **Step 5: Run unit tests**

Run:
```bash
pnpm test:unit
```

Expected: all tests pass (`queries.ts` is not exercised by unit tests; this is a sanity check that nothing else regressed).

- [ ] **Step 6: Commit**

```bash
git add lib/listings/queries.ts
git commit -m "feat(listings): drop accepts_credits from getListing query and type"
```

---

## Task 5: Remove the credits checkbox from the new-listing form

**Files:**
- Modify: `app/listings/new/page.tsx:86-89`

- [ ] **Step 1: Remove the `<label>` block**

Edit `app/listings/new/page.tsx`. Find this block (around lines 86–89, after the `wants_text` Field and before `<PhotoUploader>`):

```tsx
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="accepts_credits" />
          Also accept community credits
        </label>

```

Delete it entirely (including the trailing blank line). The result should be that `<PhotoUploader name="photos" />` immediately follows the `wants_text` `Field`.

- [ ] **Step 2: Smoke test the new-listing page**

Start the dev server:
```bash
pnpm dev
```

In a browser (signed in as a test user), open `http://localhost:3000/listings/new`. Verify:
- The "Also accept community credits" checkbox is gone.
- The form submits cleanly and redirects to the new listing's detail page.

Stop the dev server with Ctrl-C when done.

- [ ] **Step 3: Commit**

```bash
git add app/listings/new/page.tsx
git commit -m "feat(listings): remove community-credits checkbox from new-listing form"
```

---

## Task 6: Remove the credits checkbox from the edit-listing form

**Files:**
- Modify: `app/me/listings/[id]/edit/page.tsx:59-62`

- [ ] **Step 1: Remove the `<label>` block**

Edit `app/me/listings/[id]/edit/page.tsx`. Find this block (lines 59–62, after the `wants_text` div and before the Save button):

```tsx
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="accepts_credits" defaultChecked={listing.accepts_credits} />
          Also accept community credits
        </label>
```

Delete it entirely. The result should be that the Save `<button>` immediately follows the `wants_text` div.

- [ ] **Step 2: Type-check**

Run:
```bash
pnpm exec tsc --noEmit
```

Expected: zero errors. (`listing.accepts_credits` is no longer referenced anywhere in TS-checked code.)

- [ ] **Step 3: Smoke test the edit-listing page**

Start the dev server:
```bash
pnpm dev
```

In a browser (signed in), navigate to `/me/listings`, pick any listing, click "Edit". Verify:
- The "Also accept community credits" checkbox is gone.
- The form submits cleanly and redirects to the listing's detail page.

Stop the dev server when done.

- [ ] **Step 4: Commit**

```bash
git add 'app/me/listings/[id]/edit/page.tsx'
git commit -m "feat(listings): remove community-credits checkbox from edit form"
```

---

## Task 7: Add the migration that drops the column

**Files:**
- Create: `supabase/migrations/0015_drop_accepts_credits.sql`

After Tasks 2–6, no code reads or writes the column. Drop it.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0015_drop_accepts_credits.sql`:

```sql
-- supabase/migrations/0015_drop_accepts_credits.sql
-- Removes the unbuilt community-credits feature.
-- See docs/superpowers/specs/2026-05-09-remove-community-credits-design.md
alter table public.listings drop column accepts_credits;
```

- [ ] **Step 2: Apply the migration**

Run:
```bash
pnpm db:apply
```

This re-applies every migration in order against the local Supabase database. The new migration will execute and drop the column. Earlier migrations are idempotent or fail loudly when re-applied; that is the project's existing convention (see `package.json:scripts.db:apply`).

Expected output: a final `ALTER TABLE` line for the new migration, plus the seed re-applying. No errors.

If `pnpm db:apply` errors because earlier migrations are not re-runnable cleanly, instead run only the new file:

```bash
docker exec -i supabase-db psql -U postgres -d postgres < supabase/migrations/0015_drop_accepts_credits.sql
```

Expected output: `ALTER TABLE`.

- [ ] **Step 3: Verify the column is gone**

Run:
```bash
docker exec -i supabase-db psql -U postgres -d postgres -c "\d public.listings" | grep -E 'accepts_credits|^ '
```

Expected: no row containing `accepts_credits`.

- [ ] **Step 4: Smoke test that the app still serves listing pages**

Start the dev server:
```bash
pnpm dev
```

In a browser, open the home feed (`/`) and click into any listing detail page (`/l/[id]/[slug]`). Verify:
- The page renders without server-side errors.
- The browser network tab shows no 500 from `getListing`.

Stop the dev server when done.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0015_drop_accepts_credits.sql
git commit -m "feat(db): drop listings.accepts_credits"
```

---

## Task 8: Final verification

**Files:** none modified.

- [ ] **Step 1: Repo-wide grep**

Run:
```bash
grep -RIniE 'accepts_credits' --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=docs --exclude-dir=.git --exclude-dir=test-results .
```

Expected: hits in exactly three places, all of them intentional:

1. `supabase/migrations/0003_listings.sql` — the original migration that *added* the column. Historical record; must NOT be rewritten.
2. `supabase/migrations/0015_drop_accepts_credits.sql` — the new migration from Task 7 that *drops* the column. Naturally names the column it's removing.
3. `tests/unit/listings-no-credits.test.ts` — the regression-guard test from Task 1.

Together: 0003 says "added at this point", 0015 says "removed at this point", and the test guards against a silent re-introduction.

If you see hits anywhere else, stop and remove them. The acceptance bar for this plan is: zero live `accepts_credits` references in production source code or in fixture data of currently-relevant tests.

- [ ] **Step 2: Run all unit tests**

Run:
```bash
pnpm test:unit
```

Expected: all tests pass, including the three in `listings-no-credits.test.ts`.

- [ ] **Step 3: Run the TypeScript check**

Run:
```bash
pnpm exec tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 4: Build**

Run:
```bash
pnpm build
```

Expected: a clean Next.js build with no compilation errors and no `accepts_credits` mentions in build output.

- [ ] **Step 5: One last smoke pass**

Start the dev server:
```bash
pnpm dev
```

Walk through, in a browser, signed in as a test user:
- `/` (home feed renders)
- click any listing → `/l/[id]/[slug]` (detail page renders)
- `/listings/new` (no credits checkbox, form submits)
- `/me/listings` → click Edit on a listing (no credits checkbox, save works)

Stop the dev server when done.

- [ ] **Step 6: No commit**

There is nothing to commit in this task — verification only. The plan is complete.

---

## Done

After Task 8, the repository contains zero `accepts_credits` references outside the regression test, the Postgres `listings` table no longer has the column, and the listing-create / listing-edit forms have one less field.

If credits ever come back, they come back as a deliberate, ledger-backed feature — not as a checkbox that promises something the system doesn't deliver.
