import type { Metadata } from "next";
import localFont from "next/font/local";
import Link from "next/link";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  title: "Ticketing System",
  description: "Event ticketing platform with dynamic pricing",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} min-h-screen bg-gray-50`}>
        <header className="border-b border-gray-200 bg-white shadow-sm">
          <nav
            className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8"
            aria-label="Main navigation"
          >
            <Link
              href="/"
              className="text-xl font-bold tracking-tight text-gray-900"
            >
              Ticketing System
            </Link>
            <ul className="flex items-center gap-2 sm:gap-4">
              <li>
                <Link
                  href="/events"
                  className="rounded-lg px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 hover:text-gray-900"
                >
                  Events
                </Link>
              </li>
              <li>
                <Link
                  href="/my-bookings"
                  className="rounded-lg px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 hover:text-gray-900"
                >
                  My Bookings
                </Link>
              </li>
            </ul>
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
