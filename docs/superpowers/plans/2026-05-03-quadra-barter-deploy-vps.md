# Quadra Barter — Production Deploy Plan (shared VPS)

> **For: an operator with sudo on a shared VPS at 167.86.77.166. Other applications may already be running. This plan minimizes blast radius, isolates Quadra Barter to its own subtree (`/opt/barter`) and its own systemd unit, uses high (non-default) ports for Supabase internals, and only touches the public 80/443 surface via the existing reverse proxy.**

**Goal:** Bring up `https://barter.asterivo.ca` (UI) + `https://api.barter.asterivo.ca` (Supabase Kong) on this server without disturbing anything else running on it.

**Server access:** SSH as `prdr@167.86.77.166`, then `sudo su -` for root. Most steps run as root; the systemd unit runs as `prdr`.

**Tech assumptions:** Ubuntu 20.04 (per SSH banner), Docker + docker-compose-plugin available (will verify in Phase 0).

**External dependencies confirmed by user:**
- DNS: `barter.asterivo.ca` and `api.barter.asterivo.ca` already point at 167.86.77.166 ✓
- Resend domain `barter.asterivo.ca` verified, API key in hand ✓
- B2 backups deferred to a follow-up plan ⏳

---

## Guiding principles

1. **Read before you write.** Phase 0 is pure discovery — every command is read-only. Stop and re-plan if conflicts surface.
2. **Isolate.** All Quadra Barter files live under `/opt/barter`. The systemd unit is named `barter.service`. No global config files are mutated except the existing reverse proxy's site config (additive).
3. **Reversible.** Each phase has an explicit rollback. We don't move forward if rollback isn't documented.
4. **Don't fight what's there.** If a reverse proxy is already running on 80/443, we add a vhost; we do NOT install a parallel proxy or steal the ports.
5. **Confirm before destructive ops.** Anything that restarts/stops a service shared with other apps gets explicit operator confirmation.

---

## Phase 0 — Discovery (read-only, ~5 min)

Goal: understand what's already on the box so the rest of the plan can adapt.

```bash
# As root
sudo su -

# 0.1 — OS + arch
cat /etc/os-release
uname -a

# 0.2 — Disk + memory
df -h /
free -h

# 0.3 — Docker present? what version?
which docker && docker --version
docker compose version 2>&1 | head -1

# 0.4 — What containers are already running?
docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Ports}}\t{{.Status}}"

# 0.5 — Listening ports (which apps own them?)
ss -tlnp | sort -k4

# 0.6 — Reverse proxy in front of 80/443?
systemctl --no-pager status caddy 2>/dev/null | head -5
systemctl --no-pager status nginx 2>/dev/null | head -5
systemctl --no-pager status apache2 2>/dev/null | head -5
systemctl --no-pager status traefik 2>/dev/null | head -5

# 0.7 — Existing systemd units that look like apps
systemctl list-units --type=service --state=running --no-pager | grep -vE '(systemd|cron|ssh|networkd|resolved|udev|dbus|polkit|rsyslog|getty|snapd|unattended|rpcbind|openvpn|fail2ban)' | head -30

# 0.8 — Existing users with home dirs
getent passwd | awk -F: '$3 >= 1000 && $3 < 65000 { print $1, $6 }'

# 0.9 — Mountpoints with serious disk
df -h | grep -vE '^(tmpfs|devtmpfs|udev)' | sort -k2 -h

# 0.10 — Any existing /opt/barter? (sanity)
ls -la /opt/barter 2>/dev/null || echo "no /opt/barter — clean"
```

**Decisions that depend on Phase 0 output:**

| If… | Then… |
|---|---|
| Caddy is already running | Add a `/etc/caddy/sites-enabled/barter.caddy` snippet, reload Caddy. Do NOT install a second Caddy. |
| nginx is already running | Add `/etc/nginx/sites-available/barter` + symlink + reload. Do NOT install Caddy. |
| No reverse proxy | Install Caddy fresh and own 80/443. Document the change. |
| Port 5432 is in use | Override `supabase-db` to publish only on `127.0.0.1:54322` (private to host). |
| Port 8000 is in use | Override Kong to publish only on `127.0.0.1:54321`. Reverse proxy hits localhost:54321. |
| `prdr` is not in `docker` group | `usermod -aG docker prdr`, log out + back in. |
| Disk free < 15 GB at `/` | Move the deploy to a larger mount (e.g. `/data/barter`); update systemd unit `WorkingDirectory`. |
| Docker not installed | Install via official apt repo (extra confirmation needed; affects whole-server). |

**Stop here, dump the Phase 0 results, and revise the plan before proceeding.**

---

## Phase 1 — Pre-flight (no service changes)

```bash
# 1.1 — Create the install directory owned by prdr
sudo install -d -o prdr -g prdr /opt/barter

# 1.2 — Clone the repo
sudo -u prdr git clone https://github.com/tradingsys01/barter.git /opt/barter
cd /opt/barter

# 1.3 — Install Node 20 if not present
which node || curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
which node || sudo apt install -y nodejs
node --version  # expect v20.x

# 1.4 — Install pnpm if not present
which pnpm || sudo npm install -g pnpm@10

# 1.5 — Install JS deps as prdr (read-only on system)
sudo -u prdr -i bash -c 'cd /opt/barter && pnpm install --frozen-lockfile'
```

Rollback: `rm -rf /opt/barter` (no system services touched yet).

---

## Phase 2 — Configure Supabase stack with port isolation

Supabase docker-compose uses many host ports by default (8000 for Kong, 5432 for db, 4000 for analytics, etc.). To avoid conflicts on a shared server, we **only publish two ports to the loopback interface**, and let the reverse proxy bridge them:

- `127.0.0.1:54321` → Supabase Kong (the only public-bound port)
- `127.0.0.1:54322` → Postgres (only for our pg_dump backups)

Everything else stays inside the docker network.

```bash
# 2.1 — Generate fresh production secrets (NEVER reuse local-dev demo keys)
cd /opt/barter
sudo -u prdr cp supabase/.env.example supabase/.env

# Postgres + dashboard passwords (random)
PG_PASSWORD=$(openssl rand -hex 24)
DASH_PASSWORD=$(openssl rand -hex 24)
JWT_SECRET=$(openssl rand -base64 48 | tr -d '/+=' | head -c 64)

sudo -u prdr sed -i \
  -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$PG_PASSWORD|" \
  -e "s|^DASHBOARD_PASSWORD=.*|DASHBOARD_PASSWORD=$DASH_PASSWORD|" \
  -e "s|^JWT_SECRET=.*|JWT_SECRET=$JWT_SECRET|" \
  -e "s|^SITE_URL=.*|SITE_URL=https://barter.asterivo.ca|" \
  -e "s|^API_EXTERNAL_URL=.*|API_EXTERNAL_URL=https://api.barter.asterivo.ca|" \
  -e "s|^ADDITIONAL_REDIRECT_URLS=.*|ADDITIONAL_REDIRECT_URLS=https://barter.asterivo.ca/auth/callback|" \
  supabase/.env

# 2.2 — Generate ANON_KEY and SERVICE_ROLE_KEY JWTs from JWT_SECRET
# (We'll use a small Node script — Supabase doesn't ship a CLI for this offline.)
sudo -u prdr -i bash <<'GEN'
cd /opt/barter
node -e '
const jwt = require("jsonwebtoken");
const fs = require("fs");
const env = fs.readFileSync("supabase/.env", "utf8");
const secret = env.match(/^JWT_SECRET=(.+)$/m)[1];
const iat = Math.floor(Date.now() / 1000);
const exp = iat + (60 * 60 * 24 * 365 * 10); // 10 years
const anon = jwt.sign({ role: "anon", iss: "supabase", iat, exp }, secret);
const service = jwt.sign({ role: "service_role", iss: "supabase", iat, exp }, secret);
let out = env;
out = out.replace(/^ANON_KEY=.*$/m, "ANON_KEY=" + anon);
out = out.replace(/^SERVICE_ROLE_KEY=.*$/m, "SERVICE_ROLE_KEY=" + service);
fs.writeFileSync("supabase/.env", out);
console.log("ANON_KEY (first 24):", anon.slice(0, 24) + "...");
console.log("SERVICE_ROLE_KEY (first 24):", service.slice(0, 24) + "...");
'
GEN

# 2.3 — Create docker-compose.override.yml that pins ports + drops Mailpit
# (Production sends via Resend — Mailpit is dev-only.)
sudo -u prdr tee supabase/docker-compose.override.yml > /dev/null <<'YML'
# Production overrides: bind only to localhost; reverse proxy bridges 443 → 54321.
services:
  kong:
    ports:
      - "127.0.0.1:54321:8000/tcp"
      # drop the public 8443 binding entirely
  db:
    ports:
      - "127.0.0.1:54322:5432/tcp"
  studio:
    # Studio is admin-only — keep it off public internet, expose via SSH tunnel.
    ports:
      - "127.0.0.1:54323:3000/tcp"
  analytics:
    ports: []
  vector:
    ports: []
  rest:
    ports: []
  realtime:
    ports: []
  storage:
    ports: []
  meta:
    ports: []
  edge-functions:
    ports: []
  pooler:
    ports: []

  # remove mailpit override from dev — production uses Resend SMTP
  mailpit:
    profiles: ["never-start"]

  auth:
    environment:
      # Switch SMTP from Mailpit to Resend
      GOTRUE_SMTP_HOST: smtp.resend.com
      GOTRUE_SMTP_PORT: "465"
      GOTRUE_SMTP_USER: resend
      GOTRUE_SMTP_PASS: ${RESEND_API_KEY}
      GOTRUE_SMTP_ADMIN_EMAIL: noreply@barter.asterivo.ca
      GOTRUE_SMTP_SENDER_NAME: Quadra Barter
YML

# 2.4 — Append RESEND_API_KEY to supabase/.env (operator pastes it)
echo
echo "Paste your Resend API key now (input is hidden):"
read -s RESEND_API_KEY_VALUE
sudo -u prdr bash -c "echo 'RESEND_API_KEY=$RESEND_API_KEY_VALUE' >> /opt/barter/supabase/.env"
unset RESEND_API_KEY_VALUE
```

Rollback: `rm -rf /opt/barter/supabase/.env /opt/barter/supabase/docker-compose.override.yml`. No host services started yet.

---

## Phase 3 — Bring up Supabase

```bash
# 3.1 — Pull images (~6 GB; takes a few minutes on first run)
cd /opt/barter/supabase
sudo -u prdr docker compose pull

# 3.2 — Start
sudo -u prdr docker compose up -d

# 3.3 — Watch healthchecks (loop until all healthy or 5 min)
for i in {1..30}; do
  unhealthy=$(docker ps --format '{{.Names}} {{.Status}}' | grep supabase | grep -v 'healthy' | grep -v 'starting' | wc -l)
  starting=$(docker ps --format '{{.Names}} {{.Status}}' | grep supabase | grep -c 'starting')
  echo "[$i/30] unhealthy: $unhealthy, starting: $starting"
  [ "$unhealthy" -eq 0 ] && [ "$starting" -eq 0 ] && break
  sleep 10
done
docker ps --format 'table {{.Names}}\t{{.Status}}' | grep supabase

# 3.4 — Sanity: localhost:54321 should answer 401 (Kong wants an apikey)
curl -sS -o /dev/null -w "kong: %{http_code}\n" http://127.0.0.1:54321
```

Rollback: `cd /opt/barter/supabase && docker compose down -v` (the `-v` wipes the local volumes, including the empty postgres data — fine here since we haven't applied migrations yet).

---

## Phase 4 — Apply migrations + seed

```bash
# 4.1 — Apply migrations 0001..0013 in order, then the seed
cd /opt/barter
sudo -u prdr bash -c '
  for f in supabase/migrations/*.sql; do
    echo "applying $f"
    docker exec -i supabase-db psql -U postgres -d postgres < "$f"
  done
  docker exec -i supabase-db psql -U postgres -d postgres < supabase/seed.sql
'

# 4.2 — Sanity: areas and categories seeded
docker exec -i supabase-db psql -U postgres -d postgres -c \
  "select count(*) as areas from public.areas; select count(*) as categories from public.categories;"
```

Rollback: drop and recreate the database, then re-run from 3.4. Or `docker compose down -v && docker compose up -d` and re-run Phase 4.

---

## Phase 5 — Build + run Next.js as systemd service

```bash
# 5.1 — Production env file (server-only, never committed)
ANON_KEY=$(grep '^ANON_KEY=' /opt/barter/supabase/.env | cut -d= -f2-)
SERVICE_KEY=$(grep '^SERVICE_ROLE_KEY=' /opt/barter/supabase/.env | cut -d= -f2-)

sudo -u prdr tee /opt/barter/.env.production > /dev/null <<EOF
NEXT_PUBLIC_SUPABASE_URL=https://api.barter.asterivo.ca
NEXT_PUBLIC_SUPABASE_ANON_KEY=$ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=$SERVICE_KEY
NEXT_PUBLIC_SITE_URL=https://barter.asterivo.ca
ADMIN_USER_IDS=
NODE_ENV=production
PORT=3001
EOF
sudo chmod 600 /opt/barter/.env.production
sudo chown prdr:prdr /opt/barter/.env.production

# 5.2 — Build (using the env file so build-time NEXT_PUBLIC_* are baked in)
sudo -u prdr -i bash -c 'cd /opt/barter && set -a && source .env.production && set +a && pnpm build'

# 5.3 — Systemd unit (port 3001 to avoid colliding with anything on 3000)
sudo tee /etc/systemd/system/barter.service > /dev/null <<'UNIT'
[Unit]
Description=Quadra Barter Next.js
After=network.target docker.service
Wants=docker.service

[Service]
Type=simple
WorkingDirectory=/opt/barter
EnvironmentFile=/opt/barter/.env.production
ExecStart=/usr/bin/pnpm start -- -p 3001
Restart=on-failure
RestartSec=5
User=prdr
Group=prdr

# Hardening
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=/opt/barter
PrivateTmp=true

[Install]
WantedBy=multi-user.target
UNIT

sudo systemctl daemon-reload
sudo systemctl enable --now barter
sleep 3
systemctl status barter --no-pager | head -15
curl -sS -o /dev/null -w "next-on-3001: %{http_code}\n" http://127.0.0.1:3001
```

Rollback: `sudo systemctl disable --now barter && sudo rm /etc/systemd/system/barter.service && sudo systemctl daemon-reload`. The build artifacts in `/opt/barter/.next` can be removed too.

---

## Phase 6 — Reverse proxy (depends on Phase 0)

**Branch A — existing Caddy on the box:** add a snippet, reload.

```bash
sudo tee /etc/caddy/sites-enabled/barter.caddy > /dev/null <<'CADDY'
barter.asterivo.ca {
    encode gzip zstd
    reverse_proxy 127.0.0.1:3001

    @api host api.barter.asterivo.ca
    handle @api {
        reverse_proxy 127.0.0.1:54321
    }

    log {
        output file /var/log/caddy/barter.log
        format json
    }
}

api.barter.asterivo.ca {
    encode gzip zstd
    reverse_proxy 127.0.0.1:54321
}
CADDY

# If the existing Caddyfile doesn't already glob sites-enabled, add this once:
# `import sites-enabled/*.caddy` at the top of /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

**Branch B — existing nginx on the box:** add a server block.

```bash
sudo tee /etc/nginx/sites-available/barter > /dev/null <<'NGINX'
server {
    listen 80;
    server_name barter.asterivo.ca api.barter.asterivo.ca;
    location / { return 301 https://$host$request_uri; }
}
server {
    listen 443 ssl http2;
    server_name barter.asterivo.ca;
    # ssl_certificate / ssl_certificate_key — use the existing certbot setup, OR
    # provision certs first with: sudo certbot --nginx -d barter.asterivo.ca -d api.barter.asterivo.ca
    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
server {
    listen 443 ssl http2;
    server_name api.barter.asterivo.ca;
    location / {
        proxy_pass http://127.0.0.1:54321;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 25m;  # listing photos
    }
}
NGINX

sudo ln -s /etc/nginx/sites-available/barter /etc/nginx/sites-enabled/barter
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d barter.asterivo.ca -d api.barter.asterivo.ca --non-interactive --agree-tos -m operator@asterivo.ca
```

**Branch C — no proxy on the box:** install Caddy.

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy

sudo tee /etc/caddy/Caddyfile > /dev/null <<'CADDY'
barter.asterivo.ca {
    encode gzip zstd
    reverse_proxy 127.0.0.1:3001
}
api.barter.asterivo.ca {
    encode gzip zstd
    reverse_proxy 127.0.0.1:54321
}
CADDY

sudo systemctl reload caddy
```

---

## Phase 7 — Smoke test

```bash
# 7.1 — Hit both subdomains over HTTPS (Caddy auto-provisions Let's Encrypt; nginx+certbot path was provisioned in 6B)
curl -sS -o /dev/null -w "ui:  %{http_code}\n" https://barter.asterivo.ca
curl -sS -o /dev/null -w "api: %{http_code}\n" https://api.barter.asterivo.ca

# Expected: ui 200, api 401 (Kong wants an apikey).

# 7.2 — Verify the home feed renders
curl -sS https://barter.asterivo.ca | grep -E '(Quadra Barter|Latest listings)' | head -3

# 7.3 — Verify SEO endpoints
curl -sS https://barter.asterivo.ca/sitemap.xml | head -3
curl -sS https://barter.asterivo.ca/robots.txt  | head -3

# 7.4 — Live magic-link test (operator does this in a browser)
# Visit https://barter.asterivo.ca, sign in with a real email, watch your inbox
# (NOT Mailpit — Resend delivers to the real address).
```

---

## Phase 8 — Final repo housekeeping

```bash
# Add deploy notes + Caddyfile/nginx config to the repo (sanitized)
cd /opt/barter
sudo -u prdr mkdir -p deploy
sudo -u prdr cp /etc/caddy/sites-enabled/barter.caddy deploy/Caddyfile  # or nginx variant
sudo -u prdr tee deploy/README.md > /dev/null <<'DEPLOY'
# Production deploy notes

This server runs Quadra Barter at:
- https://barter.asterivo.ca       (Next.js UI)
- https://api.barter.asterivo.ca   (Supabase Kong gateway)

Stack lives at /opt/barter, owned by prdr.

## Service operations

- `sudo systemctl status barter`               — Next.js
- `cd /opt/barter/supabase && docker compose ps`  — Supabase containers

## Logs

- `journalctl -u barter -f`                    — Next.js
- `cd /opt/barter/supabase && docker compose logs -f auth`  — auth
- `tail -f /var/log/caddy/barter.log`          — proxy

## Restart after a config change

- Edit `/opt/barter/.env.production` then `sudo systemctl restart barter`.
- Edit `/opt/barter/supabase/.env` then `cd /opt/barter/supabase && docker compose up -d`.

## Studio (admin)

Bound only to localhost:54323. SSH-tunnel to use it:
    ssh -L 54323:127.0.0.1:54323 prdr@167.86.77.166
Then visit http://localhost:54323
DEPLOY

sudo -u prdr git -C /opt/barter add deploy/
sudo -u prdr git -C /opt/barter commit -m "chore(deploy): production deploy notes"
sudo -u prdr git -C /opt/barter push
```

---

## Phase 9 — Deferred

Not in this plan, scheduled for a follow-up:

- **Backblaze B2 nightly backups** (was Plan 1 Task 14): nightly `pg_dump | rclone copy b2:bucket/`. Defers cleanly until you have a B2 bucket.
- **OS upgrade** (Ubuntu 20.04 → 22.04 or 24.04): a separate maintenance window.
- **OS-level firewall hardening** (UFW): if not already in place; outside this app's scope.
- **Plan 5 features**: pretty handles, realtime chat, image transforms, push notifications.

---

## Risks + mitigations

| Risk | Mitigation |
|---|---|
| Reverse-proxy reload breaks an unrelated existing site | Phase 0 inventories what's there; Phase 6 only adds, never replaces; `caddy validate` / `nginx -t` before reload. |
| Supabase pulls 6 GB and exhausts disk | Phase 0 checks `df`. If `/` < 15 GB free, abort and re-plan. |
| Port collision with an existing service | All Supabase services bind to `127.0.0.1` on non-default high ports (54321/54322/54323). Next.js uses 3001 instead of 3000. |
| `prdr` not in `docker` group | Phase 0 detects; Phase 1 adds — requires log out/in; not silent. |
| Resend API key leaks to git | Stored only in `/opt/barter/supabase/.env` and `/opt/barter/.env.production`, both 0600 owned by `prdr`, both gitignored. The server's repo is just a clone — `git push` from the server only adds `deploy/*` files. |
| Magic links 404 on signin | Phase 5 sets `NEXT_PUBLIC_SITE_URL=https://barter.asterivo.ca` and 2.1 sets `ADDITIONAL_REDIRECT_URLS` so GoTrue accepts the callback. |
| Studio publicly exposed | Studio bound to `127.0.0.1:54323` only; accessed via SSH tunnel. |
| `service_role` key leaks via the API host | Kong only routes anon requests outward. Service-role calls happen from the Next.js process via the in-network Supabase, never over the public hostname. |
| Stale dev override `docker-compose.override.yml` clobbered | The repo has a dev-flavored override; the production override is generated from scratch in Phase 2.3 and overwrites the dev one. Document in `deploy/README.md`. |

---

## Operator confirmation gates

Before each of these, stop and confirm with the operator:

1. **End of Phase 0** — review discovery dump; pick reverse-proxy branch (A/B/C); confirm disk + memory headroom; confirm no port collisions on 80/443/3001/54321/54322/54323.
2. **Before Phase 6 reload** — confirm the proxy reload won't drop traffic for an existing site.
3. **Before Phase 7 smoke test** — confirm DNS has propagated to the operator's resolver (some ISPs cache for hours).

---

## Estimated time

- Phase 0: 5 min
- Phase 1: 10 min (mostly pnpm install)
- Phase 2: 5 min
- Phase 3: 10–20 min (image pulls)
- Phase 4: 1 min
- Phase 5: 5–10 min (build)
- Phase 6: 5 min
- Phase 7: 5 min
- Phase 8: 2 min

**Total: ~45–60 min of clock time, mostly waiting on docker pulls and pnpm install.**
