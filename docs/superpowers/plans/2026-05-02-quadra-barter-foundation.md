# Quadra Barter — Foundation (Plan 1 of 4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Next.js + self-hosted Supabase skeleton with email magic-link auth, a public landing page, profile completion, HTTPS-via-Caddy in production, and off-server backups. After this plan, a Quadra resident can land on the site, sign in with email, complete a basic profile, and see a "more coming soon" home page. Subsequent plans add listings, chat/trade, and SEO/admin polish.

**Architecture:** Next.js 15 (App Router) PWA serving as both the public landing page and the authenticated app shell. Self-hosted Supabase (Postgres + GoTrue + PostgREST + Storage + Realtime + Kong gateway) running in Docker on the same server. Caddy in front for automatic HTTPS via Let's Encrypt. Resend used as the SMTP provider so Supabase can send magic-link emails. Backups run as a nightly cron that `pg_dump`s and uploads to Backblaze B2.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind v4, shadcn/ui, Supabase JS v2, Vitest (unit), Playwright (e2e), Docker + docker-compose, Caddy, Backblaze B2, Resend.

---

## File Structure

```
.
├── .env.local                          # local dev secrets (gitignored)
├── .env.example                        # committed template
├── .gitignore                          # already exists
├── next.config.mjs                     # Next.js config
├── package.json
├── pnpm-lock.yaml
├── tailwind.config.ts
├── tsconfig.json
├── playwright.config.ts
├── vitest.config.ts
├── app/
│   ├── layout.tsx                      # root layout, font, html shell
│   ├── page.tsx                        # public landing page (/)
│   ├── globals.css                     # Tailwind base
│   ├── signin/
│   │   └── page.tsx                    # /signin — email input form
│   ├── auth/
│   │   └── callback/
│   │       └── route.ts                # /auth/callback — completes magic-link
│   ├── onboarding/
│   │   └── page.tsx                    # /onboarding — display name + area
│   └── me/
│       └── page.tsx                    # /me — authenticated landing
├── components/
│   ├── ui/                             # shadcn primitives (button, input, …)
│   └── site-header.tsx                 # top bar with sign-in / user
├── lib/
│   ├── supabase/
│   │   ├── client.ts                   # browser supabase client
│   │   ├── server.ts                   # server (RSC + route handler) client
│   │   └── middleware.ts               # session refresh middleware helper
│   └── auth.ts                         # getSessionUser() + requireUser() helpers
├── middleware.ts                       # session refresh on every request
├── tests/
│   ├── unit/
│   │   └── auth.test.ts                # unit tests for lib/auth.ts
│   └── e2e/
│       └── signup.spec.ts              # Playwright happy-path
├── supabase/
│   ├── docker-compose.yml              # adapted from supabase/supabase
│   ├── .env                            # supabase-stack secrets (gitignored)
│   ├── volumes/                        # persistent volumes (gitignored)
│   └── migrations/
│       ├── 0001_users_and_areas.sql    # initial schema + seed
│       └── 0002_rls_policies.sql       # row-level security
├── deploy/
│   ├── Caddyfile                       # reverse proxy + auto-HTTPS
│   └── backup.sh                       # nightly pg_dump → B2 uploader
└── docs/
    └── superpowers/
        ├── specs/2026-05-02-quadra-barter-design.md  # already exists
        └── plans/2026-05-02-quadra-barter-foundation.md  # this plan
```

Each file has one clear purpose. `lib/supabase/` splits browser/server clients because the App Router requires different cookie handling. `lib/auth.ts` centralises "who is the current user?" so individual pages stay thin. Tests live alongside the project root in `tests/` so neither runtime accidentally imports them.

---

## Conventions used in this plan

- **Package manager:** `pnpm`. If you don't have it: `npm i -g pnpm`.
- **Commit style:** Conventional commits (`feat:`, `fix:`, `chore:`, `test:`, `docs:`).
- **One commit per completed task** (after the test passes). Don't batch.
- **All paths relative to the repo root** unless explicitly absolute.
- **TDD:** for every non-scaffolding task, write the failing test first, run it to confirm it fails for the expected reason, implement the minimum, run again to confirm pass, commit.

---

## Task 1: Project scaffold (Next.js 15 + TypeScript + Tailwind)

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.mjs`, `tailwind.config.ts`, `app/layout.tsx`, `app/page.tsx`, `app/globals.css`, `.env.example`, `.gitignore` (update), `README.md`

- [ ] **Step 1: Verify Node toolchain**

```bash
node --version  # expect v20.x or v22.x
pnpm --version  # if missing: npm i -g pnpm
```

If Node is older than 20, install Node 20 LTS first.

- [ ] **Step 2: Run create-next-app non-interactively**

```bash
pnpm dlx create-next-app@latest . \
  --ts --tailwind --eslint --app --src-dir=false \
  --import-alias '@/*' --no-turbopack --use-pnpm
```

Choose "yes" to overwrite the existing `.gitignore` (we'll re-add the `.superpowers/` line in step 4).

- [ ] **Step 3: Verify dev server boots**

```bash
pnpm dev
```

Open http://localhost:3000 — expect the Next.js starter page. Stop the server with Ctrl-C.

- [ ] **Step 4: Update `.gitignore`**

Append:

```
# brainstorm artifacts
.superpowers/

# env
.env.local
.env.production.local
.env

# supabase volumes
supabase/volumes/
supabase/.env

# build output
.next/
node_modules/

# test artifacts
playwright-report/
test-results/
.coverage/
```

- [ ] **Step 5: Create `.env.example`**

```ini
# Public Supabase URL — exposed to the browser
NEXT_PUBLIC_SUPABASE_URL=http://localhost:8000
NEXT_PUBLIC_SUPABASE_ANON_KEY=replace-with-anon-key

# Server-only — never expose to browser
SUPABASE_SERVICE_ROLE_KEY=replace-with-service-role-key

# Site URL used in auth redirects
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

- [ ] **Step 6: Replace `app/page.tsx` with a minimal landing**

```tsx
export default function Page() {
  return (
    <main className="min-h-screen flex items-center justify-center p-8">
      <div className="text-center max-w-xl">
        <h1 className="text-4xl font-semibold mb-3">Quadra Island Barter</h1>
        <p className="text-zinc-600">Swap goods and services on Quadra. No money. No shipping.</p>
        <p className="text-zinc-500 text-sm mt-6">Coming soon.</p>
      </div>
    </main>
  );
}
```

- [ ] **Step 7: Replace `app/layout.tsx` with a clean root layout**

```tsx
import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Quadra Island Barter",
  description: "Swap goods and services on Quadra Island, BC. No money. No shipping.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-white text-zinc-900 antialiased">{children}</body>
    </html>
  );
}
```

- [ ] **Step 8: Reload dev server, smoke test**

```bash
pnpm dev
```

Visit http://localhost:3000. Expect the new landing copy. Stop server.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: scaffold next.js 15 project with tailwind"
```

---

## Task 2: Install shadcn/ui + base components

**Files:**
- Create: `components/ui/button.tsx`, `components/ui/input.tsx`, `components/ui/label.tsx`, `components.json`, `lib/utils.ts`

- [ ] **Step 1: Initialise shadcn**

```bash
pnpm dlx shadcn@latest init -d
```

Accept defaults: New York style, Zinc base color, CSS variables.

- [ ] **Step 2: Install button, input, label**

```bash
pnpm dlx shadcn@latest add button input label
```

Confirm overwrites if prompted.

- [ ] **Step 3: Smoke-test by importing in a throwaway location**

Edit `app/page.tsx` and add at the top:

```tsx
import { Button } from "@/components/ui/button";
```

Replace the inner `<div>` with:

```tsx
<div className="text-center max-w-xl">
  <h1 className="text-4xl font-semibold mb-3">Quadra Island Barter</h1>
  <p className="text-zinc-600">Swap goods and services on Quadra. No money. No shipping.</p>
  <Button className="mt-6">Coming soon</Button>
</div>
```

- [ ] **Step 4: Run dev, verify the button renders styled**

```bash
pnpm dev
```

Visit / — confirm button is dark, rounded. Stop server. Revert step 3's edits (we don't need a button on the landing yet — Task 12 will redo it properly).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add shadcn/ui with button input label primitives"
```

---

## Task 3: Vitest unit-test runner

**Files:**
- Create: `vitest.config.ts`, `tests/unit/sanity.test.ts`
- Modify: `package.json` (add `test:unit` script + dev deps)

- [ ] **Step 1: Install dev dependencies**

```bash
pnpm add -D vitest @vitest/ui @types/node
```

- [ ] **Step 2: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
});
```

- [ ] **Step 3: Add scripts to `package.json`**

In the `"scripts"` block add:

```json
"test:unit": "vitest run",
"test:unit:watch": "vitest"
```

- [ ] **Step 4: Write a sanity test (will fail first)**

`tests/unit/sanity.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { add } from "@/lib/sanity";

describe("sanity", () => {
  it("add(2,3) returns 5", () => {
    expect(add(2, 3)).toBe(5);
  });
});
```

- [ ] **Step 5: Run — should fail (module missing)**

```bash
pnpm test:unit
```

Expected: FAIL with `Cannot find module '@/lib/sanity'` or similar.

- [ ] **Step 6: Implement minimum**

`lib/sanity.ts`:

```ts
export function add(a: number, b: number): number {
  return a + b;
}
```

- [ ] **Step 7: Run — should pass**

```bash
pnpm test:unit
```

Expected: 1 passed.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "test: add vitest with sanity smoke test"
```

---

## Task 4: Playwright e2e runner

**Files:**
- Create: `playwright.config.ts`, `tests/e2e/landing.spec.ts`
- Modify: `package.json` (add `test:e2e` script + dev dep)

- [ ] **Step 1: Install Playwright**

```bash
pnpm add -D @playwright/test
pnpm dlx playwright install --with-deps chromium
```

- [ ] **Step 2: Create `playwright.config.ts`**

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  retries: 0,
  workers: 1,
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
```

- [ ] **Step 3: Add scripts to `package.json`**

```json
"test:e2e": "playwright test",
"test:e2e:ui": "playwright test --ui"
```

- [ ] **Step 4: Write the failing test**

`tests/e2e/landing.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

test("landing page shows headline", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Quadra Island Barter" })).toBeVisible();
  await expect(page.getByText(/no money/i)).toBeVisible();
});
```

- [ ] **Step 5: Run — should pass (landing already exists)**

```bash
pnpm test:e2e
```

Expected: 1 passed.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "test: add playwright with landing-page smoke test"
```

---

## Task 5: Self-hosted Supabase via docker-compose

**Files:**
- Create: `supabase/docker-compose.yml`, `supabase/.env.example`, `supabase/README.md`

This task brings up the Supabase stack on your **local dev machine**. Production deploy comes in Task 13.

- [ ] **Step 1: Install Docker if missing**

```bash
docker --version
docker compose version
```

If either is missing, install Docker Desktop (Mac/Windows) or Docker Engine + compose plugin (Linux). Recommend ≥4GB RAM available to Docker.

- [ ] **Step 2: Pull the official Supabase docker repo into our project**

```bash
mkdir -p supabase && cd supabase
curl -L https://github.com/supabase/supabase/archive/refs/heads/master.tar.gz \
  | tar -xz --strip-components=2 supabase-master/docker
cd ..
```

This drops `docker-compose.yml`, `.env.example`, `volumes/` skeleton, and `dev/`/`reset.sh` into `supabase/`.

- [ ] **Step 3: Copy env template and generate secrets**

```bash
cd supabase
cp .env.example .env

# Generate JWT secret (32+ chars, alphanumeric)
echo "JWT_SECRET=$(openssl rand -base64 32 | tr -d '/+=' | head -c 40)" >> .env

# Generate dashboard / Postgres / vault passwords
sed -i.bak "s|POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(openssl rand -hex 16)|" .env
sed -i.bak "s|DASHBOARD_PASSWORD=.*|DASHBOARD_PASSWORD=$(openssl rand -hex 16)|" .env
rm -f .env.bak
cd ..
```

You will also need to compute the `ANON_KEY` and `SERVICE_ROLE_KEY` JWTs. Use https://supabase.com/docs/guides/self-hosting#api-keys — paste the JWT_SECRET, copy the two generated tokens into `supabase/.env`.

(If that's too fiddly, the simpler shortcut is to keep the example keys from `.env.example` for the local-dev stack only — they are well-known and only safe for local. Replace them on the production server in Task 13.)

- [ ] **Step 4: Boot the stack**

```bash
cd supabase
docker compose up -d
docker compose ps
cd ..
```

Expect all services `running` or `healthy`. Wait ~60s on first boot.

- [ ] **Step 5: Verify**

Visit http://localhost:8000 — expect a Supabase Studio login. Use `supabase` / your `DASHBOARD_PASSWORD`.

Visit http://localhost:8000/project/default/api — confirm anon + service-role JWTs are listed.

- [ ] **Step 6: Wire the keys into the Next.js app**

Create `.env.local` in repo root:

```ini
NEXT_PUBLIC_SUPABASE_URL=http://localhost:8000
NEXT_PUBLIC_SUPABASE_ANON_KEY=<paste anon key>
SUPABASE_SERVICE_ROLE_KEY=<paste service role key>
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

- [ ] **Step 7: Smoke-test from a Node REPL**

```bash
node -e "
const u = process.env;
fetch(\`\${u.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/\`, {
  headers: { apikey: u.NEXT_PUBLIC_SUPABASE_ANON_KEY }
}).then(r => console.log('status:', r.status));
" 2>/dev/null

# easier: use dotenv-cli
pnpm dlx dotenv-cli -- node -e "fetch(\`\${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/\`, {headers:{apikey:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}}).then(r=>console.log(r.status))"
```

Expected: `200`.

- [ ] **Step 8: Document teardown**

Create `supabase/README.md`:

```markdown
# Local Supabase stack

## Start
    cd supabase && docker compose up -d

## Stop
    cd supabase && docker compose down

## Wipe (destroys all local data)
    cd supabase && docker compose down -v && rm -rf volumes/db/data
```

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: self-hosted supabase stack via docker-compose"
```

---

## Task 6: Initial database schema (`users`, `areas`)

**Files:**
- Create: `supabase/migrations/0001_users_and_areas.sql`, `supabase/migrations/0002_rls_policies.sql`, `supabase/seed.sql`

Supabase manages schema via SQL files in `supabase/migrations/`. We apply them by piping to `psql` inside the running Postgres container — simple and explicit, no extra CLI dependency.

- [ ] **Step 1: Write the first migration**

`supabase/migrations/0001_users_and_areas.sql`:

```sql
-- Quadra Barter: initial users + areas tables.

create extension if not exists "pgcrypto";

create table public.areas (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now()
);

create table public.users (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text not null unique,
  display_name  text,
  avatar_url    text,
  bio           text,
  area_id       uuid references public.areas(id) on delete set null,
  language      text not null default 'en',
  is_local      boolean not null default false,
  created_at    timestamptz not null default now(),
  banned_at     timestamptz
);

create index users_area_idx on public.users(area_id);
```

- [ ] **Step 2: Write the seed file**

`supabase/seed.sql`:

```sql
insert into public.areas (slug, name, sort_order) values
  ('quathiaski-cove', 'Quathiaski Cove', 10),
  ('heriot-bay',      'Heriot Bay',       20),
  ('cape-mudge',      'Cape Mudge',       30),
  ('granite-bay',     'Granite Bay',      40),
  ('we-wai-kai',      'We Wai Kai',       50),
  ('whaletown',       'Whaletown',        60)
on conflict (slug) do nothing;
```

- [ ] **Step 3: Write the RLS policies**

`supabase/migrations/0002_rls_policies.sql`:

```sql
-- Row-level security so the anon key can't read everything.

alter table public.users enable row level security;
alter table public.areas enable row level security;

-- Areas are public reference data.
create policy "areas readable by anyone"
  on public.areas for select using (true);

-- A user row is readable by anyone (public profile pages); the email
-- column is hidden via the public.profiles view we'll add when the
-- profile feature ships. For v1 foundation we keep email exposed only
-- to the user themselves.
create policy "users self-read"
  on public.users for select using (auth.uid() = id);

create policy "users self-insert"
  on public.users for insert with check (auth.uid() = id);

create policy "users self-update"
  on public.users for update using (auth.uid() = id) with check (auth.uid() = id);
```

- [ ] **Step 4: Apply migrations + seed against the running stack**

```bash
PG=supabase-db
docker exec -i $PG psql -U postgres -d postgres < supabase/migrations/0001_users_and_areas.sql
docker exec -i $PG psql -U postgres -d postgres < supabase/migrations/0002_rls_policies.sql
docker exec -i $PG psql -U postgres -d postgres < supabase/seed.sql
```

(If the container name is different, find it with `docker ps | grep supabase`.)

- [ ] **Step 5: Verify**

```bash
docker exec -i supabase-db psql -U postgres -d postgres -c "select count(*) from public.areas;"
```

Expected: `6`.

- [ ] **Step 6: Add a `db:apply` helper script**

In `package.json` `"scripts"`:

```json
"db:apply": "for f in supabase/migrations/*.sql; do docker exec -i supabase-db psql -U postgres -d postgres < $f; done && docker exec -i supabase-db psql -U postgres -d postgres < supabase/seed.sql"
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(db): users + areas tables with RLS and seed"
```

---

## Task 7: Supabase client wrappers (browser + server)

**Files:**
- Create: `lib/supabase/client.ts`, `lib/supabase/server.ts`, `lib/supabase/middleware.ts`, `middleware.ts`
- Modify: `package.json` (add `@supabase/ssr`, `@supabase/supabase-js`)

- [ ] **Step 1: Install deps**

```bash
pnpm add @supabase/ssr @supabase/supabase-js
```

- [ ] **Step 2: Browser client**

`lib/supabase/client.ts`:

```ts
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

- [ ] **Step 3: Server client**

`lib/supabase/server.ts`:

```ts
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(items) {
          try {
            items.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // RSCs cannot set cookies; middleware handles refresh.
          }
        },
      },
    }
  );
}
```

- [ ] **Step 4: Middleware refresh helper**

`lib/supabase/middleware.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(items) {
          items.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          items.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    }
  );
  await supabase.auth.getUser();
  return response;
}
```

`middleware.ts` (repo root):

```ts
import { updateSession } from "@/lib/supabase/middleware";
import type { NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
```

- [ ] **Step 5: Add `lib/auth.ts` with helpers**

```ts
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function getSessionUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function requireUser() {
  const user = await getSessionUser();
  if (!user) redirect("/signin");
  return user;
}
```

- [ ] **Step 6: Boot dev — confirm no runtime errors**

```bash
pnpm dev
```

Visit / — expect landing renders, no console errors. Stop server.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(auth): supabase ssr clients + session middleware"
```

---

## Task 8: Sign-in page (email magic link)

**Files:**
- Create: `app/signin/page.tsx`
- Test: `tests/unit/signin-form.test.ts` (light, just validates the form action exists)

- [ ] **Step 1: Write the failing e2e test**

`tests/e2e/signin-render.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

test("signin page renders email form", async ({ page }) => {
  await page.goto("/signin");
  await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible();
  await expect(page.getByLabel(/email/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /send link/i })).toBeVisible();
});
```

- [ ] **Step 2: Run — should fail (404)**

```bash
pnpm test:e2e tests/e2e/signin-render.spec.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement the page (server action + form)**

`app/signin/page.tsx`:

```tsx
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function SignInPage({
  searchParams,
}: { searchParams: Promise<{ sent?: string; error?: string }> }) {
  async function send(formData: FormData) {
    "use server";
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    if (!email) return;
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`,
      },
    });
    const { redirect } = await import("next/navigation");
    redirect(error ? `/signin?error=1` : `/signin?sent=1`);
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold mb-2">Sign in</h1>
        <p className="text-sm text-zinc-600 mb-6">
          We'll email you a one-tap link. No password.
        </p>
        <SignInResolver searchParams={searchParams} />
        <form action={send} className="space-y-3">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" name="email" required autoComplete="email" />
          </div>
          <Button type="submit" className="w-full">Send link</Button>
        </form>
      </div>
    </main>
  );
}

async function SignInResolver({
  searchParams,
}: { searchParams: Promise<{ sent?: string; error?: string }> }) {
  const params = await searchParams;
  if (params.sent) {
    return (
      <div className="rounded border border-green-200 bg-green-50 text-green-800 p-3 text-sm mb-4">
        Check your inbox (and spam folder) for the sign-in link.
      </div>
    );
  }
  if (params.error) {
    return (
      <div className="rounded border border-red-200 bg-red-50 text-red-800 p-3 text-sm mb-4">
        Something went wrong sending the link. Try again in a minute.
      </div>
    );
  }
  return null;
}
```

- [ ] **Step 4: Run e2e — should pass**

```bash
pnpm test:e2e tests/e2e/signin-render.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(auth): /signin email magic-link form"
```

---

## Task 9: Auth callback route

**Files:**
- Create: `app/auth/callback/route.ts`

- [ ] **Step 1: Implement the callback handler**

`app/auth/callback/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/me";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }
  return NextResponse.redirect(`${origin}/signin?error=1`);
}
```

- [ ] **Step 2: Configure Supabase Auth → Site URL + redirect allow-list**

Open Supabase Studio → Auth → URL Configuration. Set:
- Site URL: `http://localhost:3000`
- Additional Redirect URLs: `http://localhost:3000/auth/callback`

- [ ] **Step 3: Manual smoke test**

For now, Supabase will write the magic-link to the **inbucket** mock-mail container that ships with the docker-compose. Visit http://localhost:9000 — that's inbucket. Send yourself a sign-in from `/signin`, click the link in inbucket, expect to land on `/me` (which doesn't exist yet — Task 11).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(auth): /auth/callback exchange-code-for-session"
```

---

## Task 10: Profile completion (onboarding) gate

**Files:**
- Create: `app/onboarding/page.tsx`
- Modify: `lib/auth.ts` to add `requireCompleteProfile()`

- [ ] **Step 1: Add `requireCompleteProfile`**

Edit `lib/auth.ts` — append:

```ts
import { createClient } from "@/lib/supabase/server";

export async function getProfile(userId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("users")
    .select("id, display_name, area_id")
    .eq("id", userId)
    .maybeSingle();
  return data;
}

export async function requireCompleteProfile() {
  const user = await requireUser();
  const profile = await getProfile(user.id);
  if (!profile?.display_name || !profile.area_id) {
    redirect("/onboarding");
  }
  return { user, profile };
}
```

(Leave the existing `requireUser()` import; just consolidate so the file ends up with one set of imports.)

- [ ] **Step 2: Write the failing unit test**

`tests/unit/auth.test.ts`:

```ts
import { describe, it, expect } from "vitest";

// We're not unit-testing the redirect here — that requires next/navigation mocks
// and adds complexity. Instead, lock in the shape of getProfile's null path.
import { getProfile } from "@/lib/auth";

describe("getProfile", () => {
  it("returns null for an unknown user id", async () => {
    const profile = await getProfile("00000000-0000-0000-0000-000000000000");
    expect(profile).toBeNull();
  });
});
```

- [ ] **Step 3: Run unit tests**

```bash
pnpm test:unit
```

Expected: PASS (Supabase running locally + RLS lets us read with anon for that id, returns null since no row exists).

If it fails because Vitest can't see env vars, prepend `dotenv-cli`:

In `package.json` `"scripts"`:

```json
"test:unit": "dotenv -e .env.local -- vitest run"
```

Install `dotenv-cli`: `pnpm add -D dotenv-cli`. Re-run.

- [ ] **Step 4: Implement the onboarding page**

`app/onboarding/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default async function OnboardingPage() {
  const user = await requireUser();
  const supabase = await createClient();
  const { data: areas } = await supabase
    .from("areas")
    .select("id, name")
    .order("sort_order");

  async function save(formData: FormData) {
    "use server";
    const display_name = String(formData.get("display_name") ?? "").trim();
    const area_id = String(formData.get("area_id") ?? "");
    if (!display_name || !area_id) return;

    const supabase = await createClient();
    await supabase.from("users").upsert({
      id: user.id,
      email: user.email!,
      display_name,
      area_id,
    });
    redirect("/me");
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <form action={save} className="w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-semibold">Welcome</h1>
        <p className="text-sm text-zinc-600">A couple of details and you're in.</p>

        <div>
          <Label htmlFor="display_name">Display name</Label>
          <Input id="display_name" name="display_name" required maxLength={40} />
        </div>

        <div>
          <Label htmlFor="area_id">Area on Quadra</Label>
          <select
            id="area_id"
            name="area_id"
            required
            className="flex h-9 w-full rounded-md border border-zinc-200 bg-white px-3 py-1 text-sm"
          >
            <option value="">Choose…</option>
            {areas?.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>

        <Button type="submit" className="w-full">Continue</Button>
      </form>
    </main>
  );
}
```

- [ ] **Step 5: Manual smoke test**

`pnpm dev` → sign in via inbucket → expect `/auth/callback` → `/me` → middleware/page redirects you to `/onboarding` (once Task 11 page exists; for now /me 404s — that's next).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(auth): /onboarding profile completion (display_name + area)"
```

---

## Task 11: `/me` authenticated page + sign-out

**Files:**
- Create: `app/me/page.tsx`, `components/sign-out-button.tsx`

- [ ] **Step 1: Sign-out button (client component)**

`components/sign-out-button.tsx`:

```tsx
"use client";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export function SignOutButton() {
  const router = useRouter();
  return (
    <Button
      variant="outline"
      onClick={async () => {
        const supabase = createClient();
        await supabase.auth.signOut();
        router.push("/");
        router.refresh();
      }}
    >
      Sign out
    </Button>
  );
}
```

- [ ] **Step 2: `/me` page — uses requireCompleteProfile**

`app/me/page.tsx`:

```tsx
import { requireCompleteProfile } from "@/lib/auth";
import { SignOutButton } from "@/components/sign-out-button";

export default async function MePage() {
  const { user, profile } = await requireCompleteProfile();
  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-semibold">Hi {profile.display_name}</h1>
        <p className="text-sm text-zinc-600">Signed in as {user.email}.</p>
        <p className="text-sm text-zinc-500">
          Listings, chat, and ratings are coming next. For now, you're set up.
        </p>
        <SignOutButton />
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Write happy-path e2e covering signup → onboarding → /me**

`tests/e2e/signup.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

test("magic-link signup flow lands on /onboarding then /me", async ({ page, request }) => {
  const email = `quadra-test-${Date.now()}@example.com`;

  // Step 1: request magic link
  await page.goto("/signin");
  await page.getByLabel(/email/i).fill(email);
  await page.getByRole("button", { name: /send link/i }).click();
  await expect(page.getByText(/check your inbox/i)).toBeVisible();

  // Step 2: fetch the magic link from inbucket
  const inboxRes = await request.get(`http://localhost:9000/api/v1/mailbox/${encodeURIComponent(email)}`);
  expect(inboxRes.ok()).toBeTruthy();
  const messages = await inboxRes.json();
  expect(messages.length).toBeGreaterThan(0);

  const msgId = messages[0].id;
  const msgRes = await request.get(
    `http://localhost:9000/api/v1/mailbox/${encodeURIComponent(email)}/${msgId}`
  );
  const msg = await msgRes.json();
  const linkMatch = String(msg.body.text).match(/https?:\/\/\S+/);
  expect(linkMatch).not.toBeNull();
  const link = linkMatch![0];

  // Step 3: click the link → callback → /onboarding
  await page.goto(link);
  await expect(page).toHaveURL(/\/onboarding/);

  // Step 4: complete onboarding
  await page.getByLabel(/display name/i).fill("Test User");
  await page.locator("select#area_id").selectOption({ label: "Quathiaski Cove" });
  await page.getByRole("button", { name: /continue/i }).click();

  // Step 5: lands on /me
  await expect(page).toHaveURL(/\/me/);
  await expect(page.getByText(/hi test user/i)).toBeVisible();
});
```

- [ ] **Step 4: Run e2e**

Make sure local stack is up:

```bash
cd supabase && docker compose up -d && cd ..
pnpm test:e2e tests/e2e/signup.spec.ts
```

Expected: PASS.

If inbucket lives on a different port in your stack, adjust the URL. Check `docker compose ps` for the `inbucket` service mapping.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(auth): /me + signout + happy-path e2e"
```

---

## Task 12: Polish public landing page

**Files:**
- Modify: `app/page.tsx`, `components/site-header.tsx` (new)

- [ ] **Step 1: Create `components/site-header.tsx`**

```tsx
import Link from "next/link";
import { getSessionUser } from "@/lib/auth";

export async function SiteHeader() {
  const user = await getSessionUser();
  return (
    <header className="border-b border-zinc-200">
      <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/" className="font-semibold">Quadra Barter</Link>
        <nav className="text-sm">
          {user ? (
            <Link href="/me" className="text-zinc-700 hover:underline">My account</Link>
          ) : (
            <Link href="/signin" className="text-zinc-700 hover:underline">Sign in</Link>
          )}
        </nav>
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Modify `app/layout.tsx` to include the header**

Wrap children:

```tsx
import { SiteHeader } from "@/components/site-header";
// ...
return (
  <html lang="en">
    <body className="bg-white text-zinc-900 antialiased">
      <SiteHeader />
      {children}
    </body>
  </html>
);
```

- [ ] **Step 3: Replace `app/page.tsx` with a real landing**

```tsx
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Page() {
  return (
    <main className="max-w-3xl mx-auto px-4 py-16">
      <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight">
        Swap goods and services on Quadra Island.
      </h1>
      <p className="mt-4 text-lg text-zinc-600">
        No money. No shipping. Just neighbours and visitors trading what they have for what they need.
      </p>
      <div className="mt-8 flex gap-3">
        <Link href="/signin"><Button>Get started</Button></Link>
      </div>
      <p className="mt-12 text-sm text-zinc-500">
        Listings, chat, and ratings are coming next. Sign in now to be ready when we launch.
      </p>
    </main>
  );
}
```

- [ ] **Step 4: Update the existing landing test (it should still pass)**

`tests/e2e/landing.spec.ts` — change the "no money" assertion to be more lenient:

```ts
await expect(page.getByText(/no money/i)).toBeVisible();
```

(already in place — confirm it still passes).

- [ ] **Step 5: Run all e2e**

```bash
pnpm test:e2e
```

Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(ui): real landing page + site header"
```

---

## Task 13: Production deploy (Caddy + Docker on your server)

**Files:**
- Create: `deploy/Caddyfile`, `deploy/README.md`

- [ ] **Step 1: Provision the server (one-time)**

On your server (replace `barter.example.ca` with your real domain):

```bash
# system deps
sudo apt update
sudo apt install -y docker.io docker-compose-plugin caddy
sudo usermod -aG docker $USER  # log out / back in

# DNS: point barter.example.ca A-record at the server's IP before continuing.
```

- [ ] **Step 2: Clone the repo on the server**

```bash
git clone <your-git-remote> /opt/barter
cd /opt/barter
```

- [ ] **Step 3: Bring up Supabase on the server**

```bash
cp supabase/.env.example supabase/.env
# regenerate ALL secrets — never reuse local-dev values:
sed -i "s|JWT_SECRET=.*|JWT_SECRET=$(openssl rand -base64 32 | tr -d '/+=' | head -c 40)|" supabase/.env
sed -i "s|POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(openssl rand -hex 16)|" supabase/.env
sed -i "s|DASHBOARD_PASSWORD=.*|DASHBOARD_PASSWORD=$(openssl rand -hex 32)|" supabase/.env

# generate ANON + SERVICE_ROLE JWTs from JWT_SECRET — use
# https://supabase.com/docs/guides/self-hosting#api-keys and paste them in.

cd supabase && docker compose up -d && cd ..
pnpm db:apply  # apply migrations + seed
```

- [ ] **Step 4: Configure Resend SMTP for outbound mail**

Sign up at https://resend.com (free tier). Verify a sender domain (e.g. `mail.barter.example.ca`) — set DNS records they provide (SPF, DKIM, DMARC).

In Supabase Studio → Project Settings → Auth → SMTP Settings:
- Sender: `Quadra Barter <noreply@mail.barter.example.ca>`
- Host: `smtp.resend.com`
- Port: `465`
- Username: `resend`
- Password: (your Resend API key)
- Min interval: 60s

- [ ] **Step 5: Build and run Next.js**

```bash
pnpm install --frozen-lockfile
pnpm build
# run as a systemd service so it survives reboot
sudo tee /etc/systemd/system/barter.service > /dev/null <<'EOF'
[Unit]
Description=Quadra Barter Next.js
After=network.target

[Service]
WorkingDirectory=/opt/barter
EnvironmentFile=/opt/barter/.env.production
ExecStart=/usr/bin/pnpm start -- -p 3000
Restart=always
User=$USER

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable --now barter
```

Create `/opt/barter/.env.production`:

```ini
NEXT_PUBLIC_SUPABASE_URL=https://api.barter.example.ca
NEXT_PUBLIC_SUPABASE_ANON_KEY=<production anon key>
SUPABASE_SERVICE_ROLE_KEY=<production service role key>
NEXT_PUBLIC_SITE_URL=https://barter.example.ca
```

- [ ] **Step 6: Caddyfile**

`deploy/Caddyfile` (copied to `/etc/caddy/Caddyfile`):

```
barter.example.ca {
    encode gzip zstd
    reverse_proxy 127.0.0.1:3000
}

api.barter.example.ca {
    encode gzip zstd
    reverse_proxy 127.0.0.1:8000
}
```

```bash
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

- [ ] **Step 7: Update Supabase Auth redirect allow-list**

In Supabase Studio → Auth → URL Configuration:
- Site URL: `https://barter.example.ca`
- Additional Redirect URLs: `https://barter.example.ca/auth/callback`

- [ ] **Step 8: Smoke-test production**

Visit `https://barter.example.ca`. Sign up with a real email. Click the magic link from your inbox (Resend should deliver). Land on `/onboarding`, complete, end on `/me`.

- [ ] **Step 9: Commit deploy assets**

```bash
git add deploy/
git commit -m "chore(deploy): caddyfile + production deploy notes"
git push
```

---

## Task 14: Off-server backups (nightly pg_dump → Backblaze B2)

**Files:**
- Create: `deploy/backup.sh`

- [ ] **Step 1: Create a Backblaze B2 bucket + application key**

In B2 console: create a bucket `barter-backups`, private. Create an app key scoped to that bucket. Note the keyID and applicationKey.

- [ ] **Step 2: Install `rclone` on the server**

```bash
sudo apt install -y rclone
rclone config
```

In `rclone config` interactive:
- New remote → name `b2` → type `b2` → enter keyID + applicationKey → defaults for the rest.

- [ ] **Step 3: Write the backup script**

`deploy/backup.sh`:

```bash
#!/usr/bin/env bash
# Nightly off-server backup of the Supabase Postgres database.
set -euo pipefail

STAMP=$(date -u +%Y%m%dT%H%M%SZ)
OUT="/tmp/barter-${STAMP}.sql.gz"

docker exec supabase-db pg_dump -U postgres -d postgres \
  --no-owner --no-privileges \
  | gzip -9 > "$OUT"

rclone copy "$OUT" b2:barter-backups/ --b2-hard-delete

# keep last 30 days locally; B2 lifecycle handles long-term
find /tmp -maxdepth 1 -name 'barter-*.sql.gz' -mtime +1 -delete

echo "backup ok: $OUT"
```

```bash
chmod +x deploy/backup.sh
```

- [ ] **Step 4: Add cron entry on the server**

```bash
sudo crontab -e
# add:
15 3 * * *  /opt/barter/deploy/backup.sh >> /var/log/barter-backup.log 2>&1
```

- [ ] **Step 5: Run it once manually + verify**

```bash
sudo /opt/barter/deploy/backup.sh
rclone ls b2:barter-backups/
```

Expected: a fresh `.sql.gz` file listed.

- [ ] **Step 6: Configure B2 lifecycle (one-time)**

In B2 console → bucket → Lifecycle Settings → "Keep last version for 30 days, then delete." Adjust to your retention preference.

- [ ] **Step 7: Test restore on a scratch container** (mandatory — backups you've never restored aren't backups)

```bash
docker run --rm -d --name scratch-pg -e POSTGRES_PASSWORD=x -p 55432:5432 postgres:16
sleep 5
LATEST=$(rclone lsf b2:barter-backups/ | sort | tail -1)
rclone copy b2:barter-backups/${LATEST} /tmp/
gunzip -c /tmp/${LATEST} | docker exec -i scratch-pg psql -U postgres -d postgres
docker exec -i scratch-pg psql -U postgres -d postgres -c "select count(*) from public.areas;"
docker stop scratch-pg
```

Expected: `6` areas restored.

- [ ] **Step 8: Commit**

```bash
git add deploy/
git commit -m "chore(deploy): nightly pg_dump backups to backblaze b2"
git push
```

---

## Wrap-up checklist

After all 14 tasks:

- [ ] `pnpm test:unit` — all green
- [ ] `pnpm test:e2e` — all green (local stack running)
- [ ] Production: sign-up via real email lands on `/me`
- [ ] One backup file exists in B2 and a scratch restore succeeded
- [ ] `git log --oneline` shows one commit per task

Tag the milestone:

```bash
git tag -a v0.1-foundation -m "Foundation: auth + landing + deploy + backups"
git push --tags
```

---

## Spec ↔ Plan coverage

| Spec section | Covered by |
|---|---|
| Stack & architecture | Tasks 1, 2, 5, 7, 13 |
| `users` + `areas` data model | Task 6 |
| Email magic-link auth | Tasks 8, 9, 10 |
| SSR + middleware | Task 7 |
| Public landing page | Tasks 1, 12 |
| Caddy + HTTPS | Task 13 |
| Off-server backups | Task 14 |
| Listings, chat, ratings, credits, reports | **Plan 2 / 3 / 4** (out of scope here) |
| SEO/LLM scaffolding (sitemap, robots, llms.txt, JSON-LD) | **Plan 4** (out of scope here) |
| Push, Realtime upgrade, credits, sponsor banner | **Plan 5+ (post-v1)** |

This plan ships a deployed, HTTPS, backed-up Quadra Barter site on which a real user can sign up, complete onboarding, and arrive on a "more coming soon" landing — the foundation every later plan builds on.
