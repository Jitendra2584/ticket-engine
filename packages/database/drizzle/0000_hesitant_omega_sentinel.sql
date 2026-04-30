CREATE TABLE "bookings" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" integer NOT NULL,
	"user_email" text NOT NULL,
	"quantity" integer NOT NULL,
	"price_paid" numeric(10, 2) NOT NULL,
	"booked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"date" timestamp with time zone NOT NULL,
	"venue" text NOT NULL,
	"description" text NOT NULL,
	"total_tickets" integer NOT NULL,
	"booked_tickets" integer DEFAULT 0 NOT NULL,
	"base_price" numeric(10, 2) NOT NULL,
	"current_price" numeric(10, 2) NOT NULL,
	"floor_price" numeric(10, 2) NOT NULL,
	"ceiling_price" numeric(10, 2) NOT NULL,
	"pricing_rules" jsonb NOT NULL,
	CONSTRAINT "total_tickets_positive" CHECK ("events"."total_tickets" > 0),
	CONSTRAINT "floor_lte_ceiling" CHECK ("events"."floor_price" <= "events"."ceiling_price"),
	CONSTRAINT "base_price_in_range" CHECK ("events"."base_price" >= "events"."floor_price" AND "events"."base_price" <= "events"."ceiling_price")
);
--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;