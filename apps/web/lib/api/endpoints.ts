/**
 * Centralized API endpoint URLs.
 * Single source of truth for all API routes used by the frontend.
 */
export const API_ENDPOINTS = {
  events: {
    list: '/events',
    detail: (id: string) => `/events/${id}`,
    create: '/events',
  },
  bookings: {
    create: '/bookings',
    list: (eventId: string) => `/bookings?eventId=${eventId}`,
    byEmail: (email: string) => `/bookings?email=${email}`,
  },
  analytics: {
    event: (id: string) => `/analytics/events/${id}`,
    summary: '/analytics/summary',
  },
  seed: '/seed',
} as const;
