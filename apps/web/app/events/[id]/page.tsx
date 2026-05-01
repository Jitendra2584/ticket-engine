import { notFound } from 'next/navigation';
import { fetchEvent } from '../../../lib/api/server';
import type { EventDetailResponse, RuleBreakdownItem } from '../../../lib/api/types';
import BookingForm from './booking-form';

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

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let event: EventDetailResponse;
  try {
    event = await fetchEvent(id);
  } catch {
    notFound();
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="space-y-6">
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

        <div className="flex flex-wrap gap-4 text-sm">
          <span className="rounded-full bg-indigo-50 px-3 py-1 font-medium text-indigo-700">
            {event.availableTickets} / {event.totalTickets} tickets available
          </span>
          <span className="rounded-full bg-green-50 px-3 py-1 font-medium text-green-700">
            Current price: ${formatPrice(event.priceBreakdown.finalPrice)}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <PriceBreakdownSection event={event} />
          <BookingForm
            eventId={event.id}
            eventName={event.name}
            availableTickets={event.availableTickets}
            currentPrice={event.priceBreakdown.finalPrice}
          />
        </div>
      </div>
    </main>
  );
}
