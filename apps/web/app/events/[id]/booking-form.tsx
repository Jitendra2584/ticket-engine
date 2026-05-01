'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createBookingAction, type BookingActionResult } from '../../actions/booking';

function formatPrice(price: number): string {
  return price.toFixed(2);
}

const initialState: BookingActionResult = { success: false };

export default function BookingForm({
  eventId,
  eventName,
  availableTickets,
  currentPrice,
}: {
  eventId: number;
  eventName: string;
  availableTickets: number;
  currentPrice: number;
}) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(createBookingAction, initialState);
  const [displayPrice, setDisplayPrice] = useState(currentPrice);

  // Update displayed price when server returns a new price (price changed error)
  useEffect(() => {
    if (state.newPrice) {
      setDisplayPrice(state.newPrice);
    }
  }, [state.newPrice]);

  useEffect(() => {
    if (state.success && state.booking) {
      const params = new URLSearchParams({
        bookingId: String(state.booking.id),
        eventName,
        quantity: String(state.booking.quantity),
        pricePaid: String(state.booking.pricePaid),
        eventId: String(state.booking.eventId),
      });
      router.push(`/bookings/success?${params.toString()}`);
    }
  }, [state, eventName, router]);

  if (availableTickets <= 0) {
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

      <form action={formAction} className="space-y-4">
        <input type="hidden" name="eventId" value={eventId} />
        <input type="hidden" name="expectedPrice" value={displayPrice} />

        <div>
          <label
            htmlFor="userEmail"
            className="block text-sm font-medium text-gray-700"
          >
            Email Address
          </label>
          <input
            id="userEmail"
            name="userEmail"
            type="email"
            required
            placeholder="you@example.com"
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
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
            name="quantity"
            type="number"
            required
            min={1}
            max={availableTickets}
            defaultValue={1}
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <p className="mt-1 text-xs text-gray-500">
            {availableTickets} ticket{availableTickets !== 1 ? 's' : ''} available
          </p>
        </div>

        <div className="rounded-lg bg-gray-50 p-4">
          <div className="flex justify-between text-sm text-gray-600">
            <span>Price per ticket</span>
            <span>${formatPrice(displayPrice)}</span>
          </div>
        </div>

        {state.error && (
          <div role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {state.error}
          </div>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="w-full rounded-lg bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          aria-label={isPending ? 'Booking in progress' : 'Confirm booking'}
        >
          {isPending ? 'Booking…' : 'Confirm Booking'}
        </button>
      </form>
    </section>
  );
}
