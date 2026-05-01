const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export async function fetchEvents() {
  const res = await fetch(`${API_BASE}/events`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch events');
  return res.json();
}

export async function fetchEvent(id: string) {
  const res = await fetch(`${API_BASE}/events/${id}`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch event');
  return res.json();
}

export async function fetchBookingsByEmail(email: string) {
  const res = await fetch(`${API_BASE}/bookings?email=${encodeURIComponent(email)}`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch bookings');
  return res.json();
}
