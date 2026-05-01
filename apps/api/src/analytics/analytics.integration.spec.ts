import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../app.module';

const hasDatabase = !!process.env.DATABASE_URL;

process.env.API_KEY = 'test-api-key';

describe.skipIf(!hasDatabase)('Analytics Integration', () => {
  let app: INestApplication;
  let eventId: number;

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

    // Create a test event and book some tickets
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 60);

    const eventRes = await request(app.getHttpServer())
      .post('/events')
      .set('x-api-key', 'test-api-key')
      .send({
        name: 'Analytics Test Event',
        date: futureDate.toISOString(),
        venue: 'Analytics Venue',
        description: 'Event for analytics testing',
        totalTickets: 50,
        basePrice: 100,
        floorPrice: 50,
        ceilingPrice: 300,
      })
      .expect(201);

    eventId = eventRes.body.id;

    // Get current price for bookings
    const detailRes = await request(app.getHttpServer())
      .get(`/events/${eventId}`)
      .expect(200);
    const expectedPrice = detailRes.body.priceBreakdown.finalPrice;

    // Create two bookings
    await request(app.getHttpServer())
      .post('/bookings')
      .send({ eventId, userEmail: 'analytics1@test.com', quantity: 3, expectedPrice })
      .expect(201);

    await request(app.getHttpServer())
      .post('/bookings')
      .send({ eventId, userEmail: 'analytics2@test.com', quantity: 2, expectedPrice })
      .expect(201);
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('should return event analytics with correct metrics', async () => {
    const res = await request(app.getHttpServer())
      .get(`/analytics/events/${eventId}`)
      .expect(200);

    expect(res.body.eventId).toBe(eventId);
    expect(res.body.eventName).toBe('Analytics Test Event');
    expect(res.body.totalTicketsSold).toBe(5); // 3 + 2
    expect(res.body.totalRevenue).toBeGreaterThan(0);
    expect(res.body.averagePricePaid).toBeGreaterThan(0);
    expect(res.body.remainingTickets).toBe(45); // 50 - 5
  });

  it('should return 404 for non-existent event analytics', async () => {
    await request(app.getHttpServer())
      .get('/analytics/events/999999')
      .expect(404);
  });

  it('should return system summary with correct metrics', async () => {
    const res = await request(app.getHttpServer())
      .get('/analytics/summary')
      .expect(200);

    expect(res.body.totalEvents).toBeGreaterThanOrEqual(1);
    expect(res.body.totalBookings).toBeGreaterThanOrEqual(2);
    expect(res.body.totalRevenue).toBeGreaterThan(0);
    expect(res.body.totalTicketsSold).toBeGreaterThanOrEqual(5);
  });
});
