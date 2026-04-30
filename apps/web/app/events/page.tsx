'use client';

import Link from 'next/link';
import { useEvents } from '../../lib/api/hooks';
import type { EventListItem } from '../../lib/api/types';

function formatDate(dateString: string): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(dateString));
}

function formatPrice(price: number): string {
  return `$${price.toFixed(2)}`;
}

function LoadingSkeleton() {
  return (
    <div
      className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3"
      role="status"
      aria-label="Loading events"
    >
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="animate-pulse rounded-2xl border border-gray-200 bg-white p-6"
        >
          <div className="mb-3 h-6 w-3/4 rounded bg-gray-200" />
          <div className="mb-2 h-4 w-1/2 rounded bg-gray-200" />
          <div className="mb-2 h-4 w-2/3 rounded bg-gray-200" />
          <div className="mt-4 flex items-center justify-between">
            <div className="h-5 w-1/4 rounded bg-gray-200" />
            <div className="h-5 w-1/3 rounded bg-gray-200" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ErrorMessage({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="mx-auto max-w-md rounded-xl border border-red-200 bg-red-50 p-6 text-center"
    >
      <p className="text-lg font-semibold text-red-800">
        Failed to load events
      </p>
      <p className="mt-2 text-sm text-red-600">{message}</p>
    </div>
  );
}

function EventCard({ event }: { event: EventListItem }) {
  const remainingTickets = event.availableTickets;
  const soldOut = remainingTickets <= 0;

  return (
    <article className="flex flex-col rounded-2xl border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md">
      <Link
        href={`/events/${event.id}`}
        className="flex flex-1 flex-col p-6"
        aria-label={`View details for ${event.name}`}
      >
        <h2 className="text-lg font-semibold text-gray-900">{event.name}</h2>

        <p className="mt-2 text-sm text-gray-600">
          <time dateTime={event.date}>{formatDate(event.date)}</time>
        </p>

        <p className="mt-1 text-sm text-gray-600">{event.venue}</p>

        <div className="mt-auto flex items-end justify-between pt-4">
          <span className="text-xl font-bold text-indigo-600">
            {formatPrice(event.currentPrice)}
          </span>

          <span
            className={`text-sm font-medium ${soldOut ? 'text-red-600' : 'text-gray-500'}`}
            aria-label={
              soldOut
                ? 'Sold out'
                : `${remainingTickets} of ${event.totalTickets} tickets remaining`
            }
          >
            {soldOut
              ? 'Sold out'
              : `${remainingTickets} / ${event.totalTickets} tickets`}
          </span>
        </div>
      </Link>
    </article>
  );
}

export default function EventsPage() {
  const { data: events, error, isLoading } = useEvents();

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Upcoming Events</h1>
        <p className="mt-2 text-gray-600">
          Browse events and grab your tickets before prices change.
        </p>
      </header>

      <section aria-label="Event listings">
        {isLoading && <LoadingSkeleton />}

        {error && (
          <ErrorMessage
            message={
              error instanceof Error
                ? error.message
                : 'An unexpected error occurred. Please try again later.'
            }
          />
        )}

        {events && events.length === 0 && (
          <p className="py-12 text-center text-gray-500">
            No events available right now. Check back soon.
          </p>
        )}

        {events && events.length > 0 && (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {events.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
