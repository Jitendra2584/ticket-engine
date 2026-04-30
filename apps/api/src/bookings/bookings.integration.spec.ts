import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../app.module';

const hasDatabase = !!process.env.DATABASE_URL;

// Set API_KEY for auth guard in tests
process.env.API_KEY = 'test-api-key';

describe.skipIf(!hasDatabase)('Booking Flow Integration', () => {
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

  describe('Complete booking flow', () => {
    let createdEventId: number;

    it('should create an event, book tickets, and verify the booking', async () => {
      // Step 1: Create an event via POST /events with API key
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 60);

      const createEventBody = {
        name: 'Integration Test Concert',
        date: futureDate.toISOString(),
        venue: 'Test Arena',
        description: 'An event for integration testing',
        totalTickets: 100,
        basePrice: 50,
        floorPrice: 30,
        ceilingPrice: 150,
      };

      const createRes = await request(app.getHttpServer())
        .post('/events')
        .set('x-api-key', 'test-api-key')
        .send(createEventBody)
        .expect(201);

      createdEventId = createRes.body.id;
      expect(createdEventId).toBeDefined();
      expect(createRes.body.name).toBe('Integration Test Concert');

      // Step 2: Verify the event appears in GET /events
      const listRes = await request(app.getHttpServer())
        .get('/events')
        .expect(200);

      const found = listRes.body.find(
        (e: { id: number }) => e.id === createdEventId,
      );
      expect(found).toBeDefined();
      expect(found.name).toBe('Integration Test Concert');

      // Step 3: GET /events/:id to get event detail with price breakdown
      const detailRes = await request(app.getHttpServer())
        .get(`/events/${createdEventId}`)
        .expect(200);

      expect(detailRes.body.id).toBe(createdEventId);
      expect(detailRes.body.priceBreakdown).toBeDefined();
      expect(detailRes.body.priceBreakdown.basePrice).toBe(50);
      expect(detailRes.body.priceBreakdown.finalPrice).toBeGreaterThanOrEqual(30);
      expect(detailRes.body.priceBreakdown.finalPrice).toBeLessThanOrEqual(150);

      // Step 4: Book tickets via POST /bookings
      const bookingRes = await request(app.getHttpServer())
        .post('/bookings')
        .send({
          eventId: createdEventId,
          userEmail: 'integration@test.com',
          quantity: 2,
        })
        .expect(201);

      expect(bookingRes.body.id).toBeDefined();
      expect(bookingRes.body.eventId).toBe(createdEventId);
      expect(bookingRes.body.userEmail).toBe('integration@test.com');
      expect(bookingRes.body.quantity).toBe(2);
      expect(bookingRes.body.pricePaid).toBeGreaterThanOrEqual(0);
      expect(bookingRes.body.bookedAt).toBeDefined();

      // Step 5: GET /bookings?eventId=:id to verify the booking appears
      const bookingsListRes = await request(app.getHttpServer())
        .get(`/bookings?eventId=${createdEventId}`)
        .expect(200);

      const bookingFound = bookingsListRes.body.find(
        (b: { id: number }) => b.id === bookingRes.body.id,
      );
      expect(bookingFound).toBeDefined();
      expect(bookingFound.userEmail).toBe('integration@test.com');
      expect(bookingFound.quantity).toBe(2);

      // Step 6: GET /events/:id again to verify bookedTickets was incremented
      const updatedDetailRes = await request(app.getHttpServer())
        .get(`/events/${createdEventId}`)
        .expect(200);

      expect(updatedDetailRes.body.bookedTickets).toBe(2);
      expect(updatedDetailRes.body.availableTickets).toBe(98);
    });
  });

  describe('Validation tests', () => {
    it('should return 400 when booking with missing fields', async () => {
      const res = await request(app.getHttpServer())
        .post('/bookings')
        .send({})
        .expect(400);

      expect(res.body.statusCode).toBe(400);
      expect(res.body.message).toBeDefined();
    });

    it('should return 400 when booking with invalid email', async () => {
      const res = await request(app.getHttpServer())
        .post('/bookings')
        .send({
          eventId: 1,
          userEmail: 'not-an-email',
          quantity: 1,
        })
        .expect(400);

      expect(res.body.statusCode).toBe(400);
    });

    it('should return 400 when booking with quantity 0', async () => {
      const res = await request(app.getHttpServer())
        .post('/bookings')
        .send({
          eventId: 1,
          userEmail: 'valid@email.com',
          quantity: 0,
        })
        .expect(400);

      expect(res.body.statusCode).toBe(400);
    });

    it('should return 404 when booking with non-existent eventId', async () => {
      const res = await request(app.getHttpServer())
        .post('/bookings')
        .send({
          eventId: 999999,
          userEmail: 'valid@email.com',
          quantity: 1,
        })
        .expect(404);

      expect(res.body.statusCode).toBe(404);
    });
  });

  describe('Overbooking prevention', () => {
    it('should prevent booking more tickets than available', async () => {
      // Create event with only 2 tickets
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 60);

      const createRes = await request(app.getHttpServer())
        .post('/events')
        .set('x-api-key', 'test-api-key')
        .send({
          name: 'Limited Tickets Event',
          date: futureDate.toISOString(),
          venue: 'Small Venue',
          description: 'Only 2 tickets',
          totalTickets: 2,
          basePrice: 50,
          floorPrice: 30,
          ceilingPrice: 150,
        })
        .expect(201);

      const eventId = createRes.body.id;

      // Book 2 tickets — should succeed
      await request(app.getHttpServer())
        .post('/bookings')
        .send({
          eventId,
          userEmail: 'buyer@test.com',
          quantity: 2,
        })
        .expect(201);

      // Try to book 1 more — should fail with 409
      const overRes = await request(app.getHttpServer())
        .post('/bookings')
        .send({
          eventId,
          userEmail: 'latecomer@test.com',
          quantity: 1,
        })
        .expect(409);

      expect(overRes.body.statusCode).toBe(409);
      expect(overRes.body.message).toContain('Not enough tickets available');
    });
  });

  describe('Auth tests', () => {
    const validEventBody = {
      name: 'Auth Test Event',
      date: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
      venue: 'Auth Venue',
      description: 'Testing auth',
      totalTickets: 10,
      basePrice: 40,
      floorPrice: 20,
      ceilingPrice: 100,
    };

    it('should return 401 when creating event without API key', async () => {
      const res = await request(app.getHttpServer())
        .post('/events')
        .send(validEventBody)
        .expect(401);

      expect(res.body.statusCode).toBe(401);
    });

    it('should return 401 when creating event with wrong API key', async () => {
      const res = await request(app.getHttpServer())
        .post('/events')
        .set('x-api-key', 'wrong-key')
        .send(validEventBody)
        .expect(401);

      expect(res.body.statusCode).toBe(401);
    });

    it('should return 201 when creating event with correct API key', async () => {
      const res = await request(app.getHttpServer())
        .post('/events')
        .set('x-api-key', 'test-api-key')
        .send(validEventBody)
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.name).toBe('Auth Test Event');
    });
  });

  describe('Cache invalidation', () => {
    it('should show newly created event in list immediately', async () => {
      // Warm the cache by fetching the event list
      await request(app.getHttpServer()).get('/events').expect(200);

      // Create a new event
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 45);

      const createRes = await request(app.getHttpServer())
        .post('/events')
        .set('x-api-key', 'test-api-key')
        .send({
          name: 'Cache Invalidation Test Event',
          date: futureDate.toISOString(),
          venue: 'Cache Venue',
          description: 'Testing cache invalidation on create',
          totalTickets: 50,
          basePrice: 75,
          floorPrice: 50,
          ceilingPrice: 200,
        })
        .expect(201);

      const newEventId = createRes.body.id;

      // Immediately fetch the list — new event should appear (cache was busted)
      const listRes = await request(app.getHttpServer())
        .get('/events')
        .expect(200);

      const found = listRes.body.find(
        (e: { id: number }) => e.id === newEventId,
      );
      expect(found).toBeDefined();
      expect(found.name).toBe('Cache Invalidation Test Event');
    });

    it('should reflect updated ticket count after booking', async () => {
      // Create an event
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 45);

      const createRes = await request(app.getHttpServer())
        .post('/events')
        .set('x-api-key', 'test-api-key')
        .send({
          name: 'Cache Booking Test Event',
          date: futureDate.toISOString(),
          venue: 'Cache Booking Venue',
          description: 'Testing cache invalidation on booking',
          totalTickets: 20,
          basePrice: 60,
          floorPrice: 40,
          ceilingPrice: 180,
        })
        .expect(201);

      const eventId = createRes.body.id;

      // Warm the detail cache
      await request(app.getHttpServer())
        .get(`/events/${eventId}`)
        .expect(200);

      // Book tickets
      await request(app.getHttpServer())
        .post('/bookings')
        .send({ eventId, userEmail: 'cache@test.com', quantity: 5 })
        .expect(201);

      // Immediately fetch detail — should show updated ticket count (cache was busted)
      const detailRes = await request(app.getHttpServer())
        .get(`/events/${eventId}`)
        .expect(200);

      expect(detailRes.body.bookedTickets).toBe(5);
      expect(detailRes.body.availableTickets).toBe(15);
    });
  });
});
