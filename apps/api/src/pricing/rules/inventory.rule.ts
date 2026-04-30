import { EventPricingState, PricingRule } from '../pricing.types';

/**
 * Computes a price adjustment based on remaining ticket inventory.
 *
 * - Less than 20% of tickets remaining: 0.25 (25% increase)
 * - 20% or more of tickets remaining: 0 (no adjustment)
 *
 * Remaining ratio is computed as (totalTickets - bookedTickets) / totalTickets.
 */
export function computeInventoryAdjustment(state: EventPricingState): number {
  const remainingRatio =
    (state.totalTickets - state.bookedTickets) / state.totalTickets;
  return remainingRatio < 0.20 ? 0.25 : 0;
}

/**
 * Creates an inventory-based pricing rule with the given weight.
 * The weight is typically sourced from the PRICING_INVENTORY_WEIGHT env var.
 */
export function createInventoryRule(weight: number): PricingRule {
  return {
    name: 'inventory',
    compute: computeInventoryAdjustment,
    weight,
  };
}
