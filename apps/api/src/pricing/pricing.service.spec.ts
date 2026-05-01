import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { computePrice, PricingService } from './pricing.service';
import type { EventPricingState, PricingRule } from './pricing.types';
import { createTimeRule } from './rules/time.rule';
import { createDemandRule } from './rules/demand.rule';
import { createInventoryRule } from './rules/inventory.rule';

/* ------------------------------------------------------------------ */
/*  Helper: create a default event state                               */
/* ------------------------------------------------------------------ */

function makeState(overrides: Partial<EventPricingState> = {}): EventPricingState {
  const now = new Date('2025-06-01T12:00:00Z');
  return {
    eventDate: new Date('2025-08-01T20:00:00Z'), // ~61 days away
    now,
    totalTickets: 100,
    bookedTickets: 0,
    recentBookingsCount: 0,
    ...overrides,
  };
}

function makeRule(name: string, adjustment: number, weight: number): PricingRule {
  return { name, compute: () => adjustment, weight };
}

/* ------------------------------------------------------------------ */
/*  computePrice (pure function)                                       */
/* ------------------------------------------------------------------ */

describe('computePrice', () => {
  it('should return basePrice when no rules apply', () => {
    const result = computePrice(100, 50, 200, [], makeState());
    expect(result.finalPrice).toBe(100);
    expect(result.sumOfWeightedAdjustments).toBe(0);
    expect(result.computedPrice).toBe(100);
  });

  it('should apply the formula: basePrice × (1 + sum of weighted adjustments)', () => {
    const rules = [makeRule('test', 0.20, 1.0)];
    const result = computePrice(100, 50, 200, rules, makeState());
    expect(result.computedPrice).toBeCloseTo(120);
    expect(result.finalPrice).toBeCloseTo(120);
  });

  it('should combine multiple rules by summing weighted adjustments', () => {
    const rules = [
      makeRule('time', 0.20, 1.0),
      makeRule('demand', 0.15, 1.0),
      makeRule('inventory', 0.25, 1.0),
    ];
    const result = computePrice(100, 50, 300, rules, makeState());
    // 100 × (1 + 0.20 + 0.15 + 0.25) = 100 × 1.60 = 160
    expect(result.computedPrice).toBeCloseTo(160);
    expect(result.finalPrice).toBeCloseTo(160);
  });

  it('should apply rule weights correctly', () => {
    const rules = [makeRule('test', 0.50, 0.5)];
    const result = computePrice(100, 50, 200, rules, makeState());
    // weighted = 0.50 × 0.5 = 0.25, price = 100 × 1.25 = 125
    expect(result.computedPrice).toBeCloseTo(125);
  });

  it('should clamp to floor price when computed price is below', () => {
    // No adjustments, basePrice = 40, floor = 50
    const result = computePrice(40, 50, 200, [], makeState());
    expect(result.computedPrice).toBe(40);
    expect(result.finalPrice).toBe(50);
  });

  it('should clamp to ceiling price when computed price is above', () => {
    const rules = [makeRule('surge', 1.0, 1.0)];
    // 100 × (1 + 1.0) = 200, ceiling = 150
    const result = computePrice(100, 50, 150, rules, makeState());
    expect(result.computedPrice).toBeCloseTo(200);
    expect(result.finalPrice).toBe(150);
  });

  it('should return a complete PriceBreakdown', () => {
    const rules = [makeRule('time', 0.20, 1.5)];
    const result = computePrice(100, 50, 300, rules, makeState());

    expect(result.basePrice).toBe(100);
    expect(result.floorPrice).toBe(50);
    expect(result.ceilingPrice).toBe(300);
    expect(result.rules).toHaveLength(1);
    expect(result.rules[0].name).toBe('time');
    expect(result.rules[0].rawAdjustment).toBe(0.20);
    expect(result.rules[0].weight).toBe(1.5);
    expect(result.rules[0].weightedAdjustment).toBeCloseTo(0.30);
    expect(result.sumOfWeightedAdjustments).toBeCloseTo(0.30);
    expect(result.computedPrice).toBeCloseTo(130);
    expect(result.finalPrice).toBeCloseTo(130);
  });

  it('should be deterministic — identical inputs produce identical output', () => {
    const rules = [makeRule('time', 0.20, 1.0), makeRule('demand', 0.15, 1.0)];
    const state = makeState();
    const r1 = computePrice(100, 50, 200, rules, state);
    const r2 = computePrice(100, 50, 200, rules, state);
    expect(r1).toEqual(r2);
  });

  it('should handle negative adjustments (price decrease)', () => {
    const rules = [makeRule('discount', -0.20, 1.0)];
    // 100 × (1 + (-0.20)) = 100 × 0.80 = 80
    const result = computePrice(100, 50, 200, rules, makeState());
    expect(result.computedPrice).toBeCloseTo(80);
    expect(result.finalPrice).toBeCloseTo(80);
  });

  it('should clamp to floor when negative adjustments push price below floor', () => {
    const rules = [makeRule('discount', -0.80, 1.0)];
    // 100 × (1 + (-0.80)) = 100 × 0.20 = 20, floor = 50
    const result = computePrice(100, 50, 200, rules, makeState());
    expect(result.computedPrice).toBeCloseTo(20);
    expect(result.finalPrice).toBe(50);
  });

  it('should ignore rules with zero weight', () => {
    const rules = [makeRule('zero-weight', 0.50, 0)];
    // weighted = 0.50 × 0 = 0, price = 100 × 1.0 = 100
    const result = computePrice(100, 50, 200, rules, makeState());
    expect(result.computedPrice).toBeCloseTo(100);
    expect(result.finalPrice).toBeCloseTo(100);
  });

  it('should return floor when floor equals ceiling and basePrice is below', () => {
    const result = computePrice(40, 75, 75, [], makeState());
    expect(result.finalPrice).toBe(75);
  });

  it('should return ceiling when floor equals ceiling and basePrice is above', () => {
    const result = computePrice(200, 75, 75, [], makeState());
    expect(result.finalPrice).toBe(75);
  });

  it('should handle all rules at max simultaneously hitting ceiling', () => {
    const rules = [
      makeRule('time', 0.50, 2.0),
      makeRule('demand', 0.50, 2.0),
      makeRule('inventory', 0.50, 2.0),
    ];
    // 100 × (1 + 1.0 + 1.0 + 1.0) = 100 × 4.0 = 400, ceiling = 200
    const result = computePrice(100, 50, 200, rules, makeState());
    expect(result.computedPrice).toBeCloseTo(400);
    expect(result.finalPrice).toBe(200);
  });

  it('should handle zero base price', () => {
    const rules = [makeRule('test', 0.50, 1.0)];
    // 0 × (1 + 0.50) = 0, floor = 0
    const result = computePrice(0, 0, 200, rules, makeState());
    expect(result.computedPrice).toBe(0);
    expect(result.finalPrice).toBe(0);
  });

  it('should handle many rules with small adjustments', () => {
    const rules = Array.from({ length: 10 }, (_, i) =>
      makeRule(`rule-${i}`, 0.01, 1.0),
    );
    // 100 × (1 + 10 × 0.01) = 100 × 1.10 = 110
    const result = computePrice(100, 50, 200, rules, makeState());
    expect(result.computedPrice).toBeCloseTo(110);
    expect(result.finalPrice).toBeCloseTo(110);
  });

  it('should handle mixed positive and negative adjustments that cancel out', () => {
    const rules = [
      makeRule('up', 0.30, 1.0),
      makeRule('down', -0.30, 1.0),
    ];
    // 100 × (1 + 0.30 + (-0.30)) = 100 × 1.0 = 100
    const result = computePrice(100, 50, 200, rules, makeState());
    expect(result.computedPrice).toBeCloseTo(100);
    expect(result.finalPrice).toBeCloseTo(100);
  });

  it('should handle fractional base price and fractional weights', () => {
    const rules = [makeRule('test', 0.10, 1.5)];
    // 49.99 × (1 + 0.10 × 1.5) = 49.99 × 1.15 = 57.4885
    const result = computePrice(49.99, 10, 200, rules, makeState());
    expect(result.computedPrice).toBeCloseTo(57.4885);
    expect(result.finalPrice).toBeCloseTo(57.4885);
  });

  it('should preserve rule ordering in breakdown array', () => {
    const rules = [
      makeRule('alpha', 0.10, 1.0),
      makeRule('beta', 0.20, 1.0),
      makeRule('gamma', 0.05, 1.0),
    ];
    const result = computePrice(100, 50, 300, rules, makeState());
    expect(result.rules.map((r) => r.name)).toEqual(['alpha', 'beta', 'gamma']);
  });

  it('should clamp to floor even when all adjustments are zero and basePrice < floor', () => {
    const result = computePrice(10, 50, 200, [], makeState());
    expect(result.computedPrice).toBe(10);
    expect(result.finalPrice).toBe(50);
  });

  it('should handle very large weight multiplier', () => {
    const rules = [makeRule('extreme', 0.10, 100)];
    // 100 × (1 + 0.10 × 100) = 100 × 11 = 1100, ceiling = 500
    const result = computePrice(100, 50, 500, rules, makeState());
    expect(result.computedPrice).toBeCloseTo(1100);
    expect(result.finalPrice).toBe(500);
  });

  it('should handle adjustment of exactly 0 (no change)', () => {
    const rules = [makeRule('noop', 0, 1.0)];
    const result = computePrice(100, 50, 200, rules, makeState());
    expect(result.computedPrice).toBe(100);
    expect(result.finalPrice).toBe(100);
    expect(result.rules[0].weightedAdjustment).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/*  computePrice with REAL rule functions (not mocked)                 */
/* ------------------------------------------------------------------ */

describe('computePrice with real rules', () => {
  it('should compute correct price for far-future event with no demand or scarcity', () => {
    const now = new Date('2025-06-01T12:00:00Z');
    const rules = [
      createTimeRule(1.0),
      createDemandRule(1.0),
      createInventoryRule(1.0),
    ];
    const state: EventPricingState = {
      eventDate: new Date('2025-09-01T20:00:00Z'), // ~92 days away
      now,
      totalTickets: 100,
      bookedTickets: 0,
      recentBookingsCount: 0,
    };
    // All rules return 0 → price = basePrice
    const result = computePrice(100, 50, 200, rules, state);
    expect(result.finalPrice).toBe(100);
    expect(result.sumOfWeightedAdjustments).toBe(0);
  });

  it('should compute correct price for tomorrow event with high demand and low inventory', () => {
    const now = new Date('2025-06-01T12:00:00Z');
    const rules = [
      createTimeRule(1.0),
      createDemandRule(1.0),
      createInventoryRule(1.0),
    ];
    const state: EventPricingState = {
      eventDate: new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000), // 1 day
      now,
      totalTickets: 100,
      bookedTickets: 95,
      recentBookingsCount: 20,
    };
    // time=0.50, demand=0.15, inventory=0.25 → sum=0.90
    // 100 × 1.90 = 190
    const result = computePrice(100, 50, 300, rules, state);
    expect(result.computedPrice).toBeCloseTo(190);
    expect(result.finalPrice).toBeCloseTo(190);
  });

  it('should clamp real rules result to ceiling', () => {
    const now = new Date('2025-06-01T12:00:00Z');
    const rules = [
      createTimeRule(2.0),
      createDemandRule(2.0),
      createInventoryRule(2.0),
    ];
    const state: EventPricingState = {
      eventDate: new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000),
      now,
      totalTickets: 100,
      bookedTickets: 95,
      recentBookingsCount: 20,
    };
    // time=0.50×2=1.0, demand=0.15×2=0.30, inventory=0.25×2=0.50 → sum=1.80
    // 100 × 2.80 = 280, ceiling = 200
    const result = computePrice(100, 50, 200, rules, state);
    expect(result.computedPrice).toBeCloseTo(280);
    expect(result.finalPrice).toBe(200);
  });

  it('should apply only active rules when some return 0', () => {
    const now = new Date('2025-06-01T12:00:00Z');
    const rules = [
      createTimeRule(1.0),
      createDemandRule(1.0),
      createInventoryRule(1.0),
    ];
    const state: EventPricingState = {
      eventDate: new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000), // 5 days
      now,
      totalTickets: 100,
      bookedTickets: 50, // 50% remaining → no inventory adj
      recentBookingsCount: 5, // ≤10 → no demand adj
    };
    // time=0.20, demand=0, inventory=0 → sum=0.20
    // 100 × 1.20 = 120
    const result = computePrice(100, 50, 300, rules, state);
    expect(result.computedPrice).toBeCloseTo(120);
    expect(result.rules[0].rawAdjustment).toBe(0.20);
    expect(result.rules[1].rawAdjustment).toBe(0);
    expect(result.rules[2].rawAdjustment).toBe(0);
  });

  it('should produce correct breakdown details for each real rule', () => {
    const now = new Date('2025-06-01T12:00:00Z');
    const rules = [
      createTimeRule(1.5),
      createDemandRule(0.8),
      createInventoryRule(1.2),
    ];
    const state: EventPricingState = {
      eventDate: new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000),
      now,
      totalTickets: 100,
      bookedTickets: 90,
      recentBookingsCount: 15,
    };
    const result = computePrice(80, 40, 250, rules, state);

    // time: raw=0.50, weight=1.5, weighted=0.75
    expect(result.rules[0].name).toBe('time');
    expect(result.rules[0].rawAdjustment).toBe(0.50);
    expect(result.rules[0].weightedAdjustment).toBeCloseTo(0.75);

    // demand: raw=0.15, weight=0.8, weighted=0.12
    expect(result.rules[1].name).toBe('demand');
    expect(result.rules[1].rawAdjustment).toBe(0.15);
    expect(result.rules[1].weightedAdjustment).toBeCloseTo(0.12);

    // inventory: raw=0.25, weight=1.2, weighted=0.30
    expect(result.rules[2].name).toBe('inventory');
    expect(result.rules[2].rawAdjustment).toBe(0.25);
    expect(result.rules[2].weightedAdjustment).toBeCloseTo(0.30);

    // sum = 0.75 + 0.12 + 0.30 = 1.17
    expect(result.sumOfWeightedAdjustments).toBeCloseTo(1.17);
    // 80 × 2.17 = 173.6
    expect(result.computedPrice).toBeCloseTo(173.6);
    expect(result.finalPrice).toBeCloseTo(173.6);
  });
});

/* ------------------------------------------------------------------ */
/*  PricingService.buildRules                                          */
/* ------------------------------------------------------------------ */

describe('PricingService.buildRules', () => {
  let service: PricingService;

  beforeEach(() => {
    service = new PricingService();
    vi.stubEnv('PRICING_TIME_WEIGHT', '1.0');
    vi.stubEnv('PRICING_DEMAND_WEIGHT', '1.0');
    vi.stubEnv('PRICING_INVENTORY_WEIGHT', '1.0');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should return all 3 rules when no config is provided', () => {
    const rules = service.buildRules();
    expect(rules).toHaveLength(3);
    expect(rules.map((r) => r.name)).toEqual(['time', 'demand', 'inventory']);
  });

  it('should use env var weights when no config is provided', () => {
    vi.stubEnv('PRICING_TIME_WEIGHT', '2.5');
    vi.stubEnv('PRICING_DEMAND_WEIGHT', '0.8');
    vi.stubEnv('PRICING_INVENTORY_WEIGHT', '1.2');

    const rules = service.buildRules();
    expect(rules[0].weight).toBe(2.5);
    expect(rules[1].weight).toBe(0.8);
    expect(rules[2].weight).toBe(1.2);
  });

  it('should use config weights when config is provided', () => {
    const config = {
      timeRule: { enabled: true, weight: 3.0 },
      demandRule: { enabled: true, weight: 0.5 },
      inventoryRule: { enabled: true, weight: 2.0 },
    };
    const rules = service.buildRules(config);
    expect(rules[0].weight).toBe(3.0);
    expect(rules[1].weight).toBe(0.5);
    expect(rules[2].weight).toBe(2.0);
  });

  it('should exclude disabled rules from config', () => {
    const config = {
      timeRule: { enabled: false, weight: 1.0 },
      demandRule: { enabled: true, weight: 1.0 },
      inventoryRule: { enabled: false, weight: 1.0 },
    };
    const rules = service.buildRules(config);
    expect(rules).toHaveLength(1);
    expect(rules[0].name).toBe('demand');
  });

  it('should return empty array when all rules are disabled', () => {
    const config = {
      timeRule: { enabled: false, weight: 1.0 },
      demandRule: { enabled: false, weight: 1.0 },
      inventoryRule: { enabled: false, weight: 1.0 },
    };
    const rules = service.buildRules(config);
    expect(rules).toHaveLength(0);
  });

  it('should default weights to 1.0 when env vars are not set', () => {
    vi.stubEnv('PRICING_TIME_WEIGHT', '');
    vi.stubEnv('PRICING_DEMAND_WEIGHT', '');
    vi.stubEnv('PRICING_INVENTORY_WEIGHT', '');

    // parseFloat('') returns NaN, so the default '1.0' from ?? won't kick in
    // but empty string is truthy, so let's delete them
    delete process.env.PRICING_TIME_WEIGHT;
    delete process.env.PRICING_DEMAND_WEIGHT;
    delete process.env.PRICING_INVENTORY_WEIGHT;

    const rules = service.buildRules();
    expect(rules[0].weight).toBe(1.0);
    expect(rules[1].weight).toBe(1.0);
    expect(rules[2].weight).toBe(1.0);
  });

  it('should enable only one rule via config', () => {
    const config = {
      timeRule: { enabled: false, weight: 1.0 },
      demandRule: { enabled: false, weight: 1.0 },
      inventoryRule: { enabled: true, weight: 2.5 },
    };
    const rules = service.buildRules(config);
    expect(rules).toHaveLength(1);
    expect(rules[0].name).toBe('inventory');
    expect(rules[0].weight).toBe(2.5);
  });

  it('built rules should produce correct compute results', () => {
    const rules = service.buildRules();
    const now = new Date('2025-06-01T12:00:00Z');
    const state: EventPricingState = {
      eventDate: new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000),
      now,
      totalTickets: 100,
      bookedTickets: 95,
      recentBookingsCount: 20,
    };
    // time=0.50, demand=0.15, inventory=0.25
    expect(rules[0].compute(state)).toBe(0.50);
    expect(rules[1].compute(state)).toBe(0.15);
    expect(rules[2].compute(state)).toBe(0.25);
  });
});

/* ------------------------------------------------------------------ */
/*  PricingService.computePrice (instance method delegation)           */
/* ------------------------------------------------------------------ */

describe('PricingService.computePrice (instance method)', () => {
  let service: PricingService;

  beforeEach(() => {
    service = new PricingService();
  });

  it('should delegate to the pure computePrice function and return identical result', () => {
    const rules = [{ name: 'test', compute: () => 0.20, weight: 1.0 }];
    const state = makeState();
    const fromPure = computePrice(100, 50, 200, rules, state);
    const fromService = service.computePrice(100, 50, 200, rules, state);
    expect(fromService).toEqual(fromPure);
  });

  it('should work end-to-end with buildRules + computePrice', () => {
    vi.stubEnv('PRICING_TIME_WEIGHT', '1.0');
    vi.stubEnv('PRICING_DEMAND_WEIGHT', '1.0');
    vi.stubEnv('PRICING_INVENTORY_WEIGHT', '1.0');

    const rules = service.buildRules();
    const now = new Date('2025-06-01T12:00:00Z');
    const state: EventPricingState = {
      eventDate: new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000),
      now,
      totalTickets: 100,
      bookedTickets: 0,
      recentBookingsCount: 0,
    };
    const result = service.computePrice(100, 50, 200, rules, state);
    // All rules return 0 for far-future, empty event
    expect(result.finalPrice).toBe(100);

    vi.unstubAllEnvs();
  });
});
