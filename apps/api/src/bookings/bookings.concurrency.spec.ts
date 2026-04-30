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

    // Execute: Fire 2 simultaneous POST /bookings requests
    const [res1, res2] = await Promise.all([
      request(app.getHttpServer())
        .post('/bookings')
        .send({ eventId, userEmail: 'user1@test.com', quantity: 1 }),
      request(app.getHttpServer())
        .post('/bookings')
        .send({ eventId, userEmail: 'user2@test.com', quantity: 1 }),
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

    // Execute: Fire 5 simultaneous booking requests (each for 1 ticket)
    const responses = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        request(app.getHttpServer())
          .post('/bookings')
          .send({ eventId, userEmail: `user${i + 1}@test.com`, quantity: 1 }),
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
});
