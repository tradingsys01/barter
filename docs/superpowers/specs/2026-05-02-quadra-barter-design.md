# Quadra Island Barter — Design Spec

**Date:** 2026-05-02
**Status:** Design (pre-implementation)
**Author:** brainstormed with the user

> **Partially superseded.** The community-credits sections (Section 4 paragraph 2; the `credits_ledger` and `credits_transferred` data-model entries in Section 6; the corresponding flow steps in Section 8) were removed by `docs/superpowers/specs/2026-05-09-remove-community-credits-design.md`. The rest of this document still applies.

## 1. Overview

A mobile-first Progressive Web App that lets Quadra Island residents and visiting tourists swap goods and services without using money. The app is a public listing board with email-based accounts, lightweight ratings, and an optional community-credits system for time-shifted (especially service) trades.

## 2. Goals & Non-Goals

**Goals**
- A tourist can post or browse a listing in under 30 seconds with no app install.
- A local can offer a service today and use earned credits next month.
- Listings are publicly discoverable via Google and AI search.
- Solo developer can build, deploy, and maintain on a self-hosted server for ~$2/month.
- Privacy-respectful: no GPS coordinates stored, no cash flow, no surveillance ads.

**Non-goals (v1)**
- No payment processing, no cash sweeteners.
- No native iOS/Android apps. PWA only.
- No off-island users (Quadra-residents + tourists currently on Quadra).
- No ride-share / dating-style proximity matching.
- No formal dispute mediation by the platform.

## 3. Audience

- **Locals** (~2,700 year-round): Repeat users; benefit most from credits, ratings, profiles, push notifications.
- **Tourists** (seasonal surge): Drive-by users; may use the app once or twice; need zero-friction signup, English-only, no install required.

## 4. Trade Model

- **Direct swap** is the default mental model — item-for-item or service-for-service.
- **Community credits** (1 credit ≈ 1 hour of service, configurable) are an optional second mode, primarily for services where direct barter is impractical.
- **No cash sweeteners** — keeps it pure barter, sidesteps tax/regulatory complexity, preserves community spirit.

## 5. Stack & Architecture

| Layer | Choice |
|---|---|
| Frontend | Next.js 15 App Router, Tailwind, shadcn/ui, served as a PWA |
| Backend / DB / Auth / Storage / Realtime | Self-hosted Supabase (Postgres + GoTrue + PostgREST + Storage + Realtime + Kong) |
| Auth | Email magic link via Supabase Auth + Resend for outbound mail |
| Reverse proxy / TLS | Caddy (auto-HTTPS via Let's Encrypt) |
| Image pipeline | Client-side resize to 1024px max + WebP encoding before upload |
| Hosting | User's own server (≥4GB RAM recommended for Supabase stack); fallback PocketBase if RAM-constrained |
| Backups | `pg_dump` cron → Backblaze B2 bucket, off-server |
| Push notifications | Web Push (v1.5) |
| Maps | None in v1; MapLibre + free tiles if added later |
| Monetization | Direct local sponsor banner sold to one Quadra business per slot ($50/mo); no AdSense |

**System sketch:**
```
[Phone PWA] ──HTTPS──▶ [Caddy] ──▶ [Next.js] ─┐
                                              │
                                              ▼
                                    [Supabase stack on same server]
                                              │
                                              ▼
                                  [Postgres + Storage + Realtime]
                                              │
                                              ▼
                                  [Backblaze B2 (nightly backup)]
```

## 6. Data Model

```
users            id, email (unique), display_name, avatar_url, bio,
                 area_id, language, is_local (self-declared bool),
                 created_at, banned_at
                 → derived: rating_avg, rating_count, trades_completed

areas            id, name (e.g. "Quathiaski Cove"), slug, sort_order
                 → seed: Quathiaski Cove, Heriot Bay, Cape Mudge,
                          Granite Bay, We-Wai-Kai, Whaletown
                 → confirm list with user before launch

listings         id, owner_id, type [offer_goods | offer_service | want],
                 title, slug, description, category_id, area_id,
                 wants_text, accepts_credits (bool),
                 status [active | reserved | completed | archived],
                 created_at, expires_at

listing_images   id, listing_id, url, alt_text, sort_order

categories       id, name, slug, icon, sort_order
                 → seed: Food, Crafts, Tools, Clothing, Books, Garden,
                          Outdoor, Services, Other

chats            id, listing_id, initiator_id, owner_id,
                 last_message_at, status

messages         id, chat_id, sender_id, body, created_at

trades           id, chat_id, listing_id, party_a, party_b,
                 outcome [completed | cancelled | disputed],
                 credits_transferred (int, nullable), completed_at

ratings          id, trade_id, rater_id, ratee_id, stars (1-5),
                 comment, created_at
                 → unique(trade_id, rater_id)

credits_ledger   id, user_id, delta (signed int), reason,
                 trade_id, created_at
                 → balance = SUM(delta); append-only

reports          id, reporter_id, target_type [listing|user|message],
                 target_id, reason, status, created_at
```

**Invariants:**
- Trades only exist after both parties tap "Mark trade done" → unlocks rating + credit transfer.
- Credits ledger is append-only — never UPDATE/DELETE rows.
- No GPS coordinates stored. Location is `area_id` only.

## 7. SEO & LLM Discoverability

**Indexable surface:**
- `/` — homepage with island context and live listing preview
- `/l/[id]/[slug]` — permanent listing URLs
- `/c/[category]` — category pages
- `/area/[area]` — area pages (high value for hyper-local search)
- `/u/[handle]` — public profile pages
- `/about`, `/how-it-works`, `/safety`

**Private (`noindex`):** `/chat/*`, `/messages`, `/me`, `/admin`, `/api/*`.

**Mechanisms:**
- Server-side rendering on all public pages (Next.js App Router default).
- JSON-LD structured data: `Product` for goods, `Service` for services, `Offer` for trade terms, `LocalBusiness` for the site itself.
- Auto-generated `sitemap.xml`, regenerated on listing publish.
- `robots.txt` explicitly allows `GPTBot`, `ClaudeBot`, `PerplexityBot`, `Google-Extended`, `Bingbot`; disallows `/api`, `/chat`, `/admin`.
- `/llms.txt` and `/llms-full.txt` describing the marketplace and curated entry points.
- Open Graph + Twitter Card meta on every listing for share previews.
- Required `alt_text` on listing images.
- Title tags and h1s explicitly include "Quadra Island".
- Core Web Vitals budget: LCP < 2.5s, no layout shift; lazy-load images.

## 8. Core User Flows

**Signup (≤30 seconds):**
```
Action requiring login → Enter email → Receive magic link
  → Click link → Pick display name + area → Done
```

**Post a listing (≤45 seconds):**
```
Tap FAB (+) → Choose type [Offer goods | Offer service | Want]
  → Title + photo (auto-resized client-side)
  → Category chip → "What I'd swap for" free text
  → Toggle "Also accept community credits" (off by default) → Publish
```

**Browse → chat → trade → rate:**
```
Scroll feed → Tap listing → "Offer a swap"
  → Pre-filled chat message → realtime negotiation
  → Either party "Mark trade done" → other confirms (or auto after 14d)
  → Rating prompt (optional) → credits ledger entries (if applicable)
```

**Report:**
```
"..." menu → pick reason → submit → moderator queue
  → moderator can warn / hide listing / suspend user
```

**Push opt-in:** prompted after first successful trade, not at signup.

## 9. UI

- Mobile-first PWA, single-column home feed (validated mockup A).
- Listing cards show photo + title + area + listing-type badge (offer / service / wanted).
- Top: search bar + horizontally-scrolling category chips.
- Bottom: 3-tab nav (Home / Chats / Mine). FAB (+) for new listing.
- Color: primary green ~#2c7a4a (island feel), neutral background.

## 10. Trust, Safety, Moderation

- Email magic-link signup; no password.
- 5-star rating after each confirmed trade, one rating per side per trade, cannot rate same person twice within 30 days.
- Public profile shows trade count + average rating + recent reviews.
- Report button on every listing/profile/message → moderator queue.
- Moderator (initially the operator) can hide listings, warn users, suspend accounts.
- Persistent in-app banner on listing detail and onboarding: **"Trade in person on Quadra. Never ship items. Never send money."**
- Rate limits:
  - Max 5 listings/day per user; max 2/day for accounts < 7 days old.
  - Max 1 magic-link request per email per 60 seconds.
  - Escalating cooldowns when reports accumulate.

## 11. Caveats & Risks

**Cost & infrastructure**
1. Email is the auth channel — uses Resend free tier (3k/mo) initially; SPF/DKIM/DMARC required to avoid spam folder.
2. Image storage grows over time — compress aggressively, archive listings idle > 60 days.
3. Off-server backups are mandatory; nightly `pg_dump` to Backblaze B2.
4. Domain registration auto-renewal must be set; lapsed domain = downtime.

**Trust, abuse, moderation**
5. Cold-start problem: launch with 30–50 seed listings recruited offline.
6. Rating manipulation in a small community: ratings only after confirmed trade, public history visible.
7. Scammers targeting tourists: in-app banner reinforces "trade in person, no shipping, no cash".
8. Stale listings: auto-expire after 30 days, owner pinged to renew.
9. Spam / fake accounts: rate-limit posting, basic profanity filter, report button. Email is a weaker abuse signal than phone — rate-limits matter more.
10. Disputes: app explicitly does not mediate; "report bad trade" path flags both users for review.

**Legal & community**
11. Barter is taxable income in Canada (CRA) — never advertise as tax-free; one-line FAQ disclaimer.
12. PIPEDA: privacy policy, "delete my account" button that nukes user rows + anonymizes their listings/ratings.
13. Community pushback: open-source the project, no surveillance/dark patterns, engage local community board pre-launch.
14. Indigenous sensitivity: Quadra is We Wai Kai / We Wai Kum traditional territory — include a brief land acknowledgment on the about page; verify place-name spellings with the Nation.

**Product-shape**
15. Credit inflation/hoarding: don't ship a decay mechanism in v1; observe first.
16. Double-confirm fatigue: auto-confirm "trade done" after 14 days of inactivity if the other party doesn't object.
17. Service listings have no obvious photo: allow category-icon fallback so feed doesn't look broken.
18. iOS PWA limits: web push works only after "Add to Home Screen" on iOS 16.4+; onboarding must guide this; email fallback for users who don't.
19. Ad market on a 3,000-person island is essentially zero — sell direct sponsor banners, not AdSense.
20. Off-season cliff: winter usage will drop; resist panic-feature-building.

**Future-proofing**
21. `users.language` column exists from day one to allow French / Indigenous languages later without migration.
22. v1 chat uses 10-second polling, not WebSockets — ship faster; upgrade to Supabase Realtime in v1.5.

## 12. Phased Rollout

**v0 — Private alpha (2–3 weekends).** Landing page + email waitlist. Recruit 30–50 locals.

**v1 — MVP (4–6 weekends).** Email magic-link auth, profile, post listing, feed + search + chips, 1:1 chat (polling), trade-done + ratings, reports + basic admin, full SEO/LLM scaffolding, backups.

**v1.5 — Polish (2 weekends).** Web push, realtime chat upgrade, 14-day auto-confirm, image archiving.

**v2 — Credits & revenue (3 weekends).** Credits ledger live, sponsor banner slot, optional phone-verified "Verified Local" badge.

**v3 — Optional.** Map view, multi-language, off-island/ferry-buddy mode.

## 13. Cost Estimate

| Item | Monthly |
|---|---|
| Domain (.ca) | ~$1.50 |
| Server | already paid |
| Backblaze B2 backups | $0–2 |
| Email (Resend free tier) | $0 |
| **Total to launch** | **~$2/mo** |

A single $50/mo sponsor banner covers infra ~25× over.

**Effort estimate:** ~50–80 solo hours to a usable v1, spread across 6–8 weekends.

## 14. Open Questions

- Final domain name (suggested: `quadraswap.ca`, `quadrabarter.ca`, `quadratrade.ca` — check availability).
- Confirm areas list with user before seed.
- Confirm category list with user before seed.
- Confirm whether off-island Campbell River users are blocked, soft-warned, or allowed.
- Decide whether to open-source the project (recommended — fits the community ethos).
