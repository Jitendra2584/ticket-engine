import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../app.module';

const hasDatabase = !!process.env.DATABASE_URL;

// Set API_KEY for auth guard in tests
process.env.API_KEY = 'test-api-key';

/**
 * Helper to create an event with a given number of total tickets.
 * Returns the created event's ID.
 */
async function createEventWithTickets(
  app: INestApplication,
  totalTickets: number,
): Promise<number> {
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + 60);

  const res = await request(app.getHttpServer())
    .post('/events')
    .set('x-api-key', 'test-api-key')
    .send({
      name: `Concurrency Test Event (${totalTickets} tickets)`,
      date: futureDate.toISOString(),
      venue: 'Concurrency Arena',
      description: 'Event for concurrency testing',
      totalTickets,
      basePrice: 50,
      floorPrice: 30,
      ceilingPrice: 150,
    })
    .expect(201);

  return res.body.id as number;
}

/** Fetches the current dynamic price for an event. */
async function getCurrentPrice(
  app: INestApplication,
  eventId: number,
): Promise<number> {
  const res = await request(app.getHttpServer())
    .get(`/events/${eventId}`)
    .expect(200);
  return res.body.priceBreakdown.finalPrice as number;
}

describe.skipIf(!hasDatabase)('Concurrent Bookings', () => {
  let app: INestApplication;

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
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('prevents overbooking of last ticket (2 simultaneous requests for 1 ticket)', async () => {
    // Setup: Create event with exactly 1 remaining ticket
    const eventId = await createEventWithTickets(app, 1);

    // Get the current price so both requests send expectedPrice
    const expectedPrice = await getCurrentPrice(app, eventId);

    // Execute: Fire 2 simultaneous POST /bookings requests
    const [res1, res2] = await Promise.all([
      request(app.getHttpServer())
        .post('/bookings')
        .send({ eventId, userEmail: 'user1@test.com', quantity: 1, expectedPrice }),
      request(app.getHttpServer())
        .post('/bookings')
        .send({ eventId, userEmail: 'user2@test.com', quantity: 1, expectedPrice }),
    ]);

    // Assert: Exactly 1 response is 201, exactly 1 is 409
    const statuses = [res1.status, res2.status].sort();
    expect(statuses).toEqual([201, 409]);

    // Verify: GET /events/:id and check that bookedTickets === totalTickets (no overselling)
    const eventRes = await request(app.getHttpServer())
      .get(`/events/${eventId}`)
      .expect(200);

    expect(eventRes.body.bookedTickets).toBe(1);
    expect(eventRes.body.totalTickets).toBe(1);
    expect(eventRes.body.availableTickets).toBe(0);

    // Also verify: GET /bookings?eventId=:id returns exactly 1 booking
    const bookingsRes = await request(app.getHttpServer())
      .get(`/bookings?eventId=${eventId}`)
      .expect(200);

    expect(bookingsRes.body).toHaveLength(1);
  });

  it('prevents overbooking with more concurrent requests (5 requests for 3 tickets)', async () => {
    // Setup: Create event with 3 tickets
    const eventId = await createEventWithTickets(app, 3);

    const expectedPrice = await getCurrentPrice(app, eventId);

    // Execute: Fire 5 simultaneous booking requests (each for 1 ticket)
    const responses = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        request(app.getHttpServer())
          .post('/bookings')
          .send({ eventId, userEmail: `user${i + 1}@test.com`, quantity: 1, expectedPrice }),
      ),
    );

    // Assert: exactly 3 succeed (201), exactly 2 fail (409)
    const statusCounts = responses.reduce<Record<number, number>>(
      (acc, res) => {
        acc[res.status] = (acc[res.status] ?? 0) + 1;
        return acc;
      },
      {},
    );

    expect(statusCounts[201]).toBe(3);
    expect(statusCounts[409]).toBe(2);

    // Verify: bookedTickets === totalTickets (no overselling)
    const eventRes = await request(app.getHttpServer())
      .get(`/events/${eventId}`)
      .expect(200);

    expect(eventRes.body.bookedTickets).toBe(3);
    expect(eventRes.body.totalTickets).toBe(3);
    expect(eventRes.body.availableTickets).toBe(0);

    // Verify: exactly 3 bookings exist
    const bookingsRes = await request(app.getHttpServer())
      .get(`/bookings?eventId=${eventId}`)
      .expect(200);

    expect(bookingsRes.body).toHaveLength(3);
  });

  it('prevents overbooking when multi-quantity requests compete (2 requests of 3 for 5 tickets)', async () => {
    const eventId = await createEventWithTickets(app, 5);

    const expectedPrice = await getCurrentPrice(app, eventId);

    // Two users each try to book 3 tickets — only 5 available, so only one can succeed
    const [res1, res2] = await Promise.all([
      request(app.getHttpServer())
        .post('/bookings')
        .send({ eventId, userEmail: 'bulk1@test.com', quantity: 3, expectedPrice }),
      request(app.getHttpServer())
        .post('/bookings')
        .send({ eventId, userEmail: 'bulk2@test.com', quantity: 3, expectedPrice }),
    ]);

    const statuses = [res1.status, res2.status].sort();
    expect(statuses).toEqual([201, 409]);

    const eventRes = await request(app.getHttpServer())
      .get(`/events/${eventId}`)
      .expect(200);

    expect(eventRes.body.bookedTickets).toBe(3);
    expect(eventRes.body.availableTickets).toBe(2);
  });

  it('allows concurrent bookings on different events (no cross-event locking)', async () => {
    const [eventId1, eventId2] = await Promise.all([
      createEventWithTickets(app, 1),
      createEventWithTickets(app, 1),
    ]);

    const [price1, price2] = await Promise.all([
      getCurrentPrice(app, eventId1),
      getCurrentPrice(app, eventId2),
    ]);

    const [res1, res2] = await Promise.all([
      request(app.getHttpServer())
        .post('/bookings')
        .send({ eventId: eventId1, userEmail: 'cross1@test.com', quantity: 1, expectedPrice: price1 }),
      request(app.getHttpServer())
        .post('/bookings')
        .send({ eventId: eventId2, userEmail: 'cross2@test.com', quantity: 1, expectedPrice: price2 }),
    ]);

    // Both should succeed since they target different events
    expect(res1.status).toBe(201);
    expect(res2.status).toBe(201);
  });

  it('records correct price snapshot at booking time', async () => {
    const eventId = await createEventWithTickets(app, 10);

    const expectedPrice = await getCurrentPrice(app, eventId);

    const bookingRes = await request(app.getHttpServer())
      .post('/bookings')
      .send({ eventId, userEmail: 'price-check@test.com', quantity: 1, expectedPrice })
      .expect(201);

    // Price paid should be a positive number within floor/ceiling bounds
    expect(bookingRes.body.pricePaid).toBeGreaterThanOrEqual(30);
    expect(bookingRes.body.pricePaid).toBeLessThanOrEqual(150);
    expect(bookingRes.body.bookedAt).toBeDefined();
  });

  it('rejects a single request for more tickets than available', async () => {
    const eventId = await createEventWithTickets(app, 2);

    const expectedPrice = await getCurrentPrice(app, eventId);

    const res = await request(app.getHttpServer())
      .post('/bookings')
      .send({ eventId, userEmail: 'greedy@test.com', quantity: 5, expectedPrice })
      .expect(409);

    expect(res.body.message).toContain('Not enough tickets available');

    // Verify no tickets were booked
    const eventRes = await request(app.getHttpServer())
      .get(`/events/${eventId}`)
      .expect(200);

    expect(eventRes.body.bookedTickets).toBe(0);
  });

  it('handles high concurrency stress (10 requests for 5 tickets)', async () => {
    const eventId = await createEventWithTickets(app, 5);
    const expectedPrice = await getCurrentPrice(app, eventId);

    const responses = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        request(app.getHttpServer())
          .post('/bookings')
          .send({ eventId, userEmail: `stress${i}@test.com`, quantity: 1, expectedPrice }),
      ),
    );

    const statusCounts = responses.reduce<Record<number, number>>(
      (acc, res) => {
        acc[res.status] = (acc[res.status] ?? 0) + 1;
        return acc;
      },
      {},
    );

    expect(statusCounts[201]).toBe(5);
    expect(statusCounts[409]).toBe(5);

    const eventRes = await request(app.getHttpServer())
      .get(`/events/${eventId}`)
      .expect(200);

    expect(eventRes.body.bookedTickets).toBe(5);
    expect(eventRes.body.availableTickets).toBe(0);
  });

  it('sequential bookings exhaust inventory then fail', async () => {
    const eventId = await createEventWithTickets(app, 3);

    // Book all 3 tickets sequentially
    for (let i = 0; i < 3; i++) {
      const expectedPrice = await getCurrentPrice(app, eventId);
      await request(app.getHttpServer())
        .post('/bookings')
        .send({ eventId, userEmail: `seq${i}@test.com`, quantity: 1, expectedPrice })
        .expect(201);
    }

    // Next booking should fail
    const expectedPrice = await getCurrentPrice(app, eventId);
    const res = await request(app.getHttpServer())
      .post('/bookings')
      .send({ eventId, userEmail: 'seq-late@test.com', quantity: 1, expectedPrice })
      .expect(409);

    expect(res.body.message).toContain('Not enough tickets available');
  });

  it('failed bookings return proper error structure', async () => {
    const eventId = await createEventWithTickets(app, 1);

    // Exhaust the ticket
    const price1 = await getCurrentPrice(app, eventId);
    await request(app.getHttpServer())
      .post('/bookings')
      .send({ eventId, userEmail: 'first@test.com', quantity: 1, expectedPrice: price1 })
      .expect(201);

    // Attempt to book again
    const price2 = await getCurrentPrice(app, eventId);
    const res = await request(app.getHttpServer())
      .post('/bookings')
      .send({ eventId, userEmail: 'second@test.com', quantity: 1, expectedPrice: price2 })
      .expect(409);

    expect(res.body).toHaveProperty('statusCode', 409);
    expect(res.body).toHaveProperty('message');
    expect(res.body.message).toContain('Not enough tickets available');
  });
});
