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
    findByEmail: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    bookingsService = {
      createBooking: vi.fn(),
      findByEventId: vi.fn(),
      findByEmail: vi.fn(),
    };
    controller = new BookingsController(
      bookingsService as unknown as BookingsService,
    );
  });

  describe('create (POST /bookings)', () => {
    it('should call bookingsService.createBooking with the dto and return the result', async () => {
      const dto = { eventId: 1, userEmail: 'user@example.com', quantity: 2, expectedPrice: 120 };
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

  describe('find (GET /bookings)', () => {
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

      const result = await controller.find('5', undefined);

      expect(bookingsService.findByEventId).toHaveBeenCalledWith(5);
      expect(result).toEqual(mockBookings);
    });

    it('should call bookingsService.findByEmail when email is provided', async () => {
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
      bookingsService.findByEmail.mockResolvedValue(mockBookings);

      const result = await controller.find(undefined, 'user@example.com');

      expect(bookingsService.findByEmail).toHaveBeenCalledWith('user@example.com');
      expect(result).toEqual(mockBookings);
    });

    it('should throw BadRequestException when neither eventId nor email is provided', () => {
      expect(() => controller.find(undefined, undefined)).toThrow(
        BadRequestException,
      );
      expect(() => controller.find(undefined, undefined)).toThrow(
        'eventId or email query parameter is required',
      );
    });

    it('should throw BadRequestException when eventId is not a valid number', () => {
      expect(() => controller.find('abc', undefined)).toThrow(
        BadRequestException,
      );
      expect(() => controller.find('abc', undefined)).toThrow(
        'eventId must be a valid number',
      );
    });
  });
});
