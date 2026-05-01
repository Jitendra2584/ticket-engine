'use server';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export interface BookingActionResult {
  success: boolean;
  error?: string;
  newPrice?: number;
  booking?: {
    id: number;
    eventId: number;
    quantity: number;
    pricePaid: number;
  };
}

export async function createBookingAction(
  _prev: BookingActionResult,
  formData: FormData,
): Promise<BookingActionResult> {
  const eventId = Number(formData.get('eventId'));
  const userEmail = String(formData.get('userEmail') ?? '');
  const quantity = Number(formData.get('quantity'));
  const expectedPrice = formData.get('expectedPrice')
    ? Number(formData.get('expectedPrice'))
    : undefined;

  if (!userEmail || !eventId || !quantity || quantity < 1) {
    return { success: false, error: 'Please fill in all fields.' };
  }

  try {
    const res = await fetch(`${API_BASE}/bookings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventId, userEmail, quantity, expectedPrice }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      // NestJS wraps object payloads: { statusCode, message: { code, currentPrice, ... } }
      const payload = typeof data.message === 'object' ? data.message : data;
      if (payload.code === 'PRICE_CHANGED') {
        return {
          success: false,
          error: `Price changed to $${Number(payload.currentPrice).toFixed(2)}. Please review and try again.`,
          newPrice: payload.currentPrice,
        };
      }
      const msg = Array.isArray(data.message)
        ? data.message.join(', ')
        : (typeof data.message === 'string' ? data.message : 'Booking failed. Please try again.');
      return { success: false, error: msg };
    }

    const booking = await res.json();
    return {
      success: true,
      booking: {
        id: booking.id,
        eventId: booking.eventId,
        quantity: booking.quantity,
        pricePaid: booking.pricePaid,
      },
    };
  } catch {
    return { success: false, error: 'An unexpected error occurred. Please try again.' };
  }
}
