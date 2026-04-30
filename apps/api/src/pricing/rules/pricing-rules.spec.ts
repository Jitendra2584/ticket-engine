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

  it('should create a rule with the given weight', () => {
    const rule = createTimeRule(2.5);
    expect(rule.name).toBe('time');
    expect(rule.weight).toBe(2.5);
    expect(typeof rule.compute).toBe('function');
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

  it('should create a rule with the given weight', () => {
    const rule = createDemandRule(0.8);
    expect(rule.name).toBe('demand');
    expect(rule.weight).toBe(0.8);
    expect(typeof rule.compute).toBe('function');
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
});
