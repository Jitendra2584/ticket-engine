/**
 * Represents a single booking in API responses.
 * Returned by POST /bookings and GET /bookings.
 */
export interface BookingResponse {
  id: number;
  eventId: number;
  userEmail: string;
  quantity: number;
  pricePaid: number;
  bookedAt: string;
}

/**
 * Extended booking response with event details.
 * Used by the my-bookings page to show event context alongside each booking.
 */
export interface BookingWithEvent extends BookingResponse {
  eventName: string;
  eventDate: string;
  currentPrice: number;
}
