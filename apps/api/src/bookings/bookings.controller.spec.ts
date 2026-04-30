import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import type { BookingResponse } from './dto/booking-response.dto';

describe('BookingsController', () => {
  let controller: BookingsController;
  let bookingsService: {
    createBooking: ReturnType<typeof vi.fn>;
    findByEventId: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    bookingsService = {
      createBooking: vi.fn(),
      findByEventId: vi.fn(),
    };
    controller = new BookingsController(
      bookingsService as unknown as BookingsService,
    );
  });

  describe('create (POST /bookings)', () => {
    it('should call bookingsService.createBooking with the dto and return the result', async () => {
      const dto = { eventId: 1, userEmail: 'user@example.com', quantity: 2 };
      const mockBooking: BookingResponse = {
        id: 1,
        eventId: 1,
        userEmail: 'user@example.com',
        quantity: 2,
        pricePaid: 120,
        bookedAt: '2025-07-01T00:00:00.000Z',
      };
      bookingsService.createBooking.mockResolvedValue(mockBooking);

      const result = await controller.create(dto);

      expect(bookingsService.createBooking).toHaveBeenCalledWith(dto);
      expect(result).toEqual(mockBooking);
    });
  });

  describe('findByEventId (GET /bookings)', () => {
    it('should call bookingsService.findByEventId with the parsed eventId', async () => {
      const mockBookings: BookingResponse[] = [
        {
          id: 1,
          eventId: 5,
          userEmail: 'user@example.com',
          quantity: 1,
          pricePaid: 100,
          bookedAt: '2025-07-01T00:00:00.000Z',
        },
      ];
      bookingsService.findByEventId.mockResolvedValue(mockBookings);

      const result = await controller.findByEventId('5');

      expect(bookingsService.findByEventId).toHaveBeenCalledWith(5);
      expect(result).toEqual(mockBookings);
    });

    it('should throw BadRequestException when eventId is undefined', () => {
      expect(() => controller.findByEventId(undefined)).toThrow(
        BadRequestException,
      );
      expect(() => controller.findByEventId(undefined)).toThrow(
        'eventId query parameter is required',
      );
    });

    it('should throw BadRequestException when eventId is not a valid number', () => {
      expect(() => controller.findByEventId('abc')).toThrow(
        BadRequestException,
      );
      expect(() => controller.findByEventId('abc')).toThrow(
        'eventId query parameter is required',
      );
    });
  });
});
