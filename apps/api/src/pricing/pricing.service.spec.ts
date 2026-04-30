import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { computePrice, PricingService } from './pricing.service';
import type { EventPricingState, PricingRule } from './pricing.types';

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
});
