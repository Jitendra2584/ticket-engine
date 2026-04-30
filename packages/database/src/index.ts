import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const poolSize = parseInt(process.env.DATABASE_POOL_SIZE ?? "10", 10);

const client = postgres(process.env.DATABASE_URL ?? "", {
  max: poolSize,
  idle_timeout: 60,
  connect_timeout: 60,
  connection: {
    // Global session-level timeout: abort any transaction idle for more than 60s
    // Set in milliseconds (60000ms = 60s), applied to every connection at session level
    idle_in_transaction_session_timeout: 60000,
    default_transaction_isolation: "read committed",
    idle_session_timeout: 120000,
    statement_timeout: 180000 
  },
});

export const db = drizzle(client, { schema });

export type Event = typeof schema.events.$inferSelect;
export type NewEvent = typeof schema.events.$inferInsert;
export type Booking = typeof schema.bookings.$inferSelect;
export type NewBooking = typeof schema.bookings.$inferInsert;

/**
 * Configuration for which pricing rules are enabled and their weights.
 * Stored in the event's pricing_rules JSON column.
 */
export interface PricingRulesConfig {
  timeRule: { enabled: boolean; weight: number };
  demandRule: { enabled: boolean; weight: number };
  inventoryRule: { enabled: boolean; weight: number };
}

export * from "./schema";
