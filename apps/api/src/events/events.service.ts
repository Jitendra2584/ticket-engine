import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { eq, gte, count, sql } from 'drizzle-orm';
import { events, bookings } from '@repo/database';
import type { db as drizzleDb } from '@repo/database';
import { DATABASE } from '../database/database.constants';
import { PricingService } from '../pricing/pricing.service';
import { CacheService, CachePrefix, CacheTTL } from '../redis/cache.service';
import type { CreateEventDto, PricingRulesConfigDto } from './dto/create-event.dto';
import type { EventListItem, EventDetailResponse } from './dto/event-response.dto';

/** Type alias for the injected Drizzle database client. */
type Database = typeof drizzleDb;

/** Default pricing rules applied when none are provided during event creation. */
const DEFAULT_PRICING_RULES: PricingRulesConfigDto = {
  timeRule: { enabled: true, weight: 1 },
  demandRule: { enabled: true, weight: 1 },
  inventoryRule: { enabled: true, weight: 1 },
};

@Injectable()
export class EventsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly pricingService: PricingService,
    private readonly cache: CacheService,
  ) {}

  /**
   * Returns all events with their computed current price and availability.
   * For each event, counts recent bookings (last 60 min) to feed the demand rule.
   */
  async findAll(): Promise<EventListItem[]> {
    // Try cache first
    const cached = await this.cache.get<EventListItem[]>(CachePrefix.EVENT_LIST);
    if (cached) return cached;

    const now = new Date();
    const sixtyMinutesAgo = new Date(now.getTime() - 60 * 60 * 1000);

    // Subquery: count recent bookings per event
    const recentBookingsSq = this.db
      .select({
        eventId: bookings.eventId,
        recentCount: count().as('recent_count'),
      })
      .from(bookings)
      .where(gte(bookings.bookedAt, sixtyMinutesAgo))
      .groupBy(bookings.eventId)
      .as('recent_bookings');

    const rows = await this.db
      .select({
        id: events.id,
        name: events.name,
        date: events.date,
        venue: events.venue,
        totalTickets: events.totalTickets,
        bookedTickets: events.bookedTickets,
        basePrice: events.basePrice,
        floorPrice: events.floorPrice,
        ceilingPrice: events.ceilingPrice,
        pricingRules: events.pricingRules,
        recentCount: sql<number>`coalesce(${recentBookingsSq.recentCount}, 0)`,
      })
      .from(events)
      .leftJoin(recentBookingsSq, eq(events.id, recentBookingsSq.eventId));

    const result = rows.map((row) => {
      const basePrice = parseFloat(row.basePrice);
      const floorPrice = parseFloat(row.floorPrice);
      const ceilingPrice = parseFloat(row.ceilingPrice);
      const config = row.pricingRules ;
      const rules = this.pricingService.buildRules(config);

      const breakdown = this.pricingService.computePrice(
        basePrice,
        floorPrice,
        ceilingPrice,
        rules,
        {
          eventDate: row.date,
          now,
          totalTickets: row.totalTickets,
          bookedTickets: row.bookedTickets,
          recentBookingsCount: Number(row.recentCount),
        },
      );

      return {
        id: row.id,
        name: row.name,
        date: row.date.toISOString(),
        venue: row.venue,
        currentPrice: breakdown.finalPrice,
        availableTickets: row.totalTickets - row.bookedTickets,
        totalTickets: row.totalTickets,
      };
    });

    // Cache the result
    await this.cache.set(CachePrefix.EVENT_LIST, result, CacheTTL.EVENT);
    return result;
  }

  /**
   * Returns a single event by ID with full price breakdown.
   * Throws NotFoundException if the event does not exist.
   */
  async findOne(id: number): Promise<EventDetailResponse> {
    // Try cache first
    const cacheKey = `${CachePrefix.EVENT_DETAIL}:${id}`;
    const cached = await this.cache.get<EventDetailResponse>(cacheKey);
    if (cached) return cached;

    const now = new Date();
    const sixtyMinutesAgo = new Date(now.getTime() - 60 * 60 * 1000);

    const [event] = await this.db
      .select()
      .from(events)
      .where(eq(events.id, id));

    if (!event) {
      throw new NotFoundException(`Event with id ${id} not found`);
    }

    // Count recent bookings for this event
    const [recentResult] = await this.db
      .select({ recentCount: count() })
      .from(bookings)
      .where(
        sql`${bookings.eventId} = ${id} AND ${bookings.bookedAt} >= ${sixtyMinutesAgo.toISOString()}`,
      );

    const recentBookingsCount = recentResult ? Number(recentResult.recentCount) : 0;

    const basePrice = parseFloat(event.basePrice);
    const floorPrice = parseFloat(event.floorPrice);
    const ceilingPrice = parseFloat(event.ceilingPrice);
    const config = event.pricingRules;
    const rules = this.pricingService.buildRules(config);

    const priceBreakdown = this.pricingService.computePrice(
      basePrice,
      floorPrice,
      ceilingPrice,
      rules,
      {
        eventDate: event.date,
        now,
        totalTickets: event.totalTickets,
        bookedTickets: event.bookedTickets,
        recentBookingsCount,
      },
    );

    const result: EventDetailResponse = {
      id: event.id,
      name: event.name,
      date: event.date.toISOString(),
      venue: event.venue,
      description: event.description,
      totalTickets: event.totalTickets,
      bookedTickets: event.bookedTickets,
      availableTickets: event.totalTickets - event.bookedTickets,
      basePrice,
      floorPrice,
      ceilingPrice,
      pricingRules: event.pricingRules ,
      priceBreakdown,
    };

    // Cache the result
    await this.cache.set(cacheKey, result, CacheTTL.EVENT);
    return result;
  }

  /**
   * Creates a new event. Sets currentPrice = basePrice and applies
   * default pricing rules if none are provided.
   */
  async create(dto: CreateEventDto) {
    const pricingRules = dto.pricingRules ?? DEFAULT_PRICING_RULES;

    const [created] = await this.db
      .insert(events)
      .values({
        name: dto.name,
        date: new Date(dto.date),
        venue: dto.venue,
        description: dto.description ?? '',
        totalTickets: dto.totalTickets,
        basePrice: String(dto.basePrice),
        currentPrice: String(dto.basePrice),
        floorPrice: String(dto.floorPrice),
        ceilingPrice: String(dto.ceilingPrice),
        pricingRules,
      })
      .returning();

    // Invalidate event list cache so the new event appears immediately
    await this.cache.del(CachePrefix.EVENT_LIST);

    return created;
  }
}
