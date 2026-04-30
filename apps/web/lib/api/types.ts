/**
 * Frontend-side TypeScript types mirroring API response shapes.
 * Defined locally so the frontend has no runtime dependency on the API package.
 */

/** A single event in the event list response. */
export interface EventListItem {
  id: number;
  name: string;
  date: string;
  venue: string;
  currentPrice: number;
  availableTickets: number;
  totalTickets: number;
}

/** A single rule's contribution to the price breakdown. */
export interface RuleBreakdownItem {
  name: string;
  rawAdjustment: number;
  weight: number;
  weightedAdjustment: number;
}

/** Full breakdown of how the final price was computed. */
export interface PriceBreakdown {
  basePrice: number;
  rules: RuleBreakdownItem[];
  sumOfWeightedAdjustments: number;
  computedPrice: number;
  finalPrice: number;
  floorPrice: number;
  ceilingPrice: number;
}

/** Full event detail response including price breakdown. */
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
  pricingRules: Record<string, unknown>;
  priceBreakdown: PriceBreakdown;
}

/** A single booking in API responses. */
export interface BookingResponse {
  id: number;
  eventId: number;
  userEmail: string;
  quantity: number;
  pricePaid: number;
  bookedAt: string;
}

/** Extended booking response with event details for the my-bookings page. */
export interface BookingWithEvent extends BookingResponse {
  eventName: string;
  eventDate: string;
  currentPrice: number;
}

/** Input for creating a new booking. */
export interface CreateBookingInput {
  eventId: number;
  userEmail: string;
  quantity: number;
}

/** Metrics for a single event. */
export interface EventAnalytics {
  eventId: number;
  eventName: string;
  totalTicketsSold: number;
  totalRevenue: number;
  averagePricePaid: number;
  remainingTickets: number;
}

/** System-wide metrics across all events. */
export interface SystemSummary {
  totalEvents: number;
  totalBookings: number;
  totalRevenue: number;
  totalTicketsSold: number;
}
