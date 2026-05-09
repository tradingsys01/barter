# Production deployment

End-to-end guide for self-hosting Quadra Barter on a single Linux VPS. This was used to bring up the live instance.

> **Updating an existing deploy?** Use [`deploy/UPDATING.md`](./UPDATING.md). This file is the *first-time bringup* guide.

The guide assumes:
- A Linux server (Ubuntu 20.04+) with sudo access
- Docker + docker-compose-plugin
- A domain you control (e.g. `your-domain.example`)
- A [Resend](https://resend.com) account for outbound mail

Estimated time: ~45–60 min on first run, mostly waiting on docker image pulls.

Throughout this guide:
- `your-domain.example` → your real domain
- `barter.your-domain.example` → where the UI will live
- `api.barter.your-domain.example` → where the Supabase API will live
- `<deploy-user>` → the unprivileged Linux user that will own the deploy (e.g. `barter`, `appuser`)
- `<your-email>` → email for cert/admin notifications

## 1. DNS

Set two A records at your DNS provider:

| Host | Type | Value |
|---|---|---|
| `barter` | A | server IP |
| `api.barter` | A | server IP |

Verify:

```bash
dig +short barter.your-domain.example
dig +short api.barter.your-domain.example
```

Both should return the server's public IP.

## 2. Resend (outbound email)

1. Sign up at https://resend.com (free tier: 3,000 emails/month).
2. **Domains → Add Domain → `your-domain.example`** (or a subdomain like `mail.barter.your-domain.example`).
3. Add the DKIM TXT, SPF TXT, and feedback-handling MX records Resend generates. **Leave "Enable Receiving" off** — we only send.
4. Wait for green "Verified" (~1 min once DNS propagates).
5. **API Keys → Create API Key → Sending access**. Copy the `re_...` value to a password manager. You'll only see it once.

## 3. Server prep

```bash
# As your deploy user (must have sudo)
sudo apt update
sudo apt install -y ca-certificates curl gnupg

# Docker (official repo — Ubuntu 20.04's apt doesn't ship docker-compose-plugin)
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Add yourself to the docker group, log out/in for it to take effect
sudo usermod -aG docker $USER

# Node 20 + pnpm
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt install -y nodejs
sudo npm install -g pnpm@10
```

## 4. Clone and install

```bash
sudo install -d -o $USER -g $USER /opt/barter
git clone https://github.com/tradingsys01/barter.git /opt/barter/repo
cd /opt/barter/repo
pnpm install --frozen-lockfile
```

## 5. Generate Supabase secrets

```bash
cd /opt/barter/repo
cp supabase/.env.example supabase/.env

# Random secrets for postgres, dashboard, JWT signing
PG=$(openssl rand -hex 24)
DASH=$(openssl rand -hex 24)
JWT=$(openssl rand -base64 48 | tr -d '/+=' | head -c 64)

sed -i \
  -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$PG|" \
  -e "s|^DASHBOARD_PASSWORD=.*|DASHBOARD_PASSWORD=$DASH|" \
  -e "s|^JWT_SECRET=.*|JWT_SECRET=$JWT|" \
  -e "s|^SITE_URL=.*|SITE_URL=https://barter.your-domain.example|" \
  -e "s|^API_EXTERNAL_URL=.*|API_EXTERNAL_URL=https://api.barter.your-domain.example|" \
  -e "s|^ADDITIONAL_REDIRECT_URLS=.*|ADDITIONAL_REDIRECT_URLS=https://barter.your-domain.example/auth/callback|" \
  supabase/.env

# Generate ANON + SERVICE_ROLE JWTs from JWT_SECRET (HS256)
node -e '
const crypto = require("crypto");
const fs = require("fs");
const env = fs.readFileSync("supabase/.env", "utf8");
const secret = env.match(/^JWT_SECRET=(.+)$/m)[1];
const b64u = s => Buffer.from(s).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const sign = (p) => {
  const h = b64u(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const pl = b64u(JSON.stringify(p));
  return h + "." + pl + "." + b64u(crypto.createHmac("sha256", secret).update(h + "." + pl).digest());
};
const iat = Math.floor(Date.now() / 1000), exp = iat + (10 * 365 * 24 * 60 * 60);
const out = env
  .replace(/^ANON_KEY=.*$/m,         "ANON_KEY="         + sign({ role: "anon",         iss: "supabase", iat, exp }))
  .replace(/^SERVICE_ROLE_KEY=.*$/m, "SERVICE_ROLE_KEY=" + sign({ role: "service_role", iss: "supabase", iat, exp }));
fs.writeFileSync("supabase/.env", out);
console.log("ANON + SERVICE_ROLE keys written");
'

# Resend API key — supply via stdin so it never ends up in shell history
read -s -p "Resend API key: " KEY; echo
echo "RESEND_API_KEY=$KEY" >> supabase/.env
unset KEY
chmod 600 supabase/.env
```

## 6. Production docker-compose override

Create `supabase/docker-compose.override.yml`:

```yaml
# Production: bind only to loopback; reverse proxy bridges 443 → 54321.
services:
  kong:
    ports: ["127.0.0.1:54321:8000/tcp"]
  db:
    ports: ["127.0.0.1:54322:5432/tcp"]
  studio:
    # Admin only — SSH-tunnel to use it.
    ports: ["127.0.0.1:54323:3000/tcp"]
  # Internal services lose all public ports
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
  functions:
    ports: []
  supavisor:
    ports: []
  # Resend SMTP relay
  auth:
    environment:
      GOTRUE_SMTP_HOST: smtp.resend.com
      GOTRUE_SMTP_PORT: "465"
      GOTRUE_SMTP_USER: resend
      GOTRUE_SMTP_PASS: ${RESEND_API_KEY}
      GOTRUE_SMTP_ADMIN_EMAIL: noreply@your-domain.example
      GOTRUE_SMTP_SENDER_NAME: Quadra Barter
```

## 7. Bring up Supabase

```bash
cd /opt/barter/repo/supabase
docker compose pull         # ~6 GB on first run
docker compose up -d
docker compose ps           # wait until all 13 services are 'healthy'
```

## 8. Apply migrations + seed

```bash
cd /opt/barter/repo
for f in supabase/migrations/*.sql; do
  docker exec -i supabase-db psql -U postgres -d postgres < "$f"
done
docker exec -i supabase-db psql -U postgres -d postgres < supabase/seed.sql

# Sanity
docker exec -i supabase-db psql -U postgres -d postgres -c \
  "select 'areas' as t, count(*) from public.areas
   union all select 'categories', count(*) from public.categories;"
# Expect: areas=6, categories=9
```

## 9. Production env + build

`/opt/barter/.env.production` (mode 0600, owned by deploy user, **NOT** committed):

```
NEXT_PUBLIC_SUPABASE_URL=https://api.barter.your-domain.example
NEXT_PUBLIC_SUPABASE_ANON_KEY=<ANON_KEY from supabase/.env>
SUPABASE_SERVICE_ROLE_KEY=<SERVICE_ROLE_KEY from supabase/.env>
NEXT_PUBLIC_SITE_URL=https://barter.your-domain.example
ADMIN_USER_IDS=
NODE_ENV=production
PORT=3010
```

```bash
chmod 600 /opt/barter/.env.production
cd /opt/barter/repo
set -a; source /opt/barter/.env.production; set +a
pnpm build
```

> **Footgun.** `NEXT_PUBLIC_*` vars are inlined into the **client bundle at build time**. If you run a bare `pnpm build` without sourcing `/opt/barter/.env.production` first, those vars are undefined in the browser and `createBrowserClient` throws *"Your project's URL and API key are required"* on the first auth-touching client interaction (e.g. Sign out). The systemd `EnvironmentFile=` only covers runtime — it cannot retroactively fix a stale build. Always export the env before `pnpm build`, or use `pnpm exec dotenv -e /opt/barter/.env.production -- pnpm build`. After fixing, browsers may need a hard refresh to drop the cached broken bundle.

## 10. Systemd unit

`/etc/systemd/system/barter.service`:

```ini
[Unit]
Description=Quadra Barter Next.js
After=network.target docker.service
Wants=docker.service

[Service]
Type=simple
WorkingDirectory=/opt/barter/repo
EnvironmentFile=/opt/barter/.env.production
ExecStart=/usr/bin/pnpm start
Restart=on-failure
RestartSec=5
User=<deploy-user>
Group=<deploy-user>

# Hardening
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=/opt/barter
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now barter
sudo systemctl status barter
curl -sS -o /dev/null -w "next on 3010: %{http_code}\n" http://127.0.0.1:3010
```

## 11. Reverse proxy

### Option A — nginx (recommended if you already run nginx)

`/etc/nginx/sites-available/barter`:

```nginx
# HTTP → HTTPS
server {
    listen 80;
    server_name barter.your-domain.example api.barter.your-domain.example;
    location /.well-known/acme-challenge/ { root /var/www/html; }
    location / { return 301 https://$host$request_uri; }
}

# UI
server {
    listen 443 ssl http2;
    server_name barter.your-domain.example;
    ssl_certificate     /etc/letsencrypt/live/barter.your-domain.example/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/barter.your-domain.example/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    gzip on;
    gzip_types text/plain text/css text/javascript application/javascript application/json image/svg+xml;
    client_max_body_size 25m;

    location /_next/static/ {
        alias /opt/barter/repo/.next/static/;
        expires 365d;
        access_log off;
    }
    location / {
        proxy_pass http://127.0.0.1:3010;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# API (Supabase Kong)
server {
    listen 443 ssl http2;
    server_name api.barter.your-domain.example;
    ssl_certificate     /etc/letsencrypt/live/api.barter.your-domain.example/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.barter.your-domain.example/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    client_max_body_size 25m;

    location / {
        proxy_pass http://127.0.0.1:54321;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/barter /etc/nginx/sites-enabled/barter
sudo nginx -t

# Provision certs
sudo apt install -y certbot python3-certbot-nginx
sudo certbot certonly --nginx \
  -d barter.your-domain.example -d api.barter.your-domain.example \
  --non-interactive --agree-tos -m <your-email>

sudo systemctl reload nginx
```

### Option B — Caddy (if no proxy yet)

```caddy
# /etc/caddy/Caddyfile
barter.your-domain.example {
  encode gzip zstd
  reverse_proxy 127.0.0.1:3010
}
api.barter.your-domain.example {
  encode gzip zstd
  reverse_proxy 127.0.0.1:54321
}
```

Caddy auto-provisions Let's Encrypt certs.

## 12. Smoke test

```bash
curl -sS -o /dev/null -w "ui  : %{http_code}\n" https://barter.your-domain.example
curl -sS -o /dev/null -w "api : %{http_code}\n" https://api.barter.your-domain.example
# Expect: ui 200, api 401 (Kong wants apikey — correct)

curl -sS https://barter.your-domain.example/sitemap.xml | head -3
curl -sS https://barter.your-domain.example/robots.txt | grep -i sitemap
```

Then in a browser: visit `https://barter.your-domain.example`, click **Get started**, enter your real email, click the magic link from your inbox, and complete onboarding.

## 13. (Optional) Set yourself as admin

To use `/admin/reports`:

```bash
# Find your UUID after signing up
docker exec -i supabase-db psql -U postgres -d postgres -c \
  "select id, email from public.users where email='you@example.com';"

# Append to env and restart
sed -i 's|^ADMIN_USER_IDS=.*|ADMIN_USER_IDS=<your-uuid>|' /opt/barter/.env.production
sudo systemctl restart barter
```

## Operations

| Task | Command |
|---|---|
| Next.js logs | `journalctl -u barter -f` |
| Supabase logs | `cd /opt/barter/repo/supabase && docker compose logs -f auth` (or `kong`, `realtime`, etc.) |
| Restart Next.js | `sudo systemctl restart barter` |
| Restart Supabase | `cd /opt/barter/repo/supabase && docker compose restart` |
| Reload nginx | `sudo nginx -t && sudo systemctl reload nginx` |
| Update the app | See [`deploy/UPDATING.md`](./UPDATING.md) — short version: `cd /opt/barter/repo && git pull && pnpm install --frozen-lockfile && set -a && source /opt/barter/.env.production && set +a && pnpm build && sudo systemctl restart barter` |
| Apply a new migration | `docker exec -i supabase-db psql -U postgres -d postgres < supabase/migrations/00NN_*.sql` |
| Studio access (admin UI) | `ssh -L 54323:127.0.0.1:54323 user@host`, then http://localhost:54323 |

## Backup (TODO)

Not in this guide. Plan: nightly `pg_dump | rclone copy b2:bucket/`. Track at https://github.com/tradingsys01/barter/issues if/when filed.

## Security checklist

- [x] All Supabase services bind to `127.0.0.1` only — none publicly reachable except via reverse proxy
- [x] `supabase/.env` and `/opt/barter/.env.production` are mode 0600, owned by deploy user
- [x] systemd unit hardened (`NoNewPrivileges`, `ProtectSystem=strict`, etc.)
- [x] Magic-link emails over SMTP via Resend (DKIM, SPF, DMARC verified at the sender domain)
- [x] Production JWTs generated fresh — never reuse the dev demo keys
- [ ] Off-server backups (pending, see above)
- [ ] OS hardening (UFW, automatic upgrades) — outside this app's scope, configure per your normal operations
