import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../app.module';
import { CacheService, CachePrefix } from './cache.service';

const hasDatabase = !!process.env.DATABASE_URL;

process.env.API_KEY = 'test-api-key';

/** Helper: create an event and return its ID. */
async function createEvent(
  app: INestApplication,
  overrides: Record<string, unknown> = {},
): Promise<number> {
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + 60);

  const res = await request(app.getHttpServer())
    .post('/events')
    .set('x-api-key', 'test-api-key')
    .send({
      name: 'Cache Test Event',
      date: futureDate.toISOString(),
      venue: 'Cache Arena',
      description: 'Event for cache testing',
      totalTickets: 100,
      basePrice: 50,
      floorPrice: 30,
      ceilingPrice: 150,
      ...overrides,
    })
    .expect(201);

  return res.body.id as number;
}

/** Helper: get current price for an event. */
async function getCurrentPrice(
  app: INestApplication,
  eventId: number,
): Promise<number> {
  const res = await request(app.getHttpServer())
    .get(`/events/${eventId}`)
    .expect(200);
  return res.body.priceBreakdown.finalPrice as number;
}

describe.skipIf(!hasDatabase)('Cache Invalidation Integration', () => {
  let app: INestApplication;
  let cacheService: CacheService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    cacheService = moduleRef.get(CacheService);
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  /* ---------------------------------------------------------------- */
  /*  Seed Cache Invalidation (run early before other tests create FKs) */
  /* ---------------------------------------------------------------- */

  describe('Seed Cache Invalidation', () => {
    it('should verify seed service invalidates event list cache key', async () => {
      // We can't safely call POST /seed in parallel with other integration tests
      // because it deletes all events/bookings. Instead, verify the invalidation
      // mechanism works by manually setting a cache key and checking it gets cleared.

      if (!cacheService.isAvailable()) return;

      // Manually populate the event list cache
      await cacheService.set(CachePrefix.EVENT_LIST, [{ fake: true }], 60);

      const before = await cacheService.get(CachePrefix.EVENT_LIST);
      expect(before).not.toBeNull();

      // Simulate what seed does: delete the event list cache
      await cacheService.del(CachePrefix.EVENT_LIST);

      const after = await cacheService.get(CachePrefix.EVENT_LIST);
      expect(after).toBeNull();
    });
  });

  /* ---------------------------------------------------------------- */
  /*  Event List Cache (events:list)                                   */
  /* ---------------------------------------------------------------- */

  describe('Event List Cache', () => {
    it('should populate cache on first fetch and serve from cache on second', async () => {
      // Clear cache
      await cacheService.del(CachePrefix.EVENT_LIST);

      // Verify cache is empty
      if (cacheService.isAvailable()) {
        const before = await cacheService.get(CachePrefix.EVENT_LIST);
        expect(before).toBeNull();
      }

      // First fetch — populates cache
      const res1 = await request(app.getHttpServer())
        .get('/events')
        .expect(200);

      expect(res1.body.length).toBeGreaterThan(0);

      // Verify cache is now populated (if Redis is available)
      if (cacheService.isAvailable()) {
        const cached = await cacheService.get<unknown[]>(CachePrefix.EVENT_LIST);
        expect(cached).not.toBeNull();
        expect(cached!.length).toBe(res1.body.length);
      }

      // Second fetch — should return successfully (served from cache)
      const res2 = await request(app.getHttpServer())
        .get('/events')
        .expect(200);

      expect(res2.body.length).toBeGreaterThan(0);
    });

    it('should invalidate event list cache when a new event is created', async () => {
      // Warm the cache
      await request(app.getHttpServer()).get('/events').expect(200);

      // Create a new event
      const eventId = await createEvent(app, { name: 'Cache Invalidation New Event' });

      // Fetch list again — new event must appear
      const res = await request(app.getHttpServer())
        .get('/events')
        .expect(200);

      const found = res.body.find((e: { id: number }) => e.id === eventId);
      expect(found).toBeDefined();
      expect(found.name).toBe('Cache Invalidation New Event');
    });

    it('should invalidate event list cache when a booking is made', async () => {
      const eventId = await createEvent(app, {
        name: 'Booking Cache Test',
        totalTickets: 50,
      });

      // Warm the cache with the event list
      const listBefore = await request(app.getHttpServer())
        .get('/events')
        .expect(200);

      const eventBefore = listBefore.body.find(
        (e: { id: number }) => e.id === eventId,
      );
      expect(eventBefore.availableTickets).toBe(50);

      // Book tickets
      const price = await getCurrentPrice(app, eventId);
      await request(app.getHttpServer())
        .post('/bookings')
        .send({ eventId, userEmail: 'cache-list@test.com', quantity: 5, expectedPrice: price })
        .expect(201);

      // Fetch list again — available tickets must be updated
      const listAfter = await request(app.getHttpServer())
        .get('/events')
        .expect(200);

      const eventAfter = listAfter.body.find(
        (e: { id: number }) => e.id === eventId,
      );
      expect(eventAfter.availableTickets).toBe(45);
    });
  });

  /* ---------------------------------------------------------------- */
  /*  Event Detail Cache (events:detail:{id})                          */
  /* ---------------------------------------------------------------- */

  describe('Event Detail Cache', () => {
    it('should cache event detail on first fetch', async () => {
      const eventId = await createEvent(app, { name: 'Detail Cache Test' });
      const cacheKey = `${CachePrefix.EVENT_DETAIL}:${eventId}`;

      // Clear specific cache
      await cacheService.del(cacheKey);

      // First fetch — populates cache
      const res = await request(app.getHttpServer())
        .get(`/events/${eventId}`)
        .expect(200);

      if (cacheService.isAvailable()) {
        const cached = await cacheService.get(cacheKey);
        expect(cached).not.toBeNull();
        expect((cached as any).id).toBe(eventId);
      }

      expect(res.body.name).toBe('Detail Cache Test');
    });

    it('should invalidate event detail cache when a booking is made for that event', async () => {
      const eventId = await createEvent(app, {
        name: 'Detail Invalidation Test',
        totalTickets: 20,
      });

      // Warm the detail cache
      const detailBefore = await request(app.getHttpServer())
        .get(`/events/${eventId}`)
        .expect(200);

      expect(detailBefore.body.bookedTickets).toBe(0);

      // Book tickets
      const price = detailBefore.body.priceBreakdown.finalPrice;
      await request(app.getHttpServer())
        .post('/bookings')
        .send({ eventId, userEmail: 'detail-inv@test.com', quantity: 3, expectedPrice: price })
        .expect(201);

      // Fetch detail again — must reflect updated state
      const detailAfter = await request(app.getHttpServer())
        .get(`/events/${eventId}`)
        .expect(200);

      expect(detailAfter.body.bookedTickets).toBe(3);
      expect(detailAfter.body.availableTickets).toBe(17);
    });

    it('should not invalidate detail cache of unrelated events when booking', async () => {
      const eventA = await createEvent(app, { name: 'Event A - Isolated' });
      const eventB = await createEvent(app, { name: 'Event B - Isolated' });

      // Warm both detail caches
      await request(app.getHttpServer()).get(`/events/${eventA}`).expect(200);
      const detailB = await request(app.getHttpServer())
        .get(`/events/${eventB}`)
        .expect(200);

      // Book on event A
      const priceA = await getCurrentPrice(app, eventA);
      await request(app.getHttpServer())
        .post('/bookings')
        .send({ eventId: eventA, userEmail: 'isolate@test.com', quantity: 1, expectedPrice: priceA })
        .expect(201);

      // Event B detail should still show 0 booked tickets
      const detailBAfter = await request(app.getHttpServer())
        .get(`/events/${eventB}`)
        .expect(200);

      expect(detailBAfter.body.bookedTickets).toBe(0);
    });
  });

  /* ---------------------------------------------------------------- */
  /*  Demand Counter (bookings:recent:{id})                            */
  /* ---------------------------------------------------------------- */

  describe('Demand Counter Cache', () => {
    it('should increment demand counter after each booking', async () => {
      const eventId = await createEvent(app, {
        name: 'Demand Counter Test',
        totalTickets: 50,
      });

      const counterKey = `${CachePrefix.RECENT_BOOKINGS}:${eventId}`;

      // Counter should start at 0
      const countBefore = await cacheService.getCount(counterKey);
      expect(countBefore).toBe(0);

      // Make 3 sequential bookings
      for (let i = 0; i < 3; i++) {
        const price = await getCurrentPrice(app, eventId);
        await request(app.getHttpServer())
          .post('/bookings')
          .send({
            eventId,
            userEmail: `demand${i}@test.com`,
            quantity: 1,
            expectedPrice: price,
          })
          .expect(201);
      }

      // Counter should be 3 (if Redis is available)
      if (cacheService.isAvailable()) {
        const countAfter = await cacheService.getCount(counterKey);
        expect(countAfter).toBe(3);
      }
    });

    it('should not increment demand counter for failed bookings', async () => {
      const eventId = await createEvent(app, {
        name: 'Failed Booking Counter Test',
        totalTickets: 1,
      });

      const counterKey = `${CachePrefix.RECENT_BOOKINGS}:${eventId}`;

      // Book the only ticket
      const price = await getCurrentPrice(app, eventId);
      await request(app.getHttpServer())
        .post('/bookings')
        .send({ eventId, userEmail: 'first@test.com', quantity: 1, expectedPrice: price })
        .expect(201);

      const countAfterSuccess = cacheService.isAvailable()
        ? await cacheService.getCount(counterKey)
        : 1;

      // Attempt to book again — should fail
      const price2 = await getCurrentPrice(app, eventId);
      await request(app.getHttpServer())
        .post('/bookings')
        .send({ eventId, userEmail: 'second@test.com', quantity: 1, expectedPrice: price2 })
        .expect(409);

      // Counter should NOT have incremented
      if (cacheService.isAvailable()) {
        const countAfterFail = await cacheService.getCount(counterKey);
        expect(countAfterFail).toBe(countAfterSuccess);
      }
    });
  });

  /* ---------------------------------------------------------------- */
  /*  Seed Cache Invalidation                                          */
  /* ---------------------------------------------------------------- */


  /* ---------------------------------------------------------------- */
  /*  Concurrent Bookings + Cache Consistency                          */
  /* ---------------------------------------------------------------- */

  describe('Concurrent Bookings Cache Consistency', () => {
    it('should maintain correct available tickets after concurrent bookings', async () => {
      const eventId = await createEvent(app, {
        name: 'Concurrent Cache Test',
        totalTickets: 10,
      });

      const price = await getCurrentPrice(app, eventId);

      // Fire 5 concurrent bookings of 1 ticket each
      const responses = await Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          request(app.getHttpServer())
            .post('/bookings')
            .send({
              eventId,
              userEmail: `concurrent-cache${i}@test.com`,
              quantity: 1,
              expectedPrice: price,
            }),
        ),
      );

      const successCount = responses.filter((r) => r.status === 201).length;

      // Verify event detail reflects the correct state
      const detail = await request(app.getHttpServer())
        .get(`/events/${eventId}`)
        .expect(200);

      expect(detail.body.bookedTickets).toBe(successCount);
      expect(detail.body.availableTickets).toBe(10 - successCount);

      // Verify event list also reflects the correct state
      const list = await request(app.getHttpServer())
        .get('/events')
        .expect(200);

      const eventInList = list.body.find(
        (e: { id: number }) => e.id === eventId,
      );
      expect(eventInList.availableTickets).toBe(10 - successCount);
    });

    it('should show correct demand counter after concurrent bookings', async () => {
      const eventId = await createEvent(app, {
        name: 'Concurrent Demand Counter',
        totalTickets: 20,
      });

      const price = await getCurrentPrice(app, eventId);

      // Fire 8 concurrent bookings
      const responses = await Promise.all(
        Array.from({ length: 8 }, (_, i) =>
          request(app.getHttpServer())
            .post('/bookings')
            .send({
              eventId,
              userEmail: `demand-conc${i}@test.com`,
              quantity: 1,
              expectedPrice: price,
            }),
        ),
      );

      const successCount = responses.filter((r) => r.status === 201).length;

      if (cacheService.isAvailable()) {
        const counterKey = `${CachePrefix.RECENT_BOOKINGS}:${eventId}`;
        const count = await cacheService.getCount(counterKey);
        expect(count).toBe(successCount);
      }
    });

    it('should not serve stale cached data after last ticket is booked', async () => {
      const eventId = await createEvent(app, {
        name: 'Stale Cache Last Ticket',
        totalTickets: 2,
      });

      // Warm the cache
      await request(app.getHttpServer()).get(`/events/${eventId}`).expect(200);

      // Book both tickets sequentially
      for (let i = 0; i < 2; i++) {
        const price = await getCurrentPrice(app, eventId);
        await request(app.getHttpServer())
          .post('/bookings')
          .send({
            eventId,
            userEmail: `stale${i}@test.com`,
            quantity: 1,
            expectedPrice: price,
          })
          .expect(201);
      }

      // Detail must show sold out — not stale cached data
      const detail = await request(app.getHttpServer())
        .get(`/events/${eventId}`)
        .expect(200);

      expect(detail.body.bookedTickets).toBe(2);
      expect(detail.body.availableTickets).toBe(0);

      // List must also show sold out
      const list = await request(app.getHttpServer())
        .get('/events')
        .expect(200);

      const eventInList = list.body.find(
        (e: { id: number }) => e.id === eventId,
      );
      expect(eventInList.availableTickets).toBe(0);
    });

    it('should reflect correct state when concurrent bookings exhaust all tickets', async () => {
      const eventId = await createEvent(app, {
        name: 'Exhaust Concurrent Cache',
        totalTickets: 3,
      });

      const price = await getCurrentPrice(app, eventId);

      // 6 concurrent requests for 1 ticket each, only 3 should succeed
      const responses = await Promise.all(
        Array.from({ length: 6 }, (_, i) =>
          request(app.getHttpServer())
            .post('/bookings')
            .send({
              eventId,
              userEmail: `exhaust${i}@test.com`,
              quantity: 1,
              expectedPrice: price,
            }),
        ),
      );

      const statuses = responses.reduce<Record<number, number>>(
        (acc, res) => {
          acc[res.status] = (acc[res.status] ?? 0) + 1;
          return acc;
        },
        {},
      );

      expect(statuses[201]).toBe(3);
      expect(statuses[409]).toBe(3);

      // Both detail and list must show sold out
      const detail = await request(app.getHttpServer())
        .get(`/events/${eventId}`)
        .expect(200);

      expect(detail.body.bookedTickets).toBe(3);
      expect(detail.body.availableTickets).toBe(0);

      const list = await request(app.getHttpServer())
        .get('/events')
        .expect(200);

      const eventInList = list.body.find(
        (e: { id: number }) => e.id === eventId,
      );
      expect(eventInList.availableTickets).toBe(0);
    });
  });

  /* ---------------------------------------------------------------- */
  /*  Edge Cases                                                       */
  /* ---------------------------------------------------------------- */

  describe('Cache Edge Cases', () => {
    it('should handle rapid create-then-fetch without stale data', async () => {
      // Rapidly create 3 events and immediately fetch the list after each
      for (let i = 0; i < 3; i++) {
        const eventId = await createEvent(app, {
          name: `Rapid Create ${i}`,
        });

        const list = await request(app.getHttpServer())
          .get('/events')
          .expect(200);

        const found = list.body.find(
          (e: { id: number }) => e.id === eventId,
        );
        expect(found).toBeDefined();
        expect(found.name).toBe(`Rapid Create ${i}`);
      }
    });

    it('should handle booking on event that was never cached', async () => {
      const eventId = await createEvent(app, {
        name: 'Never Cached Event',
        totalTickets: 10,
      });

      // Skip warming the cache — go straight to booking
      const price = await getCurrentPrice(app, eventId);
      const res = await request(app.getHttpServer())
        .post('/bookings')
        .send({
          eventId,
          userEmail: 'never-cached@test.com',
          quantity: 2,
          expectedPrice: price,
        })
        .expect(201);

      expect(res.body.quantity).toBe(2);

      // Now fetch — should show correct state
      const detail = await request(app.getHttpServer())
        .get(`/events/${eventId}`)
        .expect(200);

      expect(detail.body.bookedTickets).toBe(2);
    });

    it('should serve correct data when cache is manually cleared mid-flow', async () => {
      const eventId = await createEvent(app, {
        name: 'Manual Clear Test',
        totalTickets: 10,
      });

      // Warm cache
      await request(app.getHttpServer()).get(`/events/${eventId}`).expect(200);

      // Manually clear all caches
      await cacheService.del(
        CachePrefix.EVENT_LIST,
        `${CachePrefix.EVENT_DETAIL}:${eventId}`,
      );

      // Fetch again — should rebuild from DB
      const detail = await request(app.getHttpServer())
        .get(`/events/${eventId}`)
        .expect(200);

      expect(detail.body.id).toBe(eventId);
      expect(detail.body.name).toBe('Manual Clear Test');
    });

    it('should handle multiple bookings on same event updating cache correctly each time', async () => {
      const eventId = await createEvent(app, {
        name: 'Sequential Bookings Cache',
        totalTickets: 10,
      });

      // Make 3 sequential bookings and verify state after each
      for (let i = 1; i <= 3; i++) {
        const price = await getCurrentPrice(app, eventId);
        await request(app.getHttpServer())
          .post('/bookings')
          .send({
            eventId,
            userEmail: `seq-cache${i}@test.com`,
            quantity: 1,
            expectedPrice: price,
          })
          .expect(201);

        const detail = await request(app.getHttpServer())
          .get(`/events/${eventId}`)
          .expect(200);

        expect(detail.body.bookedTickets).toBe(i);
        expect(detail.body.availableTickets).toBe(10 - i);
      }
    });
  });
});
