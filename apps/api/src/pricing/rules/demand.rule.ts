import { EventPricingState, PricingRule } from '../pricing.types';

/**
 * Computes a price adjustment based on recent booking velocity.
 *
 * - More than 10 bookings in the last hour: 0.15 (15% increase)
 * - 10 or fewer bookings in the last hour: 0 (no adjustment)
 */
export function computeDemandAdjustment(state: EventPricingState): number {
  return state.recentBookingsCount > 10 ? 0.15 : 0;
}

/**
 * Creates a demand-based pricing rule with the given weight.
 * The weight is typically sourced from the PRICING_DEMAND_WEIGHT env var.
 */
export function createDemandRule(weight: number): PricingRule {
  return {
    name: 'demand',
    compute: computeDemandAdjustment,
    weight,
  };
}
