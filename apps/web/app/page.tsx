import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
      <section className="text-center">
        <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
          Dynamic Event Pricing
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg leading-relaxed text-gray-600">
          Browse upcoming events, see real-time pricing powered by intelligent
          algorithms, and book your tickets before prices change.
        </p>
        <div className="mt-8">
          <Link
            href="/events"
            className="inline-block rounded-lg bg-indigo-600 px-6 py-3 text-base font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
          >
            Browse Events
          </Link>
        </div>
      </section>

      <section className="mt-20 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">
            Real-Time Pricing
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-gray-600">
            Prices adjust automatically based on demand, time to event, and
            remaining inventory.
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">
            Instant Booking
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-gray-600">
            Secure your tickets with a seamless booking flow and instant
            confirmation.
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">
            Price Transparency
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-gray-600">
            See a full breakdown of how each ticket price is calculated, with
            every rule visible.
          </p>
        </div>
      </section>
    </main>
  );
}
