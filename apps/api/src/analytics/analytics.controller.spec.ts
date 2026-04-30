import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import type { EventAnalytics, SystemSummary } from './analytics.service';

describe('AnalyticsController', () => {
  let controller: AnalyticsController;
  let analyticsService: {
    getEventAnalytics: ReturnType<typeof vi.fn>;
    getSystemSummary: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    analyticsService = {
      getEventAnalytics: vi.fn(),
      getSystemSummary: vi.fn(),
    };
    controller = new AnalyticsController(
      analyticsService as unknown as AnalyticsService,
    );
  });

  describe('getEventAnalytics', () => {
    it('should call analyticsService.getEventAnalytics with the parsed id', async () => {
      const mockAnalytics: EventAnalytics = {
        eventId: 1,
        eventName: 'Test Event',
        totalTicketsSold: 50,
        totalRevenue: 5000,
        averagePricePaid: 100,
        remainingTickets: 50,
      };
      analyticsService.getEventAnalytics.mockResolvedValue(mockAnalytics);

      const result = await controller.getEventAnalytics(1);

      expect(analyticsService.getEventAnalytics).toHaveBeenCalledWith(1);
      expect(result).toEqual(mockAnalytics);
    });
  });

  describe('getSystemSummary', () => {
    it('should call analyticsService.getSystemSummary and return the result', async () => {
      const mockSummary: SystemSummary = {
        totalEvents: 5,
        totalBookings: 100,
        totalRevenue: 10000,
        totalTicketsSold: 200,
      };
      analyticsService.getSystemSummary.mockResolvedValue(mockSummary);

      const result = await controller.getSystemSummary();

      expect(analyticsService.getSystemSummary).toHaveBeenCalledOnce();
      expect(result).toEqual(mockSummary);
    });
  });
});
