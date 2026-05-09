# Updating production

Operational runbook for deploying new commits to the live instance. For first-time bringup, see `deploy/README.md`.

## Box context (so you don't have to rediscover it)

- Host: `prdr` SSH alias (Contabo VPS, multi-tenant — also runs `asterivo.ca`, `crtoolrental`, `fluencywithkrista*`, `quadravistafarmstay`, `ticketsnow.co.il`, plus MySQL + Java + pm2 apps). Other Next.js services bind 3000/3001/3002.
- Barter is isolated: port **3010**, systemd unit `barter.service`, code at `/opt/barter/repo`, env at `/opt/barter/.env.production` (mode 0600), reverse-proxied at `barter.asterivo.ca` and `api.barter.asterivo.ca` via nginx.
- Supabase docker stack is barter's exclusively (`supabase-db`, `supabase-kong`, `supabase-auth`, etc.). Do **not** touch any non-`supabase-*` container.
- `appuser` has passwordless sudo and is in the `docker` group.
- The working tree at `/opt/barter/repo` always has `M supabase/docker-compose.override.yml` — that's the production override (kong/db bound to 127.0.0.1 + Resend SMTP creds). It's intentionally not in git. **Never lose it; never commit it.**

## Pre-flight (run first, every time)

```bash
ssh prdr 'cd /opt/barter/repo && git fetch origin
echo "=== local working tree ==="; git status --porcelain
echo "=== incoming commits ==="; git log --oneline HEAD..origin/master
echo "=== upstream changes to override file? ==="
git diff --stat HEAD..origin/master -- supabase/docker-compose.override.yml || echo "(none — safe)"
echo "=== new migrations to apply ==="
diff <(ls supabase/migrations) <(git ls-tree --name-only origin/master supabase/migrations | xargs -n1 basename) | grep "^>" || echo "(none)"'
```

Stop and investigate if any of:
- working tree has anything besides `M supabase/docker-compose.override.yml`
- upstream modifies `docker-compose.override.yml` (would clobber prod secrets — manual merge needed)
- you don't recognise the incoming commits

## Code-only update (no new migration)

Most updates. ~1 minute. ~5s downtime during the systemd restart.

```bash
ssh prdr 'cd /opt/barter/repo && set -e
git pull --ff-only origin master
pnpm install --frozen-lockfile
set -a; source /opt/barter/.env.production; set +a
pnpm build
sudo systemctl restart barter
sleep 1
curl -sS -o /dev/null -w "next:%{http_code} %{time_total}s\n" http://127.0.0.1:3010/'
```

Then [smoke](#smoke).

## Update with new migration

The ordering rule depends on the migration:

| Migration shape | Order |
|---|---|
| **Removes** a column/table that old code reads (additive-from-the-old-code's-view) | Code first, then migration. Old code keeps reading it until restart; new code stops reading; migration drops. |
| **Adds** a column/table that new code reads | Migration first, then code. New code finds what it expects; old code is oblivious. |
| Renames or backwards-incompatible | Use the [expand/contract pattern](https://martinfowler.com/bliki/ParallelChange.html). Don't ship as a single migration. |
| Pure data backfill, schema unchanged | Either order; prefer migration after restart (smaller blast radius if rebuild fails). |

Default = column-removal pattern (code first, migration last). The 2026-05-09 `0015_drop_accepts_credits` deploy followed this.

```bash
# 1. Pre-deploy snapshot (only needed if migration loses data)
ssh prdr 'docker exec -i supabase-db pg_dump -U postgres -d postgres \
  -t public.<table> --data-only --inserts --no-owner \
  > /opt/barter/<table>-pre-NNNN-snapshot.sql && \
  ls -la /opt/barter/<table>-pre-NNNN-snapshot.sql'

# 2. Code update (same as Code-only above)
ssh prdr 'cd /opt/barter/repo && set -e
git pull --ff-only origin master
pnpm install --frozen-lockfile
set -a; source /opt/barter/.env.production; set +a
pnpm build
sudo systemctl restart barter
sleep 1
curl -sS -o /dev/null -w "next:%{http_code} %{time_total}s\n" http://127.0.0.1:3010/'

# 3. Apply migration
ssh prdr 'docker exec -i supabase-db psql -U postgres -d postgres \
  < /opt/barter/repo/supabase/migrations/<NNNN_migration>.sql'

# 4. Verify schema
ssh prdr "docker exec -i supabase-db psql -U postgres -d postgres -c '\d public.<table>'"
```

The migration files in this project end with `notify pgrst, 'reload schema';` so PostgREST's schema cache evicts automatically — no Kong/PostgREST restart needed.

## Smoke

Six routes + API + log scan. Anything other than 200/200/200/200/200/200/401 with empty error log = stop and investigate.

```bash
ssh prdr '
LISTING=$(docker exec -i supabase-db psql -U postgres -d postgres -tA <<SQL
select id || '"'"'/'"'"' || slug from public.listings where status='"'"'active'"'"' order by created_at desc limit 1;
SQL
)
for path in / /sitemap.xml /robots.txt /c/services /area/quathiaski-cove /l/$LISTING; do
  printf "%-60s -> " "https://barter.asterivo.ca$path"
  curl -sS -o /dev/null -w "%{http_code}\n" "https://barter.asterivo.ca$path"
done
printf "%-60s -> " "https://api.barter.asterivo.ca/"
curl -sS -o /dev/null -w "%{http_code}\n" "https://api.barter.asterivo.ca/"
echo "--- last 30s errors ---"
sudo journalctl -u barter --since "30 seconds ago" --no-pager | grep -iE "error|500|fatal|panic" || echo "(none)"'
```

## Rollback

| Failure point | Recovery |
|---|---|
| Step 2 build fails | `git reset --hard <prev-sha>` then `pnpm build && sudo systemctl restart barter`. The OLD build is still serving so users see no impact. |
| Step 2 restart fails to reach Ready | `sudo journalctl -u barter -n 100`. If unrecoverable, `git reset --hard <prev-sha>` + rebuild + restart. |
| Step 3 migration fails | Migration files use `if exists` / `if not exists` so re-running is a no-op. If the schema is in a half-state, paste the inverse DDL by hand from the snapshot. |
| Public smoke shows 500s | If migration was the cause: re-add the column from snapshot (`alter table public.<t> add column <c> <type> default <d>;`), then `git reset --hard <prev-sha>` + rebuild + restart. PostgREST will pick up via its 10-second schema poll, or kick it: `docker exec -i supabase-db psql -U postgres -d postgres -c "notify pgrst, 'reload schema';"` |

## Footguns (worth re-reading even if you remember them)

1. **Don't run a bare `pnpm build`.** `NEXT_PUBLIC_*` vars are inlined into the client bundle at build time. If you skip `set -a; source /opt/barter/.env.production; set +a`, the browser bundle has `undefined` Supabase keys and `createBrowserClient` throws *"Your project's URL and API key are required"* on first auth interaction. Browsers may need a hard refresh after fixing.
2. **Don't `git stash drop` or `git checkout -- supabase/docker-compose.override.yml`.** That file is the production override; recreating it is a 10-minute scramble through the deploy guide.
3. **Don't run `docker compose down` in `supabase/`.** It works fine, but it pauses auth/realtime for ~30s and you almost never need it. `docker compose restart <service>` is enough for most config changes.
4. **Multi-tenant box.** Never `pkill -f next` or `pkill node` — you'll kill three other people's apps. Use `sudo systemctl restart barter` and you're scoped to barter only.
5. **Studio (Supabase admin UI) only listens on 127.0.0.1.** Reach it with `ssh -L 54323:127.0.0.1:54323 prdr` and open `http://localhost:54323`. Don't make it public.

## What "everything green" looks like

After a clean update:

- `git log -1` on the prod repo matches `origin/master`
- `cat .next/BUILD_ID` is fresh (changed since last deploy)
- `systemctl is-active barter` → `active`
- All 6 HTTPS routes + API → 200/200/200/200/200/200/401
- `journalctl -u barter --since "5 minutes ago" | grep -iE 'error|500|fatal'` → empty
- (if migration ran) target schema change visible in `\d public.<table>`

Snapshot files (`/opt/barter/*-snapshot.sql`) can be deleted after a few days once you're confident.
