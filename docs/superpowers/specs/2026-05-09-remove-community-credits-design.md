# Remove Community Credits — Design Spec

**Date:** 2026-05-09
**Status:** Design (pre-implementation)
**Supersedes:** Section 4 ("Community credits") and the `credits_ledger` / `credits_transferred` portions of Section 6 in `2026-05-02-quadra-barter-design.md`.

## 1. Overview

Remove every trace of the unbuilt community-credits feature from the codebase. The feature today is one column (`listings.accepts_credits`) and one checkbox on the listing-create / listing-edit forms — neither does anything end-to-end. We are deleting them.

## 2. Why

The original design (2026-05-02) listed community credits as a v2 feature, after MVP, and explicitly flagged inflation/hoarding as a known risk (#15). Plan 2 (`2026-05-03-quadra-barter-listings.md`) shipped the per-listing toggle and column ahead of any backing ledger. Plan 3 (`2026-05-03-quadra-barter-interactions.md`) deferred ledger work explicitly: *"No credits transfer in this plan… the credits_ledger table and actual movement of credits is v2 territory."*

The result: a checkbox that promises a feature the system can't keep. Two failure modes:
- A user toggles "Also accept community credits" expecting credits to appear somewhere; nothing happens; trust erodes.
- A user toggles it on a listing; another user reads "accepts credits" on the listing detail page and forms a wrong expectation about how the trade will work.

YAGNI: the original spec deferred credits because a 3,000-person island has thin liquidity, a thick abuse surface, and bigger fish to fry pre-launch. There is no concrete user request for credits today. Deletion now is one hour of work; reintroduction later is one additive migration. Keeping a no-op feature in the schema and UI is the worst of both worlds.

## 3. Scope

**In scope:**
- Drop the `accepts_credits` column from `public.listings`.
- Remove the `accepts_credits` form field, validation, internal types, query selection, row-shape, and server-action handling.
- Remove `accepts_credits` from unit-test fixtures.

**Out of scope:**
- The `trades` and `ratings` tables. Credits never reached them; nothing to remove.
- The `credits_ledger` table. It was specced but never created; nothing to remove.
- The 2026-05-02 design doc. It stays as a historical snapshot; this spec supersedes the credits sections.
- Re-architecting trades. Trade flow is unchanged.

## 4. File-by-file changes

### Migration (new)
`supabase/migrations/0015_drop_accepts_credits.sql`
```sql
alter table public.listings drop column accepts_credits;
```

### Server-side types and validation
- `lib/listings/validation.ts` — drop `accepts_credits: z.boolean().default(false)` from `createListingSchema`.
- `lib/listings/internal.ts` — drop `accepts_credits: boolean` from `ListingRow`; drop the field from `buildListingRow`'s returned object.
- `lib/listings/queries.ts` — drop `accepts_credits: boolean` from `ListingDetail`; remove `accepts_credits` from the `.select(...)` string in `getListing`; remove `accepts_credits: data.accepts_credits` from the returned object in `getListing`.
- `lib/listings/actions.ts` — remove `accepts_credits: form.get("accepts_credits") === "on"` from the `raw` objects in both `createListing` and `editListing`.

### UI
- `app/listings/new/page.tsx` — remove the entire `<label>…<input type="checkbox" name="accepts_credits" />…Also accept community credits…</label>` block.
- `app/me/listings/[id]/edit/page.tsx` — same removal (this version has `defaultChecked={listing.accepts_credits}`).

### Tests
- `tests/unit/listings-validation.test.ts` — remove `accepts_credits: false` from the `valid` fixture.
- `tests/unit/listings-actions.test.ts` — remove `accepts_credits: false` from the `validInput` fixture.

## 5. What we are NOT doing

- Not adding any kind of "deprecation" period. The column is universally `false` in practice; no real data is preserved by leaving it.
- Not auditing third-party places that might read the column (RLS policies, views, edge functions). A repo-wide grep is the verification.
- Not adjusting Plan 2 (`2026-05-03-quadra-barter-listings.md`) or Plan 3 (`2026-05-03-quadra-barter-interactions.md`). Those plans are historical artifacts of decisions made at a moment in time; they stay readable as such.

## 6. Verification

After the change:
- `pnpm vitest run` passes.
- `pnpm tsc --noEmit` reports no errors. Type narrowing on `ListingDetail` no longer mentions `accepts_credits`.
- `grep -RIniE 'accepts_credits' --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=docs --exclude-dir=.git .` returns hits in exactly three places, all intentional: the original column-creating migration `supabase/migrations/0003_listings.sql` (historical record — must not be rewritten), the new column-dropping migration added in the plan, and the new permanent regression test added in the plan. Anything else is a leftover and must be removed.
- Manual smoke: load `/listings/new`, fill in the form, publish — no checkbox visible, listing publishes cleanly. Load `/me/listings/[id]/edit` for an existing listing — no checkbox visible, edit submits cleanly. Load `/l/[id]/[slug]` — detail page renders.
- The migration runs cleanly against a freshly-migrated database (the fixture data already has `accepts_credits = false` everywhere).

## 7. Rollback

`alter table … drop column` is irreversible in SQL terms — the column data is gone. This is acceptable: the column is universally `false` in production, so no real information is lost. Re-introduction later, if ever, is an additive migration (`alter table public.listings add column accepts_credits boolean not null default false`) plus restoration of the form/validation/query code from git history.

## 8. Risk

Low. The feature is a no-op today. The only meaningful risk is missing a reference to `accepts_credits` somewhere outside the explicit grep scope (e.g. inside `node_modules/.next` build artifacts, or a generated types file). The verification step's grep covers the source tree; build artifacts regenerate on next build.
