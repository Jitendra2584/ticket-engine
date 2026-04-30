'use client';

import useSWR from 'swr';
import { fetcher } from './client';
import { API_ENDPOINTS } from './endpoints';
import type {
  EventListItem,
  EventDetailResponse,
  BookingResponse,
} from './types';

/** Fetch the list of all events. */
export function useEvents() {
  return useSWR<EventListItem[]>(API_ENDPOINTS.events.list, fetcher);
}

/** Fetch a single event's full detail with price breakdown. Polls every 30s. */
export function useEvent(id: string) {
  return useSWR<EventDetailResponse>(
    API_ENDPOINTS.events.detail(id),
    fetcher,
    { refreshInterval: 30_000 },
  );
}

/** Fetch all bookings for a specific event. */
export function useBookingsByEvent(eventId: string) {
  return useSWR<BookingResponse[]>(
    API_ENDPOINTS.bookings.list(eventId),
    fetcher,
  );
}
