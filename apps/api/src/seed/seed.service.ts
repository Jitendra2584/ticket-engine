import { Inject, Injectable } from '@nestjs/common';
import { events, bookings } from '@repo/database';
import type { db as drizzleDb } from '@repo/database';
import { DATABASE } from '../database/database.constants';
import { CacheService, CachePrefix } from '../redis/cache.service';

/** Type alias for the injected Drizzle database client. */
type Database = typeof drizzleDb;

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

@Injectable()
export class SeedService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly cacheService: CacheService,
  ) {}

  /**
   * Seeds the database with sample events. Deletes existing bookings and
   * events first to ensure a clean slate, then inserts five sample events
   * with varied pricing configurations.
   */
  async seed() {
    // Clean slate — delete bookings first (FK dependency), then events
    await this.db.delete(bookings);
    await this.db.delete(events);

    const sampleEvents = [
      {
        name: 'Summer Music Festival',
        date: daysFromNow(35),
        venue: 'Central Park Amphitheater',
        description: 'A weekend of live music featuring top artists from around the world.',
        totalTickets: 500,
        basePrice: '50.00',
        currentPrice: '50.00',
        floorPrice: '30.00',
        ceilingPrice: '150.00',
        pricingRules: ALL_RULES_ENABLED,
      },
      {
        name: 'Tech Conference 2025',
        date: daysFromNow(14),
        venue: 'Convention Center Hall A',
        description: 'Annual technology conference with keynotes, workshops, and networking.',
        totalTickets: 200,
        basePrice: '100.00',
        currentPrice: '100.00',
        floorPrice: '80.00',
        ceilingPrice: '300.00',
        pricingRules: ALL_RULES_ENABLED,
      },
      {
        name: 'Comedy Night',
        date: daysFromNow(3),
        venue: 'Downtown Comedy Club',
        description: 'An evening of stand-up comedy featuring local and touring comedians.',
        totalTickets: 50,
        basePrice: '25.00',
        currentPrice: '25.00',
        floorPrice: '15.00',
        ceilingPrice: '75.00',
        pricingRules: ALL_RULES_ENABLED,
      },
      {
        name: "New Year's Eve Gala",
        date: daysFromNow(1),
        venue: 'Grand Ballroom Hotel',
        description: 'Ring in the new year with dinner, dancing, and a midnight champagne toast.',
        totalTickets: 100,
        basePrice: '200.00',
        currentPrice: '200.00',
        floorPrice: '150.00',
        ceilingPrice: '500.00',
        pricingRules: ALL_RULES_ENABLED,
      },
      {
        name: 'Jazz in the Park',
        date: daysFromNow(10),
        venue: 'Riverside Park Bandshell',
        description: 'Smooth jazz under the stars with food trucks and craft beverages.',
        totalTickets: 150,
        basePrice: '35.00',
        currentPrice: '35.00',
        floorPrice: '20.00',
        ceilingPrice: '100.00',
        pricingRules: ALL_RULES_ENABLED,
      },
    ];

    const created = await this.db.insert(events).values(sampleEvents).returning();

    // Flush all event and booking caches after seed
    await this.cacheService.del(
      CachePrefix.EVENT_LIST,
      ...created.map((e) => `${CachePrefix.EVENT_DETAIL}:${e.id}`),
      ...created.map((e) => `${CachePrefix.RECENT_BOOKINGS}:${e.id}`),
    );

    return created;
  }
}
