import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import type { EventListItem, EventDetailResponse } from './dto/event-response.dto';

describe('EventsController', () => {
  let controller: EventsController;
  let eventsService: {
    findAll: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    eventsService = {
      findAll: vi.fn(),
      findOne: vi.fn(),
      create: vi.fn(),
    };
    controller = new EventsController(eventsService as unknown as EventsService);
  });

  describe('findAll', () => {
    it('should call eventsService.findAll and return the result', async () => {
      const mockEvents: EventListItem[] = [
        {
          id: 1,
          name: 'Concert',
          date: '2025-08-01T00:00:00.000Z',
          venue: 'Arena',
          currentPrice: 120,
          availableTickets: 50,
          totalTickets: 100,
        },
      ];
      eventsService.findAll.mockResolvedValue(mockEvents);

      const result = await controller.findAll();

      expect(eventsService.findAll).toHaveBeenCalledOnce();
      expect(result).toEqual(mockEvents);
    });
  });

  describe('findOne', () => {
    it('should call eventsService.findOne with the parsed id and return the result', async () => {
      const mockDetail: EventDetailResponse = {
        id: 1,
        name: 'Concert',
        date: '2025-08-01T00:00:00.000Z',
        venue: 'Arena',
        description: 'A great concert',
        totalTickets: 100,
        bookedTickets: 50,
        availableTickets: 50,
        basePrice: 100,
        floorPrice: 80,
        ceilingPrice: 200,
        pricingRules: {} as any,
        priceBreakdown: {
          basePrice: 100,
          rules: [],
          sumOfWeightedAdjustments: 0,
          computedPrice: 100,
          finalPrice: 100,
          floorPrice: 80,
          ceilingPrice: 200,
        },
      };
      eventsService.findOne.mockResolvedValue(mockDetail);

      const result = await controller.findOne(1);

      expect(eventsService.findOne).toHaveBeenCalledWith(1);
      expect(result).toEqual(mockDetail);
    });
  });

  describe('create', () => {
    it('should call eventsService.create with the dto and return the result', async () => {
      const dto = {
        name: 'New Event',
        date: '2025-09-01T00:00:00.000Z',
        venue: 'Stadium',
        totalTickets: 500,
        basePrice: 50,
        floorPrice: 30,
        ceilingPrice: 150,
      };
      const mockCreated = { id: 2, ...dto, bookedTickets: 0 };
      eventsService.create.mockResolvedValue(mockCreated);

      const result = await controller.create(dto as Parameters<typeof controller.create>[0]);

      expect(eventsService.create).toHaveBeenCalledWith(dto);
      expect(result).toEqual(mockCreated);
    });
  });
});
