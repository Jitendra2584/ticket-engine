'use server';

import { fetchBookingsByEmail, fetchEvent } from '../../lib/api/server';
import type { BookingResponse, EventDetailResponse } from '../../lib/api/types';

export interface BookingWithEventDetails {
  id: number;
  eventId: number;
  userEmail: string;
  quantity: number;
  pricePaid: number;
  bookedAt: string;
  eventName: string | null;
  eventDate: string | null;
  currentPrice: number | null;
}

export interface LookupResult {
  success: boolean;
  error?: string;
  bookings?: BookingWithEventDetails[];
}

export async function lookupBookingsAction(
  _prev: LookupResult,
  formData: FormData,
): Promise<LookupResult> {
  const email = String(formData.get('email') ?? '').trim();

  if (!email) {
    return { success: false, error: 'Please enter an email address.' };
  }

  try {
    const bookings: BookingResponse[] = await fetchBookingsByEmail(email);

    const uniqueEventIds = [...new Set(bookings.map((b) => b.eventId))];
    const eventDetailsMap = new Map<number, { name: string; date: string; currentPrice: number }>();

    await Promise.allSettled(
      uniqueEventIds.map(async (eventId) => {
        try {
          const event: EventDetailResponse = await fetchEvent(String(eventId));
          eventDetailsMap.set(eventId, {
            name: event.name,
            date: event.date,
            currentPrice: event.priceBreakdown.finalPrice,
          });
        } catch {
          // skip failed event lookups
        }
      }),
    );

    const enriched: BookingWithEventDetails[] = bookings.map((booking) => {
      const details = eventDetailsMap.get(booking.eventId);
      return {
        ...booking,
        eventName: details?.name ?? null,
        eventDate: details?.date ?? null,
        currentPrice: details?.currentPrice ?? null,
      };
    });

    return { success: true, bookings: enriched };
  } catch {
    return { success: false, error: 'Failed to fetch bookings. Please try again.' };
  }
}
