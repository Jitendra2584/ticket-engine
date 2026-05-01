import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { EventsService } from './events.service';
import type { PricingService } from '../pricing/pricing.service';
import type { CacheService } from '../redis/cache.service';
import type { PriceBreakdown } from '../pricing/pricing.types';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const defaultPricingRules = {
  timeRule: { enabled: true, weight: 1 },
  demandRule: { enabled: true, weight: 1 },
  inventoryRule: { enabled: true, weight: 1 },
};

function fakeEventRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    name: 'Test Event',
    date: new Date('2025-09-01T20:00:00Z'),
    venue: 'Arena',
    description: 'A great event',
    totalTickets: 100,
    bookedTickets: 20,
    basePrice: '80.00',
    currentPrice: '80.00',
    floorPrice: '40.00',
    ceilingPrice: '200.00',
    pricingRules: defaultPricingRules,
    recentCount: 0,
    ...overrides,
  };
}

function makeBreakdown(finalPrice: number): PriceBreakdown {
  return {
    basePrice: 80,
    rules: [],
    sumOfWeightedAdjustments: 0,
    computedPrice: finalPrice,
    finalPrice,
    floorPrice: 40,
    ceilingPrice: 200,
  };
}

function createMockPricingService() {
  return {
    buildRules: vi.fn().mockReturnValue([]),
    computePrice: vi.fn().mockReturnValue(makeBreakdown(80)),
  } as unknown as PricingService & {
    buildRules: ReturnType<typeof vi.fn>;
    computePrice: ReturnType<typeof vi.fn>;
  };
}

function createMockCacheService() {
  return {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    del: vi.fn().mockResolvedValue(undefined),
    getCount: vi.fn().mockResolvedValue(0),
    increment: vi.fn().mockResolvedValue(0),
    invalidateAfterBooking: vi.fn().mockResolvedValue(0),
    isAvailable: vi.fn().mockReturnValue(false),
  } as unknown as CacheService & Record<string, ReturnType<typeof vi.fn>>;
}

/* ------------------------------------------------------------------ */
/*  Drizzle mock                                                       */
/*                                                                     */
/*  findAll uses: db.select(...).from(...).where(...).groupBy(...)     */
/*                    .as(...)  (subquery)                             */
/*                db.select(...).from(...).leftJoin(...)               */
/*  findOne uses: db.select().from(...).where(...)                     */
/*                db.select({...}).from(...).where(...)                */
/*  create uses:  db.insert(...).values(...).returning()               */
/* ------------------------------------------------------------------ */

function createMockDb() {
  // --- subquery chain for findAll ---
  const subqueryChain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockReturnThis(),
    as: vi.fn().mockReturnValue({ recentCount: 'recent_count', eventId: 'event_id' }),
  };

  // --- main select chain for findAll (with leftJoin) ---
  const findAllChain = {
    from: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockResolvedValue([]),
  };

  // --- select chain for findOne event query ---
  const findOneEventChain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue([]),
  };

  // --- select chain for findOne count query ---
  const findOneCountChain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue([{ recentCount: 0 }]),
  };

  // Track select calls to route them properly
  let selectCallIndex = 0;
  const selectFn = vi.fn(() => {
    selectCallIndex++;
    return subqueryChain; // default, overridden per-test via routing
  });

  // --- insert chain ---
  const insertChain = {
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([]),
  };
  const insertFn = vi.fn(() => insertChain);

  const db = {
    select: selectFn,
    insert: insertFn,
  };

  return {
    db,
    selectFn,
    subqueryChain,
    findAllChain,
    findOneEventChain,
    findOneCountChain,
    insertChain,
    resetSelectRouting() {
      selectCallIndex = 0;
    },
    /** Route select calls: first → findAll subquery, second → findAll main query */
    routeFindAll(rows: unknown[]) {
      selectCallIndex = 0;
      selectFn.mockImplementation(() => {
        selectCallIndex++;
        if (selectCallIndex === 1) return subqueryChain;
        findAllChain.leftJoin.mockResolvedValue(rows);
        return findAllChain;
      });
    },
    /** Route select calls: first → event query, second → count query */
    routeFindOne(eventRows: unknown[], countRows: unknown[]) {
      selectCallIndex = 0;
      selectFn.mockImplementation(() => {
        selectCallIndex++;
        if (selectCallIndex === 1) {
          findOneEventChain.where.mockResolvedValue(eventRows);
          return findOneEventChain;
        }
        findOneCountChain.where.mockResolvedValue(countRows);
        return findOneCountChain;
      });
    },
  };
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('EventsService', () => {
  let service: EventsService;
  let mocks: ReturnType<typeof createMockDb>;
  let pricingService: ReturnType<typeof createMockPricingService>;

  let cacheService: ReturnType<typeof createMockCacheService>;

  beforeEach(() => {
    mocks = createMockDb();
    pricingService = createMockPricingService();
    cacheService = createMockCacheService();
    service = new EventsService(mocks.db as any, pricingService, cacheService as any);
  });

  /* ---------------------------------------------------------------- */
  /*  findAll                                                          */
  /* ---------------------------------------------------------------- */

  describe('findAll', () => {
    it('should return empty array when no events exist', async () => {
      mocks.routeFindAll([]);

      const result = await service.findAll();

      expect(result).toEqual([]);
    });

    it('should return mapped EventListItem for each row', async () => {
      const rows = [
        fakeEventRow({ id: 1, name: 'Event A', recentCount: 3 }),
        fakeEventRow({ id: 2, name: 'Event B', bookedTickets: 90, recentCount: 0 }),
      ];
      mocks.routeFindAll(rows);
      pricingService.computePrice
        .mockReturnValueOnce(makeBreakdown(85))
        .mockReturnValueOnce(makeBreakdown(120));

      const result = await service.findAll();

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        id: 1,
        name: 'Event A',
        date: '2025-09-01T20:00:00.000Z',
        venue: 'Arena',
        currentPrice: 85,
        availableTickets: 80,
        totalTickets: 100,
      });
      expect(result[1]).toEqual({
        id: 2,
        name: 'Event B',
        date: '2025-09-01T20:00:00.000Z',
        venue: 'Arena',
        currentPrice: 120,
        availableTickets: 10,
        totalTickets: 100,
      });
    });

    it('should parse string prices to floats for pricing computation', async () => {
      mocks.routeFindAll([
        fakeEventRow({ basePrice: '99.99', floorPrice: '49.50', ceilingPrice: '199.99' }),
      ]);

      await service.findAll();

      expect(pricingService.computePrice).toHaveBeenCalledWith(
        99.99,
        49.5,
        199.99,
        expect.anything(),
        expect.objectContaining({ totalTickets: 100 }),
      );
    });

    it('should pass recentCount as recentBookingsCount to pricing', async () => {
      mocks.routeFindAll([fakeEventRow({ recentCount: 15 })]);

      await service.findAll();

      const state = pricingService.computePrice.mock.calls[0][4];
      expect(state.recentBookingsCount).toBe(15);
    });

    it('should call buildRules with event pricingRules config', async () => {
      const config = {
        timeRule: { enabled: false, weight: 2 },
        demandRule: { enabled: true, weight: 0.5 },
        inventoryRule: { enabled: true, weight: 1 },
      };
      mocks.routeFindAll([fakeEventRow({ pricingRules: config })]);

      await service.findAll();

      expect(pricingService.buildRules).toHaveBeenCalledWith(config);
    });

    it('should compute availableTickets as totalTickets - bookedTickets', async () => {
      mocks.routeFindAll([fakeEventRow({ totalTickets: 50, bookedTickets: 35 })]);
      pricingService.computePrice.mockReturnValue(makeBreakdown(80));

      const result = await service.findAll();

      expect(result[0].availableTickets).toBe(15);
    });
  });

  /* ---------------------------------------------------------------- */
  /*  findOne                                                          */
  /* ---------------------------------------------------------------- */

  describe('findOne', () => {
    it('should throw NotFoundException when event does not exist', async () => {
      mocks.routeFindOne([], []);

      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
      await expect(service.findOne(999)).rejects.toThrow(
        'Event with id 999 not found',
      );
    });

    it('should return full EventDetailResponse with priceBreakdown', async () => {
      const event = fakeEventRow();
      const breakdown = makeBreakdown(95);
      mocks.routeFindOne([event], [{ recentCount: 5 }]);
      pricingService.computePrice.mockReturnValue(breakdown);

      const result = await service.findOne(1);

      expect(result).toEqual({
        id: 1,
        name: 'Test Event',
        date: '2025-09-01T20:00:00.000Z',
        venue: 'Arena',
        description: 'A great event',
        totalTickets: 100,
        bookedTickets: 20,
        availableTickets: 80,
        basePrice: 80,
        floorPrice: 40,
        ceilingPrice: 200,
        pricingRules: defaultPricingRules,
        priceBreakdown: breakdown,
      });
    });

    it('should parse string prices to floats', async () => {
      mocks.routeFindOne(
        [fakeEventRow({ basePrice: '55.55', floorPrice: '22.22', ceilingPrice: '111.11' })],
        [{ recentCount: 0 }],
      );

      await service.findOne(1);

      expect(pricingService.computePrice).toHaveBeenCalledWith(
        55.55,
        22.22,
        111.11,
        expect.anything(),
        expect.anything(),
      );
    });

    it('should default recentBookingsCount to 0 when count query returns falsy', async () => {
      mocks.routeFindOne([fakeEventRow()], [undefined]);

      await service.findOne(1);

      const state = pricingService.computePrice.mock.calls[0][4];
      expect(state.recentBookingsCount).toBe(0);
    });

    it('should pass correct recentBookingsCount from count query', async () => {
      mocks.routeFindOne([fakeEventRow()], [{ recentCount: 42 }]);

      await service.findOne(1);

      const state = pricingService.computePrice.mock.calls[0][4];
      expect(state.recentBookingsCount).toBe(42);
    });

    it('should call buildRules with event pricingRules config', async () => {
      const config = {
        timeRule: { enabled: true, weight: 3 },
        demandRule: { enabled: false, weight: 1 },
        inventoryRule: { enabled: true, weight: 0.5 },
      };
      mocks.routeFindOne([fakeEventRow({ pricingRules: config })], [{ recentCount: 0 }]);

      await service.findOne(1);

      expect(pricingService.buildRules).toHaveBeenCalledWith(config);
    });

    it('should pass eventDate and ticket counts to pricing state', async () => {
      const eventDate = new Date('2025-12-25T18:00:00Z');
      mocks.routeFindOne(
        [fakeEventRow({ date: eventDate, totalTickets: 500, bookedTickets: 123 })],
        [{ recentCount: 7 }],
      );

      await service.findOne(1);

      const state = pricingService.computePrice.mock.calls[0][4];
      expect(state.eventDate).toEqual(eventDate);
      expect(state.totalTickets).toBe(500);
      expect(state.bookedTickets).toBe(123);
      expect(state.recentBookingsCount).toBe(7);
      expect(state.now).toBeInstanceOf(Date);
    });
  });

  /* ---------------------------------------------------------------- */
  /*  create                                                           */
  /* ---------------------------------------------------------------- */

  describe('create', () => {
    const baseDto = {
      name: 'New Event',
      date: '2025-10-01T20:00:00Z',
      venue: 'Stadium',
      totalTickets: 500,
      basePrice: 75,
      floorPrice: 50,
      ceilingPrice: 200,
    };

    it('should use default pricing rules when none provided', async () => {
      const createdRow = { id: 1, ...baseDto };
      mocks.insertChain.returning.mockResolvedValue([createdRow]);

      await service.create(baseDto);

      expect(mocks.insertChain.values).toHaveBeenCalledWith(
        expect.objectContaining({
          pricingRules: {
            timeRule: { enabled: true, weight: 1 },
            demandRule: { enabled: true, weight: 1 },
            inventoryRule: { enabled: true, weight: 1 },
          },
        }),
      );
    });

    it('should use provided pricing rules when present', async () => {
      const customRules = {
        timeRule: { enabled: false, weight: 0 },
        demandRule: { enabled: true, weight: 2 },
        inventoryRule: { enabled: true, weight: 1.5 },
      };
      const createdRow = { id: 1, ...baseDto };
      mocks.insertChain.returning.mockResolvedValue([createdRow]);

      await service.create({ ...baseDto, pricingRules: customRules });

      expect(mocks.insertChain.values).toHaveBeenCalledWith(
        expect.objectContaining({ pricingRules: customRules }),
      );
    });

    it('should default description to empty string when not provided', async () => {
      const createdRow = { id: 1, ...baseDto };
      mocks.insertChain.returning.mockResolvedValue([createdRow]);

      await service.create(baseDto);

      expect(mocks.insertChain.values).toHaveBeenCalledWith(
        expect.objectContaining({ description: '' }),
      );
    });

    it('should use provided description', async () => {
      const createdRow = { id: 1, ...baseDto };
      mocks.insertChain.returning.mockResolvedValue([createdRow]);

      await service.create({ ...baseDto, description: 'A cool event' });

      expect(mocks.insertChain.values).toHaveBeenCalledWith(
        expect.objectContaining({ description: 'A cool event' }),
      );
    });

    it('should set currentPrice equal to basePrice', async () => {
      const createdRow = { id: 1, ...baseDto };
      mocks.insertChain.returning.mockResolvedValue([createdRow]);

      await service.create(baseDto);

      expect(mocks.insertChain.values).toHaveBeenCalledWith(
        expect.objectContaining({
          basePrice: '75',
          currentPrice: '75',
        }),
      );
    });

    it('should convert numeric prices to strings for DB storage', async () => {
      const createdRow = { id: 1, ...baseDto };
      mocks.insertChain.returning.mockResolvedValue([createdRow]);

      await service.create(baseDto);

      expect(mocks.insertChain.values).toHaveBeenCalledWith(
        expect.objectContaining({
          basePrice: '75',
          floorPrice: '50',
          ceilingPrice: '200',
        }),
      );
    });

    it('should convert date string to Date object', async () => {
      const createdRow = { id: 1, ...baseDto };
      mocks.insertChain.returning.mockResolvedValue([createdRow]);

      await service.create(baseDto);

      const values = mocks.insertChain.values.mock.calls[0][0];
      expect(values.date).toBeInstanceOf(Date);
      expect(values.date.toISOString()).toBe('2025-10-01T20:00:00.000Z');
    });

    it('should return the created event row', async () => {
      const createdRow = {
        id: 42,
        name: 'New Event',
        date: new Date('2025-10-01T20:00:00Z'),
        venue: 'Stadium',
        description: '',
        totalTickets: 500,
        bookedTickets: 0,
        basePrice: '75',
        currentPrice: '75',
        floorPrice: '50',
        ceilingPrice: '200',
        pricingRules: defaultPricingRules,
      };
      mocks.insertChain.returning.mockResolvedValue([createdRow]);

      const result = await service.create(baseDto);

      expect(result).toEqual(createdRow);
    });
  });
});
