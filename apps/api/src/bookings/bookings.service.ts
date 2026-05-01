import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { eq, gte, count, sql } from 'drizzle-orm';
import { events, bookings } from '@repo/database';
import type { db as drizzleDb } from '@repo/database';
import { DATABASE } from '../database/database.constants';
import { PricingService } from '../pricing/pricing.service';
import type { CreateBookingDto } from './dto/create-booking.dto';
import type { BookingResponse } from './dto/booking-response.dto';

/** Type alias for the injected Drizzle database client. */
type Database = typeof drizzleDb;

@Injectable()
export class BookingsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly pricingService: PricingService,
  ) {}

  /**
   * Creates a booking within a serialized transaction.
   * Uses SELECT ... FOR UPDATE to lock the event row, preventing concurrent overbooking.
   * Computes the current dynamic price at booking time and stores it as a snapshot.
   */
  async createBooking(dto: CreateBookingDto): Promise<BookingResponse> {
    const result = await this.db.transaction(async (tx) => {
      // Lock the event row to serialize concurrent bookings
      const [event] = await tx
        .select()
        .from(events)
        .where(eq(events.id, dto.eventId))
        .for('update');

      if (!event) {
        throw new NotFoundException(`Event with id ${dto.eventId} not found`);
      }

      // Check ticket availability
      const available = event.totalTickets - event.bookedTickets;
      if (dto.quantity > available) {
        throw new ConflictException(
          `Not enough tickets available. Requested: ${dto.quantity}, Available: ${available}`,
        );
      }

      // Count recent bookings (last 60 minutes) for the demand pricing rule
      const now = new Date();
      const sixtyMinutesAgo = new Date(now.getTime() - 60 * 60 * 1000);

      const [recentResult] = await tx
        .select({ recentCount: count() })
        .from(bookings)
        .where(
          sql`${bookings.eventId} = ${dto.eventId} AND ${bookings.bookedAt} >= ${sixtyMinutesAgo.toISOString()}`,
        );

      const recentBookingsCount = recentResult
        ? Number(recentResult.recentCount)
        : 0;

      // Compute current dynamic price
      const basePrice = parseFloat(event.basePrice);
      const floorPrice = parseFloat(event.floorPrice);
      const ceilingPrice = parseFloat(event.ceilingPrice);
      const config = event.pricingRules;
      const rules = this.pricingService.buildRules(config);

      const breakdown = this.pricingService.computePrice(
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

      // Reject if the price the user saw no longer matches the server price
      if (
        Math.abs(dto.expectedPrice - breakdown.finalPrice) > 0.01
      ) {
        throw new ConflictException({
          code: 'PRICE_CHANGED',
          message: 'The price has changed since you last viewed it. Please review the new price.',
          currentPrice: breakdown.finalPrice,
        });
      }

      const newBookedTickets = event.bookedTickets + dto.quantity;

      // Recalculate the event's currentPrice based on the NEW inventory state
      const postBookingBreakdown = this.pricingService.computePrice(
        basePrice,
        floorPrice,
        ceilingPrice,
        rules,
        {
          eventDate: event.date,
          now,
          totalTickets: event.totalTickets,
          bookedTickets: newBookedTickets,
          recentBookingsCount: recentBookingsCount + 1,
        },
      );

      // Insert booking at the price user agreed to, update event with new state
      const [[booking]] = await Promise.all([
        tx
          .insert(bookings)
          .values({
            eventId: dto.eventId,
            userEmail: dto.userEmail,
            quantity: dto.quantity,
            pricePaid: String(breakdown.finalPrice),
          })
          .returning(),
        tx
          .update(events)
          .set({
            bookedTickets: sql`${events.bookedTickets} + ${dto.quantity}`,
            currentPrice: String(postBookingBreakdown.finalPrice),
          })
          .where(eq(events.id, dto.eventId)),
      ]);

      return booking;
    });

    return {
      id: result.id,
      eventId: result.eventId,
      userEmail: result.userEmail,
      quantity: result.quantity,
      pricePaid: parseFloat(result.pricePaid),
      bookedAt: result.bookedAt.toISOString(),
    };
  }

  /**
   * Returns all bookings for a given event.
   */
  async findByEventId(eventId: number): Promise<BookingResponse[]> {
    const rows = await this.db
      .select()
      .from(bookings)
      .where(eq(bookings.eventId, eventId));

    return rows.map((row) => ({
      id: row.id,
      eventId: row.eventId,
      userEmail: row.userEmail,
      quantity: row.quantity,
      pricePaid: parseFloat(row.pricePaid),
      bookedAt: row.bookedAt.toISOString(),
    }));
  }

  /**
   * Returns all bookings for a given user email.
   */
  async findByEmail(email: string): Promise<BookingResponse[]> {
    const rows = await this.db
      .select()
      .from(bookings)
      .where(eq(bookings.userEmail, email));

    return rows.map((row) => ({
      id: row.id,
      eventId: row.eventId,
      userEmail: row.userEmail,
      quantity: row.quantity,
      pricePaid: parseFloat(row.pricePaid),
      bookedAt: row.bookedAt.toISOString(),
    }));
  }
}
