import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { BookingsService } from './bookings.service';
import type { PricingService } from '../pricing/pricing.service';
import type { PriceBreakdown } from '../pricing/pricing.types';

/* ------------------------------------------------------------------ */
/*  Mock factories                                                     */
/* ------------------------------------------------------------------ */

/** Creates a fake event row matching the Drizzle select shape. */
function fakeEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    name: 'Test Event',
    date: new Date('2025-09-01T20:00:00Z'),
    venue: 'Arena',
    description: 'desc',
    totalTickets: 100,
    bookedTickets: 10,
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

/** Creates a fake booking row matching the Drizzle insert().returning() shape. */
function fakeBookingRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 42,
    eventId: 1,
    userEmail: 'user@test.com',
    quantity: 2,
    pricePaid: '50.00',
    bookedAt: new Date('2025-07-01T12:00:00Z'),
    ...overrides,
  };
}

function makeBreakdown(finalPrice: number): PriceBreakdown {
  return {
    basePrice: 50,
    rules: [],
    sumOfWeightedAdjustments: 0,
    computedPrice: finalPrice,
    finalPrice,
    floorPrice: 30,
    ceilingPrice: 150,
  };
}

/* ------------------------------------------------------------------ */
/*  Drizzle mock builder                                               */
/*                                                                     */
/*  Drizzle uses a chained builder pattern:                            */
/*    db.select().from(table).where(cond).for('update')               */
/*    db.insert(table).values(v).returning()                           */
/*    db.update(table).set(s).where(cond)                              */
/*                                                                     */
/*  We build a minimal mock that supports these chains.                */
/* ------------------------------------------------------------------ */

function createMockDb() {
  // --- select chain ---
  const selectChain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    for: vi.fn().mockResolvedValue([]),
  };
  const selectFn = vi.fn(() => selectChain);

  // --- select for count (recent bookings) ---
  // We need a second select chain for the count query.
  // The first .from() call is the event query (returns selectChain),
  // the second .from() call is the count query.
  const countSelectChain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue([{ recentCount: 0 }]),
  };

  // --- insert chain ---
  const insertChain = {
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([fakeBookingRow()]),
  };
  const insertFn = vi.fn(() => insertChain);

  // --- update chain ---
  const updateChain = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(undefined),
  };
  const updateFn = vi.fn(() => updateChain);

  // --- transaction: executes the callback with a tx proxy ---
  const transactionFn = vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => {
    // Build a tx object that routes select calls properly.
    // First select() → event query (with .for), second select() → count query.
    let selectCallCount = 0;
    const txSelectFn = vi.fn(() => {
      selectCallCount++;
      if (selectCallCount === 1) return selectChain;
      return countSelectChain;
    });

    const tx = {
      select: txSelectFn,
      insert: insertFn,
      update: updateFn,
    };
    return cb(tx);
  });

  // --- top-level db for findByEventId / findByEmail ---
  const querySelectChain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue([]),
  };
  const querySelectFn = vi.fn(() => querySelectChain);

  const db = {
    transaction: transactionFn,
    select: querySelectFn,
    insert: insertFn,
    update: updateFn,
  };

  return {
    db,
    selectChain,
    countSelectChain,
    insertChain,
    updateChain,
    querySelectChain,
    transactionFn,
  };
}

function createMockPricingService() {
  return {
    buildRules: vi.fn().mockReturnValue([]),
    computePrice: vi.fn().mockReturnValue(makeBreakdown(50)),
  } as unknown as PricingService & {
    buildRules: ReturnType<typeof vi.fn>;
    computePrice: ReturnType<typeof vi.fn>;
  };
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('BookingsService', () => {
  let service: BookingsService;
  let mocks: ReturnType<typeof createMockDb>;
  let pricingService: ReturnType<typeof createMockPricingService>;

  beforeEach(() => {
    mocks = createMockDb();
    pricingService = createMockPricingService();
    service = new BookingsService(mocks.db as any, pricingService);
  });

  /* ---------------------------------------------------------------- */
  /*  createBooking                                                    */
  /* ---------------------------------------------------------------- */

  describe('createBooking', () => {
    const dto = {
      eventId: 1,
      userEmail: 'user@test.com',
      quantity: 2,
      expectedPrice: 50,
    };

    it('should throw NotFoundException when event does not exist', async () => {
      // select().from().where().for() returns empty array
      mocks.selectChain.for.mockResolvedValueOnce([]);

      await expect(service.createBooking(dto)).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.createBooking(dto)).rejects.toThrow(
        'Event with id 1 not found',
      );
    });

    it('should throw ConflictException when not enough tickets available', async () => {
      const event = fakeEvent({ totalTickets: 10, bookedTickets: 9 });
      mocks.selectChain.for.mockResolvedValue([event]);

      await expect(
        service.createBooking({ ...dto, quantity: 5 }),
      ).rejects.toThrow(ConflictException);
      await expect(
        service.createBooking({ ...dto, quantity: 5 }),
      ).rejects.toThrow('Not enough tickets available');
    });

    it('should throw ConflictException with PRICE_CHANGED when expectedPrice differs', async () => {
      const event = fakeEvent();
      mocks.selectChain.for.mockResolvedValue([event]);
      // Server computes price = 75, but user sent expectedPrice = 50
      pricingService.computePrice.mockReturnValue(makeBreakdown(75));

      try {
        await service.createBooking(dto);
        expect.unreachable('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ConflictException);
        const response = (err as ConflictException).getResponse() as Record<string, unknown>;
        expect(response.code).toBe('PRICE_CHANGED');
        expect(response.currentPrice).toBe(75);
      }
    });

    it('should NOT throw PRICE_CHANGED when price difference is within tolerance (0.01)', async () => {
      const event = fakeEvent();
      mocks.selectChain.for.mockResolvedValue([event]);
      // Server computes 50.005, user sent 50 → diff = 0.005 < 0.01 → OK
      pricingService.computePrice.mockReturnValue(makeBreakdown(50.005));
      mocks.insertChain.returning.mockResolvedValue([fakeBookingRow()]);

      const result = await service.createBooking(dto);
      expect(result.id).toBe(42);
    });

    it('should create booking and return correctly mapped response on success', async () => {
      const event = fakeEvent();
      mocks.selectChain.for.mockResolvedValue([event]);
      pricingService.computePrice.mockReturnValue(makeBreakdown(50));

      const bookingRow = fakeBookingRow({
        id: 99,
        eventId: 1,
        userEmail: 'buyer@test.com',
        quantity: 3,
        pricePaid: '65.50',
        bookedAt: new Date('2025-08-15T10:30:00Z'),
      });
      mocks.insertChain.returning.mockResolvedValue([bookingRow]);

      const result = await service.createBooking({
        ...dto,
        userEmail: 'buyer@test.com',
        quantity: 3,
      });

      expect(result).toEqual({
        id: 99,
        eventId: 1,
        userEmail: 'buyer@test.com',
        quantity: 3,
        pricePaid: 65.5,
        bookedAt: '2025-08-15T10:30:00.000Z',
      });
    });

    it('should call pricingService.buildRules with event pricingRules config', async () => {
      const config = {
        timeRule: { enabled: true, weight: 2 },
        demandRule: { enabled: false, weight: 1 },
        inventoryRule: { enabled: true, weight: 1.5 },
      };
      const event = fakeEvent({ pricingRules: config });
      mocks.selectChain.for.mockResolvedValue([event]);
      pricingService.computePrice.mockReturnValue(makeBreakdown(50));
      mocks.insertChain.returning.mockResolvedValue([fakeBookingRow()]);

      await service.createBooking(dto);

      expect(pricingService.buildRules).toHaveBeenCalledWith(config);
    });

    it('should call computePrice twice: once for booking price, once for post-booking event price', async () => {
      const event = fakeEvent({ bookedTickets: 10 });
      mocks.selectChain.for.mockResolvedValue([event]);
      pricingService.computePrice.mockReturnValue(makeBreakdown(50));
      mocks.insertChain.returning.mockResolvedValue([fakeBookingRow()]);

      await service.createBooking(dto);

      expect(pricingService.computePrice).toHaveBeenCalledTimes(2);

      // First call: pre-booking state (bookedTickets = 10)
      const firstCallState = pricingService.computePrice.mock.calls[0][4];
      expect(firstCallState.bookedTickets).toBe(10);

      // Second call: post-booking state (bookedTickets = 10 + 2 = 12)
      const secondCallState = pricingService.computePrice.mock.calls[1][4];
      expect(secondCallState.bookedTickets).toBe(12);
      // recentBookingsCount should be incremented by 1 for post-booking calc
      expect(secondCallState.recentBookingsCount).toBe(
        firstCallState.recentBookingsCount + 1,
      );
    });

    it('should parse event prices as floats from string columns', async () => {
      const event = fakeEvent({
        basePrice: '99.99',
        floorPrice: '49.50',
        ceilingPrice: '199.99',
      });
      mocks.selectChain.for.mockResolvedValue([event]);
      pricingService.computePrice.mockReturnValue(makeBreakdown(99.99));
      mocks.insertChain.returning.mockResolvedValue([fakeBookingRow()]);

      await service.createBooking({ ...dto, expectedPrice: 99.99 });

      expect(pricingService.computePrice).toHaveBeenCalledWith(
        99.99,
        49.5,
        199.99,
        expect.anything(),
        expect.anything(),
      );
    });

    it('should default recentBookingsCount to 0 when count query returns falsy', async () => {
      const event = fakeEvent();
      mocks.selectChain.for.mockResolvedValue([event]);
      // Simulate count query returning undefined/null
      mocks.countSelectChain.where.mockResolvedValue([undefined]);
      pricingService.computePrice.mockReturnValue(makeBreakdown(50));
      mocks.insertChain.returning.mockResolvedValue([fakeBookingRow()]);

      await service.createBooking(dto);

      const firstCallState = pricingService.computePrice.mock.calls[0][4];
      expect(firstCallState.recentBookingsCount).toBe(0);
    });

    it('should pass correct recentBookingsCount when count query returns a value', async () => {
      const event = fakeEvent();
      mocks.selectChain.for.mockResolvedValue([event]);
      mocks.countSelectChain.where.mockResolvedValue([{ recentCount: 15 }]);
      pricingService.computePrice.mockReturnValue(makeBreakdown(50));
      mocks.insertChain.returning.mockResolvedValue([fakeBookingRow()]);

      await service.createBooking(dto);

      const firstCallState = pricingService.computePrice.mock.calls[0][4];
      expect(firstCallState.recentBookingsCount).toBe(15);
    });

    it('should insert booking with correct values', async () => {
      const event = fakeEvent();
      mocks.selectChain.for.mockResolvedValue([event]);
      pricingService.computePrice.mockReturnValue(makeBreakdown(62.5));
      mocks.insertChain.returning.mockResolvedValue([fakeBookingRow()]);

      await service.createBooking({
        eventId: 1,
        userEmail: 'test@example.com',
        quantity: 3,
        expectedPrice: 62.5,
      });

      expect(mocks.insertChain.values).toHaveBeenCalledWith({
        eventId: 1,
        userEmail: 'test@example.com',
        quantity: 3,
        pricePaid: '62.5',
      });
    });

    it('should reject when quantity exactly exceeds available (boundary)', async () => {
      const event = fakeEvent({ totalTickets: 5, bookedTickets: 5 });
      mocks.selectChain.for.mockResolvedValue([event]);

      await expect(
        service.createBooking({ ...dto, quantity: 1 }),
      ).rejects.toThrow('Not enough tickets available');
    });

    it('should succeed when quantity exactly equals available (boundary)', async () => {
      const event = fakeEvent({ totalTickets: 5, bookedTickets: 3 });
      mocks.selectChain.for.mockResolvedValue([event]);
      pricingService.computePrice.mockReturnValue(makeBreakdown(50));
      mocks.insertChain.returning.mockResolvedValue([fakeBookingRow({ quantity: 2 })]);

      const result = await service.createBooking({ ...dto, quantity: 2 });
      expect(result.id).toBe(42);
    });
  });

  /* ---------------------------------------------------------------- */
  /*  findByEventId                                                    */
  /* ---------------------------------------------------------------- */

  describe('findByEventId', () => {
    it('should return mapped booking responses', async () => {
      const rows = [
        fakeBookingRow({ id: 1, pricePaid: '100.50', bookedAt: new Date('2025-07-01T00:00:00Z') }),
        fakeBookingRow({ id: 2, pricePaid: '75.00', bookedAt: new Date('2025-07-02T00:00:00Z') }),
      ];
      mocks.querySelectChain.where.mockResolvedValue(rows);

      const result = await service.findByEventId(1);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        id: 1,
        eventId: 1,
        userEmail: 'user@test.com',
        quantity: 2,
        pricePaid: 100.5,
        bookedAt: '2025-07-01T00:00:00.000Z',
      });
      expect(result[1].pricePaid).toBe(75);
      expect(result[1].bookedAt).toBe('2025-07-02T00:00:00.000Z');
    });

    it('should return empty array when no bookings exist', async () => {
      mocks.querySelectChain.where.mockResolvedValue([]);

      const result = await service.findByEventId(999);

      expect(result).toEqual([]);
    });

    it('should parse pricePaid from string to number', async () => {
      mocks.querySelectChain.where.mockResolvedValue([
        fakeBookingRow({ pricePaid: '123.45' }),
      ]);

      const result = await service.findByEventId(1);

      expect(typeof result[0].pricePaid).toBe('number');
      expect(result[0].pricePaid).toBe(123.45);
    });

    it('should convert bookedAt Date to ISO string', async () => {
      const date = new Date('2025-12-25T18:30:00Z');
      mocks.querySelectChain.where.mockResolvedValue([
        fakeBookingRow({ bookedAt: date }),
      ]);

      const result = await service.findByEventId(1);

      expect(result[0].bookedAt).toBe('2025-12-25T18:30:00.000Z');
    });
  });

  /* ---------------------------------------------------------------- */
  /*  findByEmail                                                      */
  /* ---------------------------------------------------------------- */

  describe('findByEmail', () => {
    it('should return mapped booking responses for the given email', async () => {
      const rows = [
        fakeBookingRow({ id: 10, userEmail: 'alice@test.com', pricePaid: '80.00', bookedAt: new Date('2025-06-01T00:00:00Z') }),
      ];
      mocks.querySelectChain.where.mockResolvedValue(rows);

      const result = await service.findByEmail('alice@test.com');

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: 10,
        eventId: 1,
        userEmail: 'alice@test.com',
        quantity: 2,
        pricePaid: 80,
        bookedAt: '2025-06-01T00:00:00.000Z',
      });
    });

    it('should return empty array when no bookings exist for email', async () => {
      mocks.querySelectChain.where.mockResolvedValue([]);

      const result = await service.findByEmail('nobody@test.com');

      expect(result).toEqual([]);
    });

    it('should handle multiple bookings for the same email', async () => {
      const rows = [
        fakeBookingRow({ id: 1, eventId: 1 }),
        fakeBookingRow({ id: 2, eventId: 2 }),
        fakeBookingRow({ id: 3, eventId: 3 }),
      ];
      mocks.querySelectChain.where.mockResolvedValue(rows);

      const result = await service.findByEmail('user@test.com');

      expect(result).toHaveLength(3);
      expect(result.map((r) => r.id)).toEqual([1, 2, 3]);
    });
  });
});
