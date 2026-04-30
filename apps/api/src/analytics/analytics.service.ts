import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { eq, sql, count } from 'drizzle-orm';
import { events, bookings } from '@repo/database';
import type { db as drizzleDb } from '@repo/database';
import { DATABASE } from '../database/database.constants';

/** Type alias for the injected Drizzle database client. */
type Database = typeof drizzleDb;

/** Metrics for a single event. */
export interface EventAnalytics {
  eventId: number;
  eventName: string;
  totalTicketsSold: number;
  totalRevenue: number;
  averagePricePaid: number;
  remainingTickets: number;
}

/** System-wide metrics across all events. */
export interface SystemSummary {
  totalEvents: number;
  totalBookings: number;
  totalRevenue: number;
  totalTicketsSold: number;
}

@Injectable()
export class AnalyticsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /**
   * Returns analytics metrics for a specific event.
   * Throws NotFoundException if the event does not exist.
   */
  async getEventAnalytics(id: number): Promise<EventAnalytics> {
    const [event] = await this.db
      .select()
      .from(events)
      .where(eq(events.id, id));

    if (!event) {
      throw new NotFoundException(`Event with id ${id} not found`);
    }

    const eventBookings = await this.db
      .select()
      .from(bookings)
      .where(eq(bookings.eventId, id));

    let totalTicketsSold = 0;
    let totalRevenue = 0;

    for (const booking of eventBookings) {
      totalTicketsSold += booking.quantity;
      totalRevenue += parseFloat(booking.pricePaid) * booking.quantity;
    }

    const averagePricePaid =
      totalTicketsSold > 0 ? totalRevenue / totalTicketsSold : 0;

    const remainingTickets = event.totalTickets - event.bookedTickets;

    return {
      eventId: event.id,
      eventName: event.name,
      totalTicketsSold,
      totalRevenue,
      averagePricePaid,
      remainingTickets,
    };
  }

  /**
   * Returns system-wide summary metrics across all events.
   */
  async getSystemSummary(): Promise<SystemSummary> {
    const [eventCountResult] = await this.db
      .select({ totalEvents: count() })
      .from(events);

    const totalEvents = eventCountResult ? Number(eventCountResult.totalEvents) : 0;

    const [bookingAggResult] = await this.db
      .select({
        totalBookings: count(),
        totalRevenue: sql<string>`coalesce(sum(${bookings.pricePaid}::numeric * ${bookings.quantity}), 0)`,
        totalTicketsSold: sql<string>`coalesce(sum(${bookings.quantity}), 0)`,
      })
      .from(bookings);

    const totalBookings = bookingAggResult
      ? Number(bookingAggResult.totalBookings)
      : 0;
    const totalRevenue = bookingAggResult
      ? parseFloat(bookingAggResult.totalRevenue)
      : 0;
    const totalTicketsSold = bookingAggResult
      ? parseFloat(bookingAggResult.totalTicketsSold)
      : 0;

    return {
      totalEvents,
      totalBookings,
      totalRevenue,
      totalTicketsSold,
    };
  }
}
