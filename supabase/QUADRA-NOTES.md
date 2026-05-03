# Quadra Barter — Local Supabase notes

The official upstream `README.md` documents the stack itself. This file documents how we use it.

## Start

    cd supabase && docker compose up -d

First boot pulls ~6GB of images and may take several minutes. Subsequent boots take ~60s for healthchecks.

## Stop

    cd supabase && docker compose down

## Wipe (destroys local data)

    cd supabase && docker compose down -v && rm -rf volumes/db/data

## Studio

http://localhost:8000 — Kong gateway and Studio share this port.

## Keys

`.env` here uses Supabase's well-known demo JWTs. Intentionally insecure, only safe for local dev. Production secrets are generated fresh during the production deploy task.
