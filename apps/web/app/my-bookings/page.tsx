'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { lookupBookingsAction, type LookupResult, type BookingWithEventDetails } from '../actions/lookup-bookings';

function formatPrice(price: number): string {
  return price.toFixed(2);
}

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

function PriceComparisonBadge({ pricePaid, currentPrice }: { pricePaid: number; currentPrice: number }) {
  const diff = pricePaid - currentPrice;

  if (Math.abs(diff) < 0.01) {
    return (
      <span className="inline-block rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
        Same as current price
      </span>
    );
  }

  if (diff < 0) {
    return (
      <span className="inline-block rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
        ${formatPrice(Math.abs(diff))} less than current
      </span>
    );
  }

  return (
    <span className="inline-block rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">
      ${formatPrice(diff)} more than current
    </span>
  );
}

function BookingCard({ booking }: { booking: BookingWithEventDetails }) {
  const totalPaid = booking.quantity * booking.pricePaid;

  return (
    <article className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-semibold text-gray-900">
            {booking.eventName ?? `Event #${booking.eventId}`}
          </h3>
          {booking.eventDate && (
            <p className="mt-1 text-sm text-gray-600">
              <time dateTime={booking.eventDate}>
                {formatDate(booking.eventDate)}
              </time>
            </p>
          )}
        </div>
        <Link
          href={`/events/${booking.eventId}`}
          className="shrink-0 text-sm font-medium text-indigo-600 hover:text-indigo-700"
          aria-label={`View event ${booking.eventName ?? booking.eventId}`}
        >
          View Event →
        </Link>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-gray-500">Tickets</dt>
          <dd className="font-medium text-gray-900">{booking.quantity}</dd>
        </div>
        <div>
          <dt className="text-gray-500">Price per Ticket</dt>
          <dd className="font-medium text-gray-900">${formatPrice(booking.pricePaid)}</dd>
        </div>
        <div>
          <dt className="text-gray-500">Total Paid</dt>
          <dd className="font-medium text-indigo-600">${formatPrice(totalPaid)}</dd>
        </div>
        <div>
          <dt className="text-gray-500">Booked</dt>
          <dd className="font-medium text-gray-900">{formatDate(booking.bookedAt)}</dd>
        </div>
      </dl>

      {booking.currentPrice !== null && (
        <div className="mt-4 flex flex-col gap-2 border-t border-gray-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-gray-600">
            Current price:{' '}
            <span className="font-medium text-gray-900">
              ${formatPrice(booking.currentPrice)}
            </span>
          </p>
          <PriceComparisonBadge
            pricePaid={booking.pricePaid}
            currentPrice={booking.currentPrice}
          />
        </div>
      )}
    </article>
  );
}

const initialState: LookupResult = { success: false };

export default function MyBookingsPage() {
  const [state, formAction, isPending] = useActionState(lookupBookingsAction, initialState);

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">My Bookings</h1>
        <p className="mt-2 text-gray-600">
          Enter your email address to view your booking history.
        </p>
      </header>

      <section
        aria-label="Email lookup"
        className="mb-8 rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
      >
        <form action={formAction} className="space-y-4">
          <div>
            <label
              htmlFor="lookup-email"
              className="block text-sm font-medium text-gray-700"
            >
              Email Address
            </label>
            <input
              id="lookup-email"
              name="email"
              type="email"
              required
              placeholder="you@example.com"
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              aria-label="Email address to look up bookings"
            />
          </div>
          <button
            type="submit"
            disabled={isPending}
            className="w-full rounded-lg bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:px-6"
            aria-label={isPending ? 'Looking up bookings' : 'Look up my bookings'}
          >
            {isPending ? 'Looking up…' : 'Look Up Bookings'}
          </button>
        </form>
      </section>

      <section aria-label="Booking results">
        {isPending && (
          <div className="space-y-4" role="status" aria-label="Loading bookings">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="animate-pulse rounded-xl border border-gray-200 bg-white p-6">
                <div className="mb-3 h-5 w-1/2 rounded bg-gray-200" />
                <div className="mb-2 h-4 w-1/3 rounded bg-gray-200" />
                <div className="mb-2 h-4 w-2/3 rounded bg-gray-200" />
                <div className="h-4 w-1/4 rounded bg-gray-200" />
              </div>
            ))}
          </div>
        )}

        {!isPending && state.error && (
          <div
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 p-6 text-center"
          >
            <p className="text-lg font-semibold text-red-800">
              Failed to load bookings
            </p>
            <p className="mt-2 text-sm text-red-600">{state.error}</p>
          </div>
        )}

        {!isPending && state.success && state.bookings && (
          <>
            {state.bookings.length === 0 ? (
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-8 text-center">
                <p className="text-lg font-semibold text-gray-700">No bookings found</p>
                <p className="mt-2 text-sm text-gray-500">
                  No bookings were found for this email address.
                </p>
                <Link
                  href="/events"
                  className="mt-4 inline-block rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                >
                  Browse Events
                </Link>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-gray-600">
                  {state.bookings.length} booking{state.bookings.length !== 1 ? 's' : ''} found
                </p>
                {state.bookings.map((booking) => (
                  <BookingCard key={booking.id} booking={booking} />
                ))}
              </div>
            )}
          </>
        )}
      </section>
    </main>
  );
}
