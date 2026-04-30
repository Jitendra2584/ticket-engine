import {
  check,
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { PricingRulesConfig } from ".";

export const events = pgTable(
  "events",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    date: timestamp("date", { withTimezone: true }).notNull(),
    venue: text("venue").notNull(),
    description: text("description").notNull(),
    totalTickets: integer("total_tickets").notNull(),
    bookedTickets: integer("booked_tickets").notNull().default(0),
    basePrice: numeric("base_price", { precision: 10, scale: 2 }).notNull(),
    currentPrice: numeric("current_price", { precision: 10, scale: 2 }).notNull(),
    floorPrice: numeric("floor_price", { precision: 10, scale: 2 }).notNull(),
    ceilingPrice: numeric("ceiling_price", { precision: 10, scale: 2 }).notNull(),
    pricingRules: jsonb("pricing_rules").$type<PricingRulesConfig>().notNull(),
  },
  (table) => [
    check("total_tickets_positive", sql`${table.totalTickets} > 0`),
    check(
      "floor_lte_ceiling",
      sql`${table.floorPrice} <= ${table.ceilingPrice}`
    ),
    check(
      "base_price_in_range",
      sql`${table.basePrice} >= ${table.floorPrice} AND ${table.basePrice} <= ${table.ceilingPrice}`
    ),
  ]
);

export const bookings = pgTable("bookings", {
  id: serial("id").primaryKey(),
  eventId: integer("event_id")
    .notNull()
    .references(() => events.id),
  userEmail: text("user_email").notNull(),
  quantity: integer("quantity").notNull(),
  pricePaid: numeric("price_paid", { precision: 10, scale: 2 }).notNull(),
  bookedAt: timestamp("booked_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
