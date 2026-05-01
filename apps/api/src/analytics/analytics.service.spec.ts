import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function fakeEventRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    name: 'Test Event',
    date: new Date('2025-09-01T20:00:00Z'),
    venue: 'Arena',
    description: 'desc',
    totalTickets: 100,
    bookedTickets: 30,
    basePrice: '50.00',
    currentPrice: '50.00',
    floorPrice: '30.00',
    ceilingPrice: '150.00',
    pricingRules: {
      timeRule: { enabled: true, weight: 1 },
      demandRule: { enabled: true, weight: 1 },
      inventoryRule: { enabled: true, weight: 1 },
    },
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/*  Drizzle mock                                                       */
/*                                                                     */
/*  getEventAnalytics uses:                                            */
/*    db.select().from(events).where(eq(events.id, id))  → event row  */
/*    db.select({agg}).from(bookings).where(...)          → agg row    */
/*                                                                     */
/*  getSystemSummary uses:                                             */
/*    db.select({count}).from(events)                     → count row  */
/*    db.select({agg}).from(bookings)                     → agg row    */
/* ------------------------------------------------------------------ */

function createMockDb() {
  const chains: Array<{
    from: ReturnType<typeof vi.fn>;
    where: ReturnType<typeof vi.fn>;
  }> = [];

  let callIndex = 0;

  function makeChain(resolvedValue: unknown[]) {
    const chain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue(resolvedValue),
    };
    chains.push(chain);
    return chain;
  }

  const selectFn = vi.fn();

  const db = { select: selectFn };

  return {
    db,
    selectFn,
    /**
     * Route select calls for getEventAnalytics:
     *   1st → event query
     *   2nd → aggregation query
     */
    routeEventAnalytics(eventRows: unknown[], aggRows: unknown[]) {
      callIndex = 0;
      chains.length = 0;
      const eventChain = makeChain(eventRows);
      const aggChain = makeChain(aggRows);
      selectFn.mockImplementation(() => {
        callIndex++;
        return callIndex === 1 ? eventChain : aggChain;
      });
    },
    /**
     * Route select calls for getSystemSummary:
     *   1st → event count query (no .where)
     *   2nd → booking aggregation query (no .where)
     */
    routeSystemSummary(eventCountRows: unknown[], bookingAggRows: unknown[]) {
      callIndex = 0;
      chains.length = 0;

      // Event count chain: select().from() resolves directly (no .where)
      const eventCountChain = {
        from: vi.fn().mockResolvedValue(eventCountRows),
        where: vi.fn(),
      };
      chains.push(eventCountChain);

      // Booking agg chain: select().from() resolves directly (no .where)
      const bookingAggChain = {
        from: vi.fn().mockResolvedValue(bookingAggRows),
        where: vi.fn(),
      };
      chains.push(bookingAggChain);

      selectFn.mockImplementation(() => {
        callIndex++;
        return callIndex === 1 ? eventCountChain : bookingAggChain;
      });
    },
  };
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let mocks: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    mocks = createMockDb();
    service = new AnalyticsService(mocks.db as any);
  });

  /* ---------------------------------------------------------------- */
  /*  getEventAnalytics                                                */
  /* ---------------------------------------------------------------- */

  describe('getEventAnalytics', () => {
    it('should throw NotFoundException when event does not exist', async () => {
      mocks.routeEventAnalytics([], []);

      await expect(service.getEventAnalytics(999)).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.getEventAnalytics(999)).rejects.toThrow(
        'Event with id 999 not found',
      );
    });

    it('should return correct analytics for an event with bookings', async () => {
      const event = fakeEventRow({ id: 5, name: 'Concert', totalTickets: 200, bookedTickets: 50 });
      const agg = { totalTicketsSold: '50', totalRevenue: '5000.00' };
      mocks.routeEventAnalytics([event], [agg]);

      const result = await service.getEventAnalytics(5);

      expect(result).toEqual({
        eventId: 5,
        eventName: 'Concert',
        totalTicketsSold: 50,
        totalRevenue: 5000,
        averagePricePaid: 100, // 5000 / 50
        remainingTickets: 150, // 200 - 50
      });
    });

    it('should return 0 for averagePricePaid when no tickets sold', async () => {
      const event = fakeEventRow({ totalTickets: 100, bookedTickets: 0 });
      const agg = { totalTicketsSold: '0', totalRevenue: '0' };
      mocks.routeEventAnalytics([event], [agg]);

      const result = await service.getEventAnalytics(1);

      expect(result.totalTicketsSold).toBe(0);
      expect(result.totalRevenue).toBe(0);
      expect(result.averagePricePaid).toBe(0);
      expect(result.remainingTickets).toBe(100);
    });

    it('should default to 0 when aggregation result is falsy', async () => {
      const event = fakeEventRow();
      mocks.routeEventAnalytics([event], [undefined]);

      const result = await service.getEventAnalytics(1);

      expect(result.totalTicketsSold).toBe(0);
      expect(result.totalRevenue).toBe(0);
      expect(result.averagePricePaid).toBe(0);
    });

    it('should parse totalTicketsSold as integer and totalRevenue as float', async () => {
      const event = fakeEventRow();
      const agg = { totalTicketsSold: '7', totalRevenue: '523.75' };
      mocks.routeEventAnalytics([event], [agg]);

      const result = await service.getEventAnalytics(1);

      expect(result.totalTicketsSold).toBe(7);
      expect(typeof result.totalTicketsSold).toBe('number');
      expect(result.totalRevenue).toBe(523.75);
      expect(typeof result.totalRevenue).toBe('number');
    });

    it('should compute remainingTickets as totalTickets - bookedTickets', async () => {
      const event = fakeEventRow({ totalTickets: 500, bookedTickets: 123 });
      const agg = { totalTicketsSold: '123', totalRevenue: '10000' };
      mocks.routeEventAnalytics([event], [agg]);

      const result = await service.getEventAnalytics(1);

      expect(result.remainingTickets).toBe(377);
    });

    it('should compute correct averagePricePaid with fractional values', async () => {
      const event = fakeEventRow();
      const agg = { totalTicketsSold: '3', totalRevenue: '250.50' };
      mocks.routeEventAnalytics([event], [agg]);

      const result = await service.getEventAnalytics(1);

      expect(result.averagePricePaid).toBeCloseTo(83.5); // 250.50 / 3
    });
  });

  /* ---------------------------------------------------------------- */
  /*  getSystemSummary                                                 */
  /* ---------------------------------------------------------------- */

  describe('getSystemSummary', () => {
    it('should return correct summary with events and bookings', async () => {
      mocks.routeSystemSummary(
        [{ totalEvents: 10 }],
        [{ totalBookings: 50, totalRevenue: '25000.00', totalTicketsSold: '200' }],
      );

      const result = await service.getSystemSummary();

      expect(result).toEqual({
        totalEvents: 10,
        totalBookings: 50,
        totalRevenue: 25000,
        totalTicketsSold: 200,
      });
    });

    it('should return all zeros when no events or bookings exist', async () => {
      mocks.routeSystemSummary(
        [{ totalEvents: 0 }],
        [{ totalBookings: 0, totalRevenue: '0', totalTicketsSold: '0' }],
      );

      const result = await service.getSystemSummary();

      expect(result).toEqual({
        totalEvents: 0,
        totalBookings: 0,
        totalRevenue: 0,
        totalTicketsSold: 0,
      });
    });

    it('should default totalEvents to 0 when eventCountResult is falsy', async () => {
      mocks.routeSystemSummary(
        [undefined],
        [{ totalBookings: 5, totalRevenue: '500', totalTicketsSold: '10' }],
      );

      const result = await service.getSystemSummary();

      expect(result.totalEvents).toBe(0);
    });

    it('should default booking aggregates to 0 when bookingAggResult is falsy', async () => {
      mocks.routeSystemSummary([{ totalEvents: 3 }], [undefined]);

      const result = await service.getSystemSummary();

      expect(result.totalBookings).toBe(0);
      expect(result.totalRevenue).toBe(0);
      expect(result.totalTicketsSold).toBe(0);
    });

    it('should parse totalRevenue as float and totalTicketsSold as float', async () => {
      mocks.routeSystemSummary(
        [{ totalEvents: 1 }],
        [{ totalBookings: 2, totalRevenue: '1234.56', totalTicketsSold: '15' }],
      );

      const result = await service.getSystemSummary();

      expect(result.totalRevenue).toBe(1234.56);
      expect(typeof result.totalRevenue).toBe('number');
      expect(result.totalTicketsSold).toBe(15);
      expect(typeof result.totalTicketsSold).toBe('number');
    });
  });
});
