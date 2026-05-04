# Quadra Barter

Swap-only marketplace for Quadra Island, BC. No money — neighbours and visitors trade what they have for what they need.

Live at: _(coming soon)_

## What's here

A working v1 of a hyper-local barter site:

- **Listings** — post offers, services, or wanted items with photos. Browse a feed; filter by category or area; deep-link permanent URLs.
- **Public profiles** — `/u/[id]` shows display name, area, listings, rating summary.
- **Chat** — 1:1 conversations between buyer and seller, polled every 5s while the tab is visible.
- **Trade lifecycle** — either party marks a trade done; the other confirms (or cancels). Both can rate each other afterward (1–5 stars + optional comment).
- **Reports + admin** — users flag listings; an env-allowlisted admin moderates at `/admin/reports`.
- **SEO/LLM scaffolding** — JSON-LD on listing detail, dynamic `sitemap.xml`, `robots.txt`, `llms.txt`, Open Graph metadata.

## Stack

- [Next.js 16](https://nextjs.org/) App Router (server actions + RSC), TypeScript, Tailwind v4, shadcn/ui (Zinc/New-York)
- Self-hosted [Supabase](https://supabase.com/) (Postgres + Auth + Storage) via the official `supabase/docker` stack
- [Zod](https://zod.dev/) for input validation
- [Vitest](https://vitest.dev/) (unit) + [Playwright](https://playwright.dev/) (e2e)
- [Mailpit](https://github.com/axllent/mailpit) catches dev SMTP so magic links land at `localhost:8025`
- Production: Caddy reverse proxy, Backblaze B2 backups (planned)

## Quickstart

Requires Docker, Node 20+, pnpm 10+.

```bash
git clone https://github.com/tradingsys01/barter.git
cd barter
pnpm install

# Bring up the Supabase stack (db, auth, storage, kong, mailpit, ...)
cd supabase && docker compose up -d && cd ..

# Apply migrations + seed
for f in supabase/migrations/*.sql; do docker exec -i supabase-db psql -U postgres -d postgres < "$f"; done
docker exec -i supabase-db psql -U postgres -d postgres < supabase/seed.sql

# Configure env
cp .env.example .env.local
# Edit .env.local — set NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY
# from your local Supabase stack (see supabase/.env after first `docker compose up`).

pnpm dev
```

Open http://localhost:3000. Magic-link emails appear at http://localhost:8025.

## Tests

```bash
pnpm test:unit            # Vitest (50 tests)
pnpm test:e2e             # Playwright (12 tests, drives a real browser)
pnpm tsc --noEmit         # type-check
```

## Project layout

```
app/                      # Next.js App Router pages + route handlers
components/               # React components (listings, chat, feed, users, admin)
lib/                      # server actions, queries, validation, helpers
  supabase/               # SSR + browser Supabase clients
  listings/               # listings actions + queries + search
  chat/                   # chat actions + queries
  trade/                  # trade lifecycle actions + queries
  rating/                 # rate trade
  reports/                # report listings/users
  admin/                  # admin auth, queries, moderation actions
supabase/                 # self-hosted Supabase stack
  migrations/             # SQL schema + RLS policies (numbered)
  seed.sql                # reference data (categories, areas)
  docker-compose.override.yml  # local-dev tweaks (Mailpit, rate limits)
docs/superpowers/         # design spec + implementation plans
tests/
  unit/                   # Vitest
  e2e/                    # Playwright
```

## Design + plans

The `docs/superpowers/` directory contains the design spec and the four implementation plans that built this project. Each plan is self-contained TDD tasks.

- [Design spec](docs/superpowers/specs/2026-05-02-quadra-barter-design.md)
- [Plan 1 — Foundation](docs/superpowers/plans/2026-05-02-quadra-barter-foundation.md)
- [Plan 2 — Listings](docs/superpowers/plans/2026-05-03-quadra-barter-listings.md)
- [Plan 3 — Interactions](docs/superpowers/plans/2026-05-03-quadra-barter-interactions.md)
- [Plan 4 — Launch polish](docs/superpowers/plans/2026-05-03-quadra-barter-launch-polish.md)

## License

MIT. See [LICENSE](LICENSE).
