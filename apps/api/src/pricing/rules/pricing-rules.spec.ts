import { describe, it, expect } from 'vitest';
import { computeTimeAdjustment, createTimeRule } from './time.rule';
import { computeDemandAdjustment, createDemandRule } from './demand.rule';
import { computeInventoryAdjustment, createInventoryRule } from './inventory.rule';
import type { EventPricingState } from '../pricing.types';

/* ------------------------------------------------------------------ */
/*  Helper                                                             */
/* ------------------------------------------------------------------ */

function makeState(overrides: Partial<EventPricingState> = {}): EventPricingState {
  const now = new Date('2025-06-01T12:00:00Z');
  return {
    eventDate: new Date('2025-08-01T20:00:00Z'),
    now,
    totalTickets: 100,
    bookedTickets: 0,
    recentBookingsCount: 0,
    ...overrides,
  };
}

function daysFromNow(now: Date, days: number): Date {
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
}

/* ------------------------------------------------------------------ */
/*  Time Rule                                                          */
/* ------------------------------------------------------------------ */

describe('Time Rule', () => {
  const now = new Date('2025-06-01T12:00:00Z');

  it('should return 0 when event is more than 30 days away', () => {
    const state = makeState({ eventDate: daysFromNow(now, 31), now });
    expect(computeTimeAdjustment(state)).toBe(0);
  });

  it('should return 0 when event is exactly 31 days away', () => {
    const state = makeState({ eventDate: daysFromNow(now, 31), now });
    expect(computeTimeAdjustment(state)).toBe(0);
  });

  it('should return 0.50 when event is today (0 days)', () => {
    const state = makeState({ eventDate: daysFromNow(now, 0), now });
    expect(computeTimeAdjustment(state)).toBe(0.50);
  });

  it('should return 0.50 when event is tomorrow (1 day)', () => {
    const state = makeState({ eventDate: daysFromNow(now, 1), now });
    expect(computeTimeAdjustment(state)).toBe(0.50);
  });

  it('should return 0.20 when event is 2 days away', () => {
    const state = makeState({ eventDate: daysFromNow(now, 2), now });
    expect(computeTimeAdjustment(state)).toBe(0.20);
  });

  it('should return 0.20 when event is 7 days away', () => {
    const state = makeState({ eventDate: daysFromNow(now, 7), now });
    expect(computeTimeAdjustment(state)).toBe(0.20);
  });

  it('should return 0.20 when event is 5 days away', () => {
    const state = makeState({ eventDate: daysFromNow(now, 5), now });
    expect(computeTimeAdjustment(state)).toBe(0.20);
  });

  it('should linearly interpolate between 8 and 30 days', () => {
    // At 8 days: 0.20 × (30 - 8) / 22 = 0.20
    const state8 = makeState({ eventDate: daysFromNow(now, 8), now });
    expect(computeTimeAdjustment(state8)).toBeCloseTo(0.20);

    // At 30 days: 0.20 × (30 - 30) / 22 = 0
    const state30 = makeState({ eventDate: daysFromNow(now, 30), now });
    expect(computeTimeAdjustment(state30)).toBeCloseTo(0);

    // At 19 days (midpoint): 0.20 × (30 - 19) / 22 = 0.20 × 11/22 = 0.10
    const state19 = makeState({ eventDate: daysFromNow(now, 19), now });
    expect(computeTimeAdjustment(state19)).toBeCloseTo(0.10);

    // At 15 days: 0.20 × (30 - 15) / 22 = 0.20 × 15/22 ≈ 0.1364
    const state15 = makeState({ eventDate: daysFromNow(now, 15), now });
    expect(computeTimeAdjustment(state15)).toBeCloseTo(0.20 * (15 / 22));
  });

  it('should return 0 at exactly 30 days (boundary of interpolation zone)', () => {
    const state = makeState({ eventDate: daysFromNow(now, 30), now });
    expect(computeTimeAdjustment(state)).toBeCloseTo(0);
  });

  it('should return 0 for very far future event (365 days)', () => {
    const state = makeState({ eventDate: daysFromNow(now, 365), now });
    expect(computeTimeAdjustment(state)).toBe(0);
  });

  it('should handle fractional day — event is 12 hours away (floors to 0 days)', () => {
    const halfDay = new Date(now.getTime() + 12 * 60 * 60 * 1000);
    const state = makeState({ eventDate: halfDay, now });
    // Math.floor(0.5) = 0 → ≤1 bucket → 0.50
    expect(computeTimeAdjustment(state)).toBe(0.50);
  });

  it('should return 0.20 at exactly 8 days (lower boundary of interpolation)', () => {
    const state = makeState({ eventDate: daysFromNow(now, 8), now });
    // 0.20 × (30 - 8) / 22 = 0.20 × 1.0 = 0.20
    expect(computeTimeAdjustment(state)).toBeCloseTo(0.20);
  });

  it('should create a rule with the given weight', () => {
    const rule = createTimeRule(2.5);
    expect(rule.name).toBe('time');
    expect(rule.weight).toBe(2.5);
    expect(typeof rule.compute).toBe('function');
  });

  it('created rule compute delegates to computeTimeAdjustment', () => {
    const rule = createTimeRule(1.0);
    const state = makeState({ eventDate: daysFromNow(now, 1), now });
    expect(rule.compute(state)).toBe(computeTimeAdjustment(state));
  });
});

/* ------------------------------------------------------------------ */
/*  Demand Rule                                                        */
/* ------------------------------------------------------------------ */

describe('Demand Rule', () => {
  it('should return 0 when recentBookingsCount is 0', () => {
    const state = makeState({ recentBookingsCount: 0 });
    expect(computeDemandAdjustment(state)).toBe(0);
  });

  it('should return 0 when recentBookingsCount is exactly 10', () => {
    const state = makeState({ recentBookingsCount: 10 });
    expect(computeDemandAdjustment(state)).toBe(0);
  });

  it('should return 0.15 when recentBookingsCount is 11', () => {
    const state = makeState({ recentBookingsCount: 11 });
    expect(computeDemandAdjustment(state)).toBe(0.15);
  });

  it('should return 0.15 when recentBookingsCount is 100', () => {
    const state = makeState({ recentBookingsCount: 100 });
    expect(computeDemandAdjustment(state)).toBe(0.15);
  });

  it('should return 0 when recentBookingsCount is 1', () => {
    const state = makeState({ recentBookingsCount: 1 });
    expect(computeDemandAdjustment(state)).toBe(0);
  });

  it('should return 0 when recentBookingsCount is 9 (just below threshold)', () => {
    const state = makeState({ recentBookingsCount: 9 });
    expect(computeDemandAdjustment(state)).toBe(0);
  });

  it('should create a rule with the given weight', () => {
    const rule = createDemandRule(0.8);
    expect(rule.name).toBe('demand');
    expect(rule.weight).toBe(0.8);
    expect(typeof rule.compute).toBe('function');
  });

  it('created rule compute delegates to computeDemandAdjustment', () => {
    const rule = createDemandRule(1.0);
    const state = makeState({ recentBookingsCount: 15 });
    expect(rule.compute(state)).toBe(computeDemandAdjustment(state));
  });
});

/* ------------------------------------------------------------------ */
/*  Inventory Rule                                                     */
/* ------------------------------------------------------------------ */

describe('Inventory Rule', () => {
  it('should return 0 when 100% of tickets remain', () => {
    const state = makeState({ totalTickets: 100, bookedTickets: 0 });
    expect(computeInventoryAdjustment(state)).toBe(0);
  });

  it('should return 0 when exactly 20% of tickets remain', () => {
    const state = makeState({ totalTickets: 100, bookedTickets: 80 });
    expect(computeInventoryAdjustment(state)).toBe(0);
  });

  it('should return 0.25 when 19% of tickets remain', () => {
    const state = makeState({ totalTickets: 100, bookedTickets: 81 });
    expect(computeInventoryAdjustment(state)).toBe(0.25);
  });

  it('should return 0.25 when 0 tickets remain', () => {
    const state = makeState({ totalTickets: 100, bookedTickets: 100 });
    expect(computeInventoryAdjustment(state)).toBe(0.25);
  });

  it('should return 0 when 50% of tickets remain', () => {
    const state = makeState({ totalTickets: 100, bookedTickets: 50 });
    expect(computeInventoryAdjustment(state)).toBe(0);
  });

  it('should create a rule with the given weight', () => {
    const rule = createInventoryRule(1.2);
    expect(rule.name).toBe('inventory');
    expect(rule.weight).toBe(1.2);
    expect(typeof rule.compute).toBe('function');
  });

  it('should handle totalTickets of 1 with 0 booked (100% remaining)', () => {
    const state = makeState({ totalTickets: 1, bookedTickets: 0 });
    // 100% remaining → no adjustment
    expect(computeInventoryAdjustment(state)).toBe(0);
  });

  it('should handle totalTickets of 1 with 1 booked (0% remaining)', () => {
    const state = makeState({ totalTickets: 1, bookedTickets: 1 });
    expect(computeInventoryAdjustment(state)).toBe(0.25);
  });

  it('should handle large event with exactly 20% boundary', () => {
    // 1000 tickets, 800 booked = 200 remaining = 20% → no adjustment
    const state = makeState({ totalTickets: 1000, bookedTickets: 800 });
    expect(computeInventoryAdjustment(state)).toBe(0);
  });

  it('should handle large event just below 20% boundary', () => {
    // 1000 tickets, 801 booked = 199 remaining = 19.9% → adjustment
    const state = makeState({ totalTickets: 1000, bookedTickets: 801 });
    expect(computeInventoryAdjustment(state)).toBe(0.25);
  });

  it('should return 0.25 when only 1 of 100 tickets remains (1%)', () => {
    const state = makeState({ totalTickets: 100, bookedTickets: 99 });
    expect(computeInventoryAdjustment(state)).toBe(0.25);
  });

  it('created rule compute delegates to computeInventoryAdjustment', () => {
    const rule = createInventoryRule(1.0);
    const state = makeState({ totalTickets: 100, bookedTickets: 95 });
    expect(rule.compute(state)).toBe(computeInventoryAdjustment(state));
  });
});

/* ------------------------------------------------------------------ */
/*  Combined Rules (end-to-end pricing scenarios)                      */
/* ------------------------------------------------------------------ */

describe('Combined Rules - End-to-End Pricing Scenarios', () => {
  const now = new Date('2025-06-01T12:00:00Z');

  it('should produce no adjustment for a far-future event with no bookings', () => {
    const state = makeState({
      eventDate: daysFromNow(now, 60),
      now,
      totalTickets: 100,
      bookedTickets: 0,
      recentBookingsCount: 0,
    });
    expect(computeTimeAdjustment(state)).toBe(0);
    expect(computeDemandAdjustment(state)).toBe(0);
    expect(computeInventoryAdjustment(state)).toBe(0);
  });

  it('should produce maximum adjustment for tomorrow event with high demand and low inventory', () => {
    const state = makeState({
      eventDate: daysFromNow(now, 1),
      now,
      totalTickets: 100,
      bookedTickets: 95,
      recentBookingsCount: 20,
    });
    expect(computeTimeAdjustment(state)).toBe(0.50);
    expect(computeDemandAdjustment(state)).toBe(0.15);
    expect(computeInventoryAdjustment(state)).toBe(0.25);
  });

  it('should produce partial adjustment for mid-range scenario', () => {
    const state = makeState({
      eventDate: daysFromNow(now, 5),
      now,
      totalTickets: 100,
      bookedTickets: 50,
      recentBookingsCount: 5,
    });
    expect(computeTimeAdjustment(state)).toBe(0.20);
    expect(computeDemandAdjustment(state)).toBe(0);
    expect(computeInventoryAdjustment(state)).toBe(0);
  });

  it('should handle event in the past (negative days)', () => {
    const state = makeState({
      eventDate: daysFromNow(now, -1),
      now,
    });
    // Past event → daysUntilEvent < 0 → falls into ≤1 bucket
    expect(computeTimeAdjustment(state)).toBe(0.50);
  });

  it('should fire only time + demand (inventory has plenty)', () => {
    const state = makeState({
      eventDate: daysFromNow(now, 3),
      now,
      totalTickets: 100,
      bookedTickets: 10,
      recentBookingsCount: 15,
    });
    expect(computeTimeAdjustment(state)).toBe(0.20);
    expect(computeDemandAdjustment(state)).toBe(0.15);
    expect(computeInventoryAdjustment(state)).toBe(0);
  });

  it('should fire only inventory + demand (event is far away)', () => {
    const state = makeState({
      eventDate: daysFromNow(now, 60),
      now,
      totalTickets: 100,
      bookedTickets: 90,
      recentBookingsCount: 20,
    });
    expect(computeTimeAdjustment(state)).toBe(0);
    expect(computeDemandAdjustment(state)).toBe(0.15);
    expect(computeInventoryAdjustment(state)).toBe(0.25);
  });

  it('should fire only time (low demand, plenty of inventory)', () => {
    const state = makeState({
      eventDate: daysFromNow(now, 1),
      now,
      totalTickets: 1000,
      bookedTickets: 10,
      recentBookingsCount: 2,
    });
    expect(computeTimeAdjustment(state)).toBe(0.50);
    expect(computeDemandAdjustment(state)).toBe(0);
    expect(computeInventoryAdjustment(state)).toBe(0);
  });
});
