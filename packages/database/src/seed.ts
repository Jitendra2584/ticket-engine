import { db, events, bookings } from "./index";

/** Helper to create a Date a given number of days from now. */
function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

/** Default pricing rules with all three rules enabled at weight 1. */
const ALL_RULES_ENABLED = {
  timeRule: { enabled: true, weight: 1 },
  demandRule: { enabled: true, weight: 1 },
  inventoryRule: { enabled: true, weight: 1 },
};

async function seed() {
  console.log("🌱 Seeding database...");

  // Clean slate — delete bookings first (FK dependency), then events
  await db.delete(bookings);
  await db.delete(events);
  console.log("  Cleared existing bookings and events.");

  const sampleEvents = [
    {
      name: "Summer Music Festival",
      date: daysFromNow(35),
      venue: "Central Park Amphitheater",
      description:
        "A weekend of live music featuring top artists from around the world.",
      totalTickets: 500,
      basePrice: "50.00",
      currentPrice: "50.00",
      floorPrice: "30.00",
      ceilingPrice: "150.00",
      pricingRules: ALL_RULES_ENABLED,
    },
    {
      name: "Tech Conference 2025",
      date: daysFromNow(14),
      venue: "Convention Center Hall A",
      description:
        "Annual technology conference with keynotes, workshops, and networking.",
      totalTickets: 200,
      basePrice: "100.00",
      currentPrice: "100.00",
      floorPrice: "80.00",
      ceilingPrice: "300.00",
      pricingRules: ALL_RULES_ENABLED,
    },
    {
      name: "Comedy Night",
      date: daysFromNow(3),
      venue: "Downtown Comedy Club",
      description:
        "An evening of stand-up comedy featuring local and touring comedians.",
      totalTickets: 50,
      basePrice: "25.00",
      currentPrice: "25.00",
      floorPrice: "15.00",
      ceilingPrice: "75.00",
      pricingRules: ALL_RULES_ENABLED,
    },
    {
      name: "New Year's Eve Gala",
      date: daysFromNow(1),
      venue: "Grand Ballroom Hotel",
      description:
        "Ring in the new year with dinner, dancing, and a midnight champagne toast.",
      totalTickets: 100,
      basePrice: "200.00",
      currentPrice: "200.00",
      floorPrice: "150.00",
      ceilingPrice: "500.00",
      pricingRules: ALL_RULES_ENABLED,
    },
    {
      name: "Jazz in the Park",
      date: daysFromNow(10),
      venue: "Riverside Park Bandshell",
      description:
        "Smooth jazz under the stars with food trucks and craft beverages.",
      totalTickets: 150,
      basePrice: "35.00",
      currentPrice: "35.00",
      floorPrice: "20.00",
      ceilingPrice: "100.00",
      pricingRules: ALL_RULES_ENABLED,
    },
  ];

  const created = await db.insert(events).values(sampleEvents).returning();

  console.log(`  ✅ Created ${created.length} sample events:`);
  for (const event of created) {
    console.log(
      `     - [${event.id}] ${event.name} (${event.venue}, base: $${event.basePrice})`
    );
  }

  console.log("\n🌱 Seeding complete!");
  process.exit(0);
}

seed().catch((error: unknown) => {
  console.error("❌ Seeding failed:", error);
  process.exit(1);
});
