# Design Document

## Pricing Algorithm

The pricing engine is built as a set of pure functions with no side effects, making it deterministic and trivially testable. Three independent rules — time-based, demand-based, and inventory-based — each compute a raw adjustment value between 0 and 1. Each rule has a configurable weight (sourced from environment variables or per-event JSON config stored in the `pricing_rules` JSONB column), and the final price follows the formula:

```
currentPrice = basePrice × (1 + Σ(adjustment × weight))
```

The result is clamped to the `floor_price` and `ceiling_price` stored on each event row.

- **Time rule**: linear interpolation from 0→20% between 30 and 8 days out, fixed 20% at 2–7 days, 50% at ≤1 day.
- **Demand rule**: flat 15% increase when more than 10 bookings occurred in the last 60 minutes. The rolling count is served from a Redis counter (incremented atomically via Lua on each booking) and falls back to a direct DB `COUNT` query when Redis is unavailable.
- **Inventory rule**: flat 25% increase when fewer than 20% of tickets remain.

Each rule is a plain object `{ name, compute, weight }` — no classes, no inheritance. `PricingService.buildRules()` assembles the active rule set from env-var weights and the per-event config, then delegates to the pure `computePrice` function. The API returns the full `PriceBreakdown` (each rule's raw adjustment, weight, and weighted contribution) so the frontend can display exactly why a price changed.

## Concurrency Control

Overselling prevention uses PostgreSQL's `SELECT ... FOR UPDATE` inside a Drizzle transaction. When a booking arrives, the transaction locks the event row, reads the current `booked_tickets`, checks availability, computes the dynamic price, inserts the booking, and increments `booked_tickets` — all atomically. A second concurrent request for the same event blocks on the row lock until the first transaction commits, then re-reads the updated count. If tickets are exhausted it receives a 409 Conflict. The `idle_in_transaction_session_timeout` is set to 60 seconds at the postgres driver's `connection` level, preventing any transaction from holding a lock indefinitely.

The booking endpoint also validates `expectedPrice` (sent by the client) against the server-computed price at booking time. If the price shifted by more than $0.01 between when the user viewed it and when they submitted, the request is rejected with a `PRICE_CHANGED` 409 and the current price is returned — preventing silent price surprises.

Concurrency is covered by eight automated integration tests in `bookings.concurrency.spec.ts`: 2-simultaneous-for-1-ticket, 5-for-3, multi-quantity overlap, cross-event isolation, price snapshot accuracy, single over-request, 10-for-5 stress, and sequential exhaustion.

## Monorepo Architecture

Three layers under Turborepo:

- `packages/database` — Drizzle schema, inferred TypeScript types (`Event`, `Booking`, `NewEvent`, `NewBooking`), and the postgres client with connection-level timeout config. Single source of truth for all DB types.
- `apps/api` — NestJS backend. DTOs are `class-validator` classes for runtime validation; the frontend imports them as `type`-only aliases, so `class-validator` never enters the frontend bundle.
- `apps/web` — Next.js 15 App Router frontend. Server Components fetch data directly; booking submission uses a Server Action.

Turborepo's `dependsOn: ["^build"]` ensures `packages/database` is compiled before either app builds. Both `db:push` (fast local iteration) and `db:migrate` (versioned migration files via `drizzle-kit generate`) are available.

## Trade-offs

**Additive vs multiplicative pricing**: Rules are summed, not multiplied, so each rule's contribution is independent and easy to display in the breakdown UI. A multiplicative model would compound adjustments more aggressively (e.g. 20% × 15% × 25% ≈ 72.5% vs additive 60%) but makes the per-rule breakdown harder to explain to users.

**Pessimistic locking**: `SELECT ... FOR UPDATE` over optimistic locking means no retry logic is needed, but concurrent requests for the same event serialize at the DB level. Acceptable at this scale; at higher throughput a queue-per-event pattern would be preferable.

**Redis as optional**: The system degrades gracefully without Redis — demand counts fall back to a DB `COUNT` query and cache misses simply hit the database. This keeps local development simple (no Redis required) while providing real performance benefits in production. Lua scripts (`LUA_INCR_WITH_TTL`, `LUA_INVALIDATE_AFTER_BOOKING`) ensure counter increments and cache invalidations are atomic, preventing stale re-caching between operations under load.

**Price snapshot on booking**: `price_paid` is stored as a numeric snapshot at booking time, independent of any future price changes. This is correct for revenue reporting but means there is no link back to which specific pricing rule state produced that price.

## Future Improvements

With more time: WebSocket-based real-time price updates instead of 30-second polling; a proper JWT authentication system replacing the hardcoded API key; rate limiting on the booking endpoint to prevent abuse; database connection pooling via PgBouncer for horizontal scaling; end-to-end tests with Playwright covering the full booking flow through the UI; and a proper price history table to audit how prices evolved over an event's lifetime.
