# 🏠 PropScout

Real estate data platform for the Phoenix AZ market — daily scraping, structured storage, self-hosted images, and an AI agent you talk to via Telegram or the web.

## What it does

- **Scrapes daily** — Zillow listings for configured zip codes (Apify), every day at 06:00 UTC
- **Stores everything** in PostgreSQL — structured columns + full raw JSON, price/status history on every change
- **Self-hosts all photos** — cover images and full galleries downloaded to MinIO and served from our own domain; nothing hotlinks Zillow
- **AI agent** answers natural-language questions with real data (tool calling over the live DB) — English & Spanish
- **Proactive alerts** — subscribers get a Telegram digest when listings drop in price
- **Invite-only access** — new Telegram users need one-tap admin approval
- **Self-healing pipeline** — a reconciler recovers any scrape whose webhook was lost

## Use cases & examples

### Ask anything, get real data (Telegram or web chat)

The agent has tools over the live database — it never invents prices.

| You say | What happens |
|---|---|
| *"Show me 3-bed homes under $600k in 85254"* | `search_properties` — numbered list, reply `1`–`8` for the full photo album |
| *"Compare average prices in 85251 vs 85018"* | `zip_summary` — counts, avg/min/max per zip |
| *"What dropped in price this week?"* | `price_changes` — old → new price, % off, from recorded history |
| *"What's for sale near Camelback Mountain under 900k?"* | the LLM geocodes the landmark, calls `nearby_properties`, answers nearest-first with distances |
| *"¿Casas de 2 recámaras baratas en Scottsdale?"* | same tools, answers in Spanish |

Conversation memory persists (per user on Telegram, per browser on web) — *"my budget is $450k"* is remembered across messages and even service restarts. `/clear` forgets.

### 📍 "Near me" without typing

In Telegram: **attach → Location → send**. The bot replies with the 8 nearest active listings, each with distance in km. Reply with a number for photos + details. No PostGIS — plain-SQL haversine over the lat/lng every listing carries.

### 🔔 Price-drop alerts

```
/alerts on
```
Hourly sweep DMs you a digest of new drops (top 10, address, old → new, −%). Powered by the `property_history` trigger — every price change is recorded automatically, whatever wrote it. `/alerts off` stops it.

### 🔒 Invite-only bot

A stranger messaging [@PropScout_bot](https://t.me/PropScout_bot) gets *"invite-only, request sent"* — admins simultaneously receive the request with inline **✅ Approve / ⛔ Deny** buttons. One tap decides. `/users` shows the roster with query counts.

### Telegram command reference

| Command | Who | Does |
|---|---|---|
| `/start`, `/help` | approved | intro / command list |
| `/stats`, `/zips` | approved | market overview, per-zip summary |
| `/search <zip> [max price]` | approved | quick structured search |
| 📍 share location | approved | nearest listings with distances |
| `/alerts on\|off` | approved | price-drop digests |
| `/clear` | approved | wipe conversation memory |
| `/scrape <zip> [zip2…]` | admin | trigger a scrape now |
| `/jobs` | admin | recent scrape runs |
| `/users` | admin | access roster |

### API examples

Everything the agent can do is a plain endpoint (behind basic auth except the webhook):

```bash
# Chat with the agent
curl -X POST https://propscout.xari.net/api/agent/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"cheapest 3-bed in 85251","chatId":123,"channel":"web"}'

# Nearest listings to a coordinate
curl "https://propscout.xari.net/api/properties/nearby?lat=33.4942&lng=-111.9261&radius_km=10"

# Listings, one property with images, scrape runs
curl https://propscout.xari.net/api/properties
curl https://propscout.xari.net/api/properties/<id>
curl https://propscout.xari.net/api/apify/runs

# Trigger a scrape (same thing the daily timer does)
curl -X POST https://propscout.xari.net/api/apify/run \
  -H "Content-Type: application/json" \
  -d '{"settings_id":"<apify_settings.id>","zip_codes":["85254","85251","85018"]}'
```

## Stack (actual)

| Layer | Tech |
|-------|------|
| Scraping | Apify — `maxcopell/zillow-zip-search` (daily) + `maxcopell/zillow-detail-scraper` (photo galleries, ≤150 props/day) |
| Database | PostgreSQL 16 (plain — `pg_trgm` + `uuid-ossp` only; history via trigger, geo via haversine SQL) |
| Images | MinIO, served at `/img/` (public — Telegram must fetch them) |
| API | Express + TypeScript (`services/agent-api`, run with tsx) |
| AI | Any OpenAI-compatible endpoint — default: LiteLLM gateway → DeepSeek (`LLM_BASE_URL` / `LLM_MODEL` / `LLM_API_KEY`) |
| Channels | Telegram (`services/telegram-agent`) + React web chat (`services/ui`) |
| Admin | Directus at `/admin` (raw tables) + React settings UI |
| Scheduling | systemd timer (`infra/systemd/`) — no n8n, no pg_cron |

## How the daily pipeline works

```
06:00 UTC  systemd timer → POST /api/apify/run
             └─ Apify zip-search runs, webhook fires back
                  └─ upsert properties (trigger records price/status changes)
                  └─ mark listings unseen 3 days → inactive
                  └─ sync cover images → MinIO
                  └─ detail scrape for ≤150 cover-only props → full galleries
every 30m  reconciler: any job stuck 'running' >20 min is checked
             against Apify and recovered (webhooks are not trusted)
hourly     alert sweep: un-alerted price drops → Telegram digest
```

Ops notes:
- Deployed on a single host as three systemd services: `propscout-api` (:3100), `propscout-telegram`, `propscout-web` (:3200), behind nginx with basic auth (webhook and `/img/` exempt).
- Apify webhook payloads **must** use `{{resource.id}}`-style variables — bare `{{runId}}` arrives unrendered and silently no-ops.
- Key env (`agent-api/.env`): `APIFY_API_TOKEN`, `LLM_BASE_URL`, `LLM_MODEL`, `LLM_API_KEY`, `LLM_PRICE_IN_PER_M`/`OUT_PER_M` (cost logging), `DETAIL_SCRAPE_LIMIT`, `PUBLIC_URL`. Telegram: `TELEGRAM_BOT_TOKEN`, `ADMIN_TELEGRAM_IDS` (empty = open dev mode), `AGENT_API_URL`.

## Getting started

```bash
git clone https://github.com/egarim/PropScout
cd PropScout
docker compose up -d                      # MinIO + Directus
psql < infra/postgres/init/01-extensions.sql   # then 02-schema.sql, 03-seed.sql
cd services/agent-api && npm i && npm run dev  # :3100
cd services/telegram-agent && npm i && npm run dev
cd services/ui && npm i && npm run dev
```

Init SQL runs on plain `postgres:16-alpine` — no PostGIS/TimescaleDB/pgvector required (deliberately removed; the code never used them).

## License

MIT
