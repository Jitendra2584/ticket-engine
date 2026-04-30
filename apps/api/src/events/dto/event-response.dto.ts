import type { PriceBreakdown } from '../../pricing/pricing.types';
import { PricingRulesConfigDto } from './create-event.dto';

/**
 * Represents a single event in the event list response.
 * Contains summary information including computed current price and availability.
 */
export interface EventListItem {
  id: number;
  name: string;
  date: string;
  venue: string;
  currentPrice: number;
  availableTickets: number;
  totalTickets: number;
}

/**
 * Full event detail response including price breakdown.
 * Returned by GET /events/:id.
 */
export interface EventDetailResponse {
  id: number;
  name: string;
  date: string;
  venue: string;
  description: string;
  totalTickets: number;
  bookedTickets: number;
  availableTickets: number;
  basePrice: number;
  floorPrice: number;
  ceilingPrice: number;
  pricingRules: PricingRulesConfigDto;
  priceBreakdown: PriceBreakdown;
}
