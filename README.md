# 🏠 PropScout

Real estate data platform — scrape listings, store structured data, query via AI agent.

## What it does

- **Scrapes** real estate listings from Redfin, Zillow, Realtor.com (via Apify)
- **Stores** everything in PostgreSQL — structured + raw JSON, never lose data
- **Saves** property images to self-hosted blob storage (MinIO)
- **Schedules** scrapes via n8n (daily, weekly, on-demand)
- **AI Agent** answers questions about the data via Telegram (WhatsApp/SMS coming)
- **React UI** controls the whole platform — scrape jobs, contacts, settings
- **Schema-agnostic UI** — add new columns to the DB, UI adapts automatically

## Stack

| Layer | Tech |
|-------|------|
| Scraping | Apify |
| Scheduler | n8n |
| Database | PostgreSQL + PostGIS + TimescaleDB + pgvector + pg_trgm |
| File storage | MinIO (self-hosted S3) |
| Admin UI + API | Directus |
| Custom UI | React + TypeScript |
| AI Agent | Claude via OpenRouter |
| Channels | Telegram (WhatsApp + SMS in Phase 2) |
| Infra | Docker Compose |

## Architecture

```
┌─────────────────────────────────────────────┐
│              son-of-anton                   │
│                                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │ Directus │  │ Custom   │  │  AI      │  │
│  │ (admin + │  │ React UI │  │  Agent   │  │
│  │  API)    │  │          │  │ Telegram │  │
│  └────┬─────┘  └──────────┘  └──────────┘  │
│       │                                     │
│  ┌────▼─────────────────────────────────┐   │
│  │         PostgreSQL                   │   │
│  │  PostGIS · TimescaleDB · pgvector    │   │
│  └──────────────────────────────────────┘   │
│  ┌──────────┐  ┌──────────┐                 │
│  │  MinIO   │  │   n8n    │                 │
│  │ (images) │  │(scheduler│                 │
│  └──────────┘  └──────────┘                 │
└─────────────────────────────────────────────┘
```

## Phases

| Phase | Scope |
|-------|-------|
| 1 | Infrastructure — PostgreSQL extensions, MinIO, Directus, Docker Compose |
| 2 | Scraping pipeline — Apify integration, n8n schedules, data ingestion |
| 3 | React UI — Sources, Jobs, Settings, Contact management |
| 4 | AI Agent — Telegram channel, natural language queries |
| 5 | Multi-language — English + Spanish |
| 6 | More channels — WhatsApp, SMS via Twilio |
| 7 | Map UI — PostGIS geo queries, price trends, pgvector similarity |

## Domain

`propscout.xari.net`

## Getting Started

```bash
git clone https://github.com/egarim/PropScout
cd PropScout
cp .env.example .env
# Fill in your API keys
docker compose up -d
```

## License

MIT
