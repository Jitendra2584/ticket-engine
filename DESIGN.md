# Design Document

## Pricing Algorithm

The pricing engine is built as a set of pure functions with no side effects, making it deterministic and trivially testable. Three independent rules — time-based, demand-based, and inventory-based — each compute a raw adjustment value between 0 and 1. Each rule has a configurable weight (sourced from environment variables or per-event JSON config), and the final price follows the formula:

```
currentPrice = basePrice × (1 + Σ(adjustment × weight))
```

The result is clamped to a floor and ceiling price stored on each event. The time rule uses linear interpolation between 8–30 days out, stepping to fixed thresholds at 7 days (20%) and 1 day (50%). The demand rule checks a rolling 60-minute booking count against a threshold. The inventory rule triggers at less than 20% remaining capacity. This additive weighted model keeps pricing transparent — the API returns a full breakdown showing each rule's contribution, so users can see exactly why a price changed.

## Concurrency Control

Overselling prevention uses PostgreSQL's `SELECT ... FOR UPDATE` within a database transaction. When a booking request arrives, the transaction locks the event row, checks available tickets, computes the price, inserts the booking, and increments `booked_tickets` atomically. A second concurrent request for the same event blocks on the row lock until the first transaction commits, then re-reads the updated ticket count. If tickets are exhausted, it receives a 409 Conflict. The `idle_in_transaction_session_timeout` is set to 60 seconds at the connection level via the postgres driver's `connection` option, preventing any transaction from holding a lock indefinitely. This approach is simpler and more reliable than application-level locking — PostgreSQL guarantees serialization.

## Monorepo Architecture

The Turborepo monorepo has three layers: `packages/database` (Drizzle schema, client, types shared across packages), `apps/api` (NestJS backend), and `apps/web` (Next.js frontend). DTOs are defined as classes with `class-validator` decorators in the API, then exported as type-only aliases for the frontend — NestJS gets runtime validation, the frontend gets zero-cost types with no dependency on `class-validator`. The database package exports inferred types from the Drizzle schema, keeping type definitions in one place.

## Trade-offs

Redis caching with Lua scripts adds an infrastructure dependency but ensures atomicity under heavy load — counters never lose their TTL, and stale data can't be re-cached between invalidation steps. The system degrades gracefully without Redis, falling through to direct DB queries.

The additive weighted pricing model (`basePrice × (1 + sum of adjustments)`) prioritizes transparency over aggressive pricing. Rules are summed, not multiplied, so each rule's contribution is independent and easy to display in the price breakdown UI. A multiplicative model would compound rules (e.g., 20% × 15% × 25% = 72.5% increase vs additive 60%), producing sharper spikes when multiple rules fire, but making the breakdown harder to explain to users.

DTOs use `class-validator` classes for NestJS runtime validation with type-only exports for the frontend — one definition, two consumption modes, no `class-validator` in the frontend bundle.

Pessimistic locking (`SELECT ... FOR UPDATE`) over optimistic locking means no retry logic needed, but concurrent requests for the same event serialize. Acceptable at this scale.

Both `db:push` (quick local iteration) and `db:migrate` (versioned migration files via `drizzle-kit generate`) are available — push for development speed, migrate for controlled production deployments with history.

## Future Improvements

With more time I would add: WebSocket-based real-time price updates instead of 30-second polling, a proper user authentication system with JWT, rate limiting on the booking endpoint to prevent abuse, database connection pooling via PgBouncer for horizontal scaling, and end-to-end tests with Playwright covering the full booking flow through the UI.
