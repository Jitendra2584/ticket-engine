import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.ts";

const poolSize = parseInt(process.env.DATABASE_POOL_SIZE ?? "10", 10);

const client = postgres(process.env.DATABASE_URL ?? "", {
  max: poolSize,
  idle_timeout: 60,
  connect_timeout: 60,
  connection: {
    idle_in_transaction_session_timeout: 60000,
    default_transaction_isolation: "read committed",
    idle_session_timeout: 120000,
    statement_timeout: 180000,
  },
});

export const db = drizzle(client, { schema });

export type Event = typeof schema.events.$inferSelect;
export type NewEvent = typeof schema.events.$inferInsert;
export type Booking = typeof schema.bookings.$inferSelect;
export type NewBooking = typeof schema.bookings.$inferInsert;

export * from "./schema.ts";
