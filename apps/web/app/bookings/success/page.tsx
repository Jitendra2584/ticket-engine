import Link from 'next/link';
import { fetchEvent } from '../../../lib/api/server';
import type { EventDetailResponse } from '../../../lib/api/types';

function formatPrice(price: number): string {
  return price.toFixed(2);
}

interface BookingParams {
  bookingId: string;
  eventName: string;
  quantity: number;
  pricePaid: number;
  eventId: string;
}

function parseSearchParams(
  raw: Record<string, string | string[] | undefined>,
): BookingParams | null {
  const bookingId = typeof raw.bookingId === 'string' ? raw.bookingId : undefined;
  const eventName = typeof raw.eventName === 'string' ? raw.eventName : undefined;
  const quantityStr = typeof raw.quantity === 'string' ? raw.quantity : undefined;
  const pricePaidStr = typeof raw.pricePaid === 'string' ? raw.pricePaid : undefined;
  const eventId = typeof raw.eventId === 'string' ? raw.eventId : undefined;

  if (!bookingId || !eventName || !quantityStr || !pricePaidStr || !eventId) return null;

  const quantity = parseInt(quantityStr, 10);
  const pricePaid = parseFloat(pricePaidStr);

  if (Number.isNaN(quantity) || Number.isNaN(pricePaid) || quantity <= 0) return null;

  return { bookingId, eventName, quantity, pricePaid, eventId };
}

function PriceComparison({ pricePaid, currentPrice }: { pricePaid: number; currentPrice: number }) {
  const diff = pricePaid - currentPrice;

  let comparisonText: string;
  let comparisonColor: string;

  if (Math.abs(diff) < 0.01) {
    comparisonText = 'Same as the current price';
    comparisonColor = 'text-gray-600';
  } else if (diff < 0) {
    comparisonText = `$${formatPrice(Math.abs(diff))} less than the current price`;
    comparisonColor = 'text-green-600';
  } else {
    comparisonText = `$${formatPrice(diff)} more than the current price`;
    comparisonColor = 'text-amber-600';
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
      <h3 className="text-sm font-medium text-gray-700">Price Comparison</h3>
      <div className="mt-2 flex flex-col gap-1 text-sm sm:flex-row sm:items-center sm:gap-4">
        <span className="text-gray-600">
          You paid: <span className="font-semibold text-gray-900">${formatPrice(pricePaid)}</span>
        </span>
        <span className="hidden sm:inline text-gray-300">|</span>
        <span className="text-gray-600">
          Current price: <span className="font-semibold text-gray-900">${formatPrice(currentPrice)}</span>
        </span>
      </div>
      <p className={`mt-1 text-sm font-medium ${comparisonColor}`}>
        {comparisonText}
      </p>
    </div>
  );
}

export default async function BookingSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const raw = await searchParams;
  const params = parseSearchParams(raw);

  if (!params) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-8 text-center">
          <p className="text-lg font-semibold text-yellow-800">
            Booking details not found
          </p>
          <p className="mt-2 text-sm text-yellow-600">
            It looks like you navigated here directly. Please book tickets from an
            event page to see your confirmation.
          </p>
          <Link
            href="/events"
            className="mt-6 inline-block rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
          >
            Browse Events
          </Link>
        </div>
      </main>
    );
  }

  let currentPrice: number | null = null;
  try {
    const event: EventDetailResponse = await fetchEvent(params.eventId);
    currentPrice = event.priceBreakdown.finalPrice;
  } catch {
    // Price comparison will be skipped if fetch fails
  }

  const totalPaid = params.quantity * params.pricePaid;

  return (
    <main className="mx-auto max-w-2xl px-4 py-16 sm:px-6 lg:px-8">
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="text-center">
          <div
            className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100"
            aria-hidden="true"
          >
            <svg
              className="h-8 w-8 text-green-600"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4.5 12.75l6 6 9-13.5"
              />
            </svg>
          </div>
          <h1 className="mt-4 text-2xl font-bold text-gray-900 sm:text-3xl">
            Booking Confirmed!
          </h1>
          <p className="mt-2 text-gray-600">
            Your tickets have been booked successfully.
          </p>
        </div>

        <section aria-label="Booking details" className="mt-8">
          <h2 className="text-lg font-semibold text-gray-900">
            Booking Details
          </h2>
          <dl className="mt-4 divide-y divide-gray-100">
            <div className="flex justify-between py-3">
              <dt className="text-sm text-gray-600">Booking ID</dt>
              <dd className="text-sm font-medium text-gray-900">
                #{params.bookingId}
              </dd>
            </div>
            <div className="flex justify-between py-3">
              <dt className="text-sm text-gray-600">Event</dt>
              <dd className="text-sm font-medium text-gray-900">
                {params.eventName}
              </dd>
            </div>
            <div className="flex justify-between py-3">
              <dt className="text-sm text-gray-600">Quantity</dt>
              <dd className="text-sm font-medium text-gray-900">
                {params.quantity} ticket{params.quantity !== 1 ? 's' : ''}
              </dd>
            </div>
            <div className="flex justify-between py-3">
              <dt className="text-sm text-gray-600">Price per Ticket</dt>
              <dd className="text-sm font-medium text-gray-900">
                ${formatPrice(params.pricePaid)}
              </dd>
            </div>
            <div className="flex justify-between py-3">
              <dt className="text-sm font-semibold text-gray-900">
                Total Paid
              </dt>
              <dd className="text-sm font-bold text-indigo-600">
                ${formatPrice(totalPaid)}
              </dd>
            </div>
          </dl>
        </section>

        {currentPrice !== null && (
          <section aria-label="Price comparison" className="mt-6">
            <PriceComparison
              pricePaid={params.pricePaid}
              currentPrice={currentPrice}
            />
          </section>
        )}

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href={`/events/${params.eventId}`}
            className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 shadow-sm transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
          >
            View Event
          </Link>
          <Link
            href="/events"
            className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
          >
            Browse More Events
          </Link>
        </div>
      </div>
    </main>
  );
}
