# Ticketing Platform

A full-stack event ticketing platform with dynamic pricing. Prices adjust automatically based on time until event, booking velocity, and remaining inventory.

**Stack:** Next.js 15 · NestJS · Turborepo · Drizzle ORM · PostgreSQL · Redis

---

## Prerequisites

- Node.js >= 18
- pnpm 9 — `npm install -g pnpm@9`
- Docker & Docker Compose (for PostgreSQL and Redis)
- Ports **3000**, **3001**, **5432**, **6379** must be free before starting

---

## Quick Setup (5 commands)

```bash
git clone <repo-url> && cd ticketing-platform-monorepo-main
cp .env.example .env          # or copy the values below — see Environment Variables
docker compose up -d          # starts PostgreSQL on :5432 and Redis on :6379
pnpm install
pnpm --filter @repo/database db:migrate
```

> The `.env` file must exist in the **project root** before running Docker or migrations. Both the API and the database package read from it.

---

## Running the Application

Open **two terminals** from the project root.

**Terminal 1 — API (NestJS on port 3001)**

```bash
pnpm run --filter api dev
```

**Terminal 2 — Web (Next.js on port 3000)**

```bash
pnpm run --filter api web
```

Then open [http://localhost:3000](http://localhost:3000).

**Seed sample events** (after both servers are running):

```bash
curl -X POST http://localhost:3001/seed \
  -H "x-api-key: my-secret-api-key"
```

Or hit `POST /seed` from any HTTP client with the `x-api-key` header.

---

## Running Tests

All tests run from the `root` directory:

```bash
pnpm run --filter api test
```

This runs the full Vitest suite with coverage. Test files:

| File | What it covers |
|---|---|
| `src/pricing/rules/pricing-rules.spec.ts` | Unit tests for each pricing rule in isolation |
| `src/pricing/pricing.service.spec.ts` | Combined rules, floor/ceiling clamping, weighted formula |
| `src/bookings/bookings.service.spec.ts` | Booking service unit tests |
| `src/bookings/bookings.controller.spec.ts` | Controller layer unit tests |
| `src/bookings/bookings.integration.spec.ts` | Full booking flow integration tests |
| `src/bookings/bookings.concurrency.spec.ts` | Concurrency tests — proves no overselling under simultaneous requests |
| `src/redis/cache.integration.spec.ts` | Redis cache integration tests |

> Concurrency and integration tests require a live `DATABASE_URL`. They are skipped automatically if `DATABASE_URL` is not set.

**Watch mode:**

```bash
pnpm run --filter api test:watch
```

**Coverage report only:**

```bash
pnpm run --filter api test:cov
```

Coverage HTML report is written to `apps/api/coverage/index.html`.

---

## Environment Variables

Create a single `.env` file in the **project root**. Both Docker Compose and the database package read from this file. Copy the block below:

```env
# API
PORT=3001

# Authentication — used as x-api-key header for POST /events and POST /seed
API_KEY=my-secret-api-key

# PostgreSQL — must match the Docker Compose service credentials
POSTGRES_USER=ticketing
POSTGRES_PASSWORD=ticketing123
POSTGRES_DB=ticketing
DATABASE_URL=postgresql://ticketing:ticketing123@localhost:5432/ticketing
DATABASE_POOL_SIZE=10

# Redis (optional — app works without it, falls back to direct DB queries)
REDIS_URL=redis://localhost:6379

# Pricing rule weights — each multiplies that rule's adjustment (default: 1.0)
PRICING_TIME_WEIGHT=1.0
PRICING_DEMAND_WEIGHT=1.0
PRICING_INVENTORY_WEIGHT=1.0
```

The web app also needs `apps/web/.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:3001
```

### Variable reference

| Variable | Required | Description |
|---|---|---|
| `PORT` | yes | NestJS API port |
| `API_KEY` | yes | Secret for `x-api-key` header on protected endpoints |
| `POSTGRES_USER` | yes | PostgreSQL username (used by Docker Compose) |
| `POSTGRES_PASSWORD` | yes | PostgreSQL password (used by Docker Compose) |
| `POSTGRES_DB` | yes | PostgreSQL database name (used by Docker Compose) |
| `DATABASE_URL` | yes | Full postgres connection string for Drizzle |
| `DATABASE_POOL_SIZE` | no | Connection pool size, default `10` |
| `REDIS_URL` | no | Redis connection string — omit to disable caching |
| `PRICING_TIME_WEIGHT` | no | Weight for time-based pricing rule, default `1.0` |
| `PRICING_DEMAND_WEIGHT` | no | Weight for demand-based pricing rule, default `1.0` |
| `PRICING_INVENTORY_WEIGHT` | no | Weight for inventory-based pricing rule, default `1.0` |
| `NEXT_PUBLIC_API_URL` | yes (web) | API base URL consumed by the Next.js frontend |

---

## API Overview

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/events` | — | List all events with current price |
| `GET` | `/events/:id` | — | Event detail with full price breakdown |
| `POST` | `/events` | `x-api-key` | Create event |
| `POST` | `/bookings` | — | Book tickets |
| `GET` | `/bookings?eventId=:id` | — | List bookings for an event |
| `GET` | `/bookings?email=:email` | — | List bookings for a user |
| `GET` | `/analytics/events/:id` | — | Per-event metrics |
| `GET` | `/analytics/summary` | — | System-wide metrics |
| `POST` | `/seed` | `x-api-key` | Seed sample events |
