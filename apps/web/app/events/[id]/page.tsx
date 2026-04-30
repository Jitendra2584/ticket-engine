'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useEvent } from '../../../lib/api/hooks';
import { apiClient } from '../../../lib/api/client';
import { API_ENDPOINTS } from '../../../lib/api/endpoints';
import type {
  EventDetailResponse,
  RuleBreakdownItem,
  CreateBookingInput,
  BookingResponse,
} from '../../../lib/api/types';
import { AxiosError } from 'axios';

/* ------------------------------------------------------------------ */
/*  Formatting helpers                                                 */
/* ------------------------------------------------------------------ */

function formatDate(dateString: string): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(dateString));
}

function formatPrice(price: number): string {
  return price.toFixed(2);
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

/* ------------------------------------------------------------------ */
/*  Loading skeleton                                                   */
/* ------------------------------------------------------------------ */

function LoadingSkeleton() {
  return (
    <div
      className="mx-auto max-w-3xl animate-pulse space-y-6 px-4 py-8"
      role="status"
      aria-label="Loading event details"
    >
      <div className="h-8 w-2/3 rounded bg-gray-200" />
      <div className="h-5 w-1/3 rounded bg-gray-200" />
      <div className="h-5 w-1/2 rounded bg-gray-200" />
      <div className="h-20 w-full rounded bg-gray-200" />
      <div className="h-48 w-full rounded bg-gray-200" />
      <div className="h-40 w-full rounded bg-gray-200" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Error display                                                      */
/* ------------------------------------------------------------------ */

function ErrorMessage({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="mx-auto max-w-md rounded-xl border border-red-200 bg-red-50 p-6 text-center"
    >
      <p className="text-lg font-semibold text-red-800">
        Failed to load event
      </p>
      <p className="mt-2 text-sm text-red-600">{message}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Price Breakdown table                                              */
/* ------------------------------------------------------------------ */

function PriceBreakdownSection({ event }: { event: EventDetailResponse }) {
  const { priceBreakdown } = event;

  return (
    <section aria-label="Price breakdown" className="rounded-xl border border-gray-200 bg-white p-6">
      <h2 className="mb-4 text-xl font-semibold text-gray-900">
        Price Breakdown
      </h2>

      <dl className="space-y-2 text-sm">
        <div className="flex justify-between">
          <dt className="text-gray-600">Base Price</dt>
          <dd className="font-medium text-gray-900">
            ${formatPrice(priceBreakdown.basePrice)}
          </dd>
        </div>
      </dl>

      {priceBreakdown.rules.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm" aria-label="Pricing rules">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="pb-2 pr-4 font-medium">Rule</th>
                <th className="pb-2 pr-4 text-right font-medium">Raw Adj.</th>
                <th className="pb-2 pr-4 text-right font-medium">Weight</th>
                <th className="pb-2 text-right font-medium">Weighted Adj.</th>
              </tr>
            </thead>
            <tbody>
              {priceBreakdown.rules.map((rule: RuleBreakdownItem) => (
                <tr key={rule.name} className="border-b border-gray-100">
                  <td className="py-2 pr-4 text-gray-700">{rule.name}</td>
                  <td className="py-2 pr-4 text-right text-gray-700">
                    {formatPercent(rule.rawAdjustment)}
                  </td>
                  <td className="py-2 pr-4 text-right text-gray-700">
                    {rule.weight.toFixed(2)}
                  </td>
                  <td className="py-2 text-right text-gray-700">
                    {formatPercent(rule.weightedAdjustment)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <dl className="mt-4 space-y-2 border-t border-gray-200 pt-4 text-sm">
        <div className="flex justify-between">
          <dt className="text-gray-600">Sum of Weighted Adjustments</dt>
          <dd className="font-medium text-gray-900">
            {formatPercent(priceBreakdown.sumOfWeightedAdjustments)}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-gray-600">Computed Price (before clamping)</dt>
          <dd className="font-medium text-gray-900">
            ${formatPrice(priceBreakdown.computedPrice)}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-gray-600">Floor Price</dt>
          <dd className="font-medium text-gray-900">
            ${formatPrice(priceBreakdown.floorPrice)}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-gray-600">Ceiling Price</dt>
          <dd className="font-medium text-gray-900">
            ${formatPrice(priceBreakdown.ceilingPrice)}
          </dd>
        </div>
        <div className="flex justify-between text-base">
          <dt className="font-semibold text-gray-900">Final Price</dt>
          <dd className="font-bold text-indigo-600">
            ${formatPrice(priceBreakdown.finalPrice)}
          </dd>
        </div>
      </dl>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Booking form                                                       */
/* ------------------------------------------------------------------ */

function BookingForm({ event }: { event: EventDetailResponse }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const available = event.availableTickets;
  const currentPrice = event.priceBreakdown.finalPrice;
  const totalPrice = quantity * currentPrice;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const payload: CreateBookingInput = {
        eventId: event.id,
        userEmail: email,
        quantity,
      };

      const response = await apiClient.post<BookingResponse>(
        API_ENDPOINTS.bookings.create,
        payload,
      );

      const booking = response.data;
      const params = new URLSearchParams({
        bookingId: String(booking.id),
        eventName: event.name,
        quantity: String(booking.quantity),
        pricePaid: String(booking.pricePaid),
        eventId: String(event.id),
      });

      router.push(`/bookings/success?${params.toString()}`);
    } catch (err) {
      if (err instanceof AxiosError && err.response) {
        const data = err.response.data as { message?: string | string[] };
        const msg = Array.isArray(data.message)
          ? data.message.join(', ')
          : data.message ?? 'Booking failed. Please try again.';
        setError(msg);
      } else {
        setError('An unexpected error occurred. Please try again.');
      }
      setSubmitting(false);
    }
  }

  if (available <= 0) {
    return (
      <section
        aria-label="Booking"
        className="rounded-xl border border-gray-200 bg-gray-50 p-6 text-center"
      >
        <p className="text-lg font-semibold text-red-600">Sold Out</p>
        <p className="mt-1 text-sm text-gray-500">
          No tickets are currently available for this event.
        </p>
      </section>
    );
  }

  return (
    <section aria-label="Book tickets" className="rounded-xl border border-gray-200 bg-white p-6">
      <h2 className="mb-4 text-xl font-semibold text-gray-900">
        Book Tickets
      </h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="email"
            className="block text-sm font-medium text-gray-700"
          >
            Email Address
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            aria-label="Email address"
          />
        </div>

        <div>
          <label
            htmlFor="quantity"
            className="block text-sm font-medium text-gray-700"
          >
            Quantity
          </label>
          <input
            id="quantity"
            type="number"
            required
            min={1}
            max={available}
            value={quantity}
            onChange={(e) => setQuantity(Math.max(1, Math.min(available, Number(e.target.value))))}
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            aria-label="Number of tickets"
          />
          <p className="mt-1 text-xs text-gray-500">
            {available} ticket{available !== 1 ? 's' : ''} available
          </p>
        </div>

        <div className="rounded-lg bg-gray-50 p-4">
          <div className="flex justify-between text-sm text-gray-600">
            <span>Price per ticket</span>
            <span>${formatPrice(currentPrice)}</span>
          </div>
          <div className="flex justify-between text-sm text-gray-600">
            <span>Quantity</span>
            <span>× {quantity}</span>
          </div>
          <div className="mt-2 flex justify-between border-t border-gray-200 pt-2 text-base font-semibold text-gray-900">
            <span>Total</span>
            <span>${formatPrice(totalPrice)}</span>
          </div>
        </div>

        {error && (
          <div role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          aria-label={submitting ? 'Booking in progress' : 'Confirm booking'}
        >
          {submitting ? 'Booking…' : 'Confirm Booking'}
        </button>
      </form>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Event detail content                                               */
/* ------------------------------------------------------------------ */

function EventDetailContent({ event }: { event: EventDetailResponse }) {
  return (
    <div className="space-y-6">
      {/* Event header */}
      <header>
        <h1 className="text-3xl font-bold text-gray-900">{event.name}</h1>
        <div className="mt-3 space-y-1 text-gray-600">
          <p>
            <time dateTime={event.date}>{formatDate(event.date)}</time>
          </p>
          <p>{event.venue}</p>
        </div>
        {event.description && (
          <p className="mt-4 text-gray-700">{event.description}</p>
        )}
      </header>

      {/* Ticket availability summary */}
      <div className="flex flex-wrap gap-4 text-sm">
        <span className="rounded-full bg-indigo-50 px-3 py-1 font-medium text-indigo-700">
          {event.availableTickets} / {event.totalTickets} tickets available
        </span>
        <span className="rounded-full bg-green-50 px-3 py-1 font-medium text-green-700">
          Current price: ${formatPrice(event.priceBreakdown.finalPrice)}
        </span>
      </div>

      {/* Two-column layout on larger screens */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <PriceBreakdownSection event={event} />
        <BookingForm event={event} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page component                                                     */
/* ------------------------------------------------------------------ */

export default function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: event, error, isLoading } = useEvent(id);

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
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

      {event && <EventDetailContent event={event} />}
    </main>
  );
}
