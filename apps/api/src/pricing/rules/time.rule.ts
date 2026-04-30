import { EventPricingState, PricingRule } from '../pricing.types';

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/**
 * Computes a price adjustment based on how close the event date is.
 *
 * - More than 30 days away: 0 (no adjustment)
 * - 8–30 days away: linear interpolation from 0 to 0.20
 * - 2–7 days away: 0.20 (20% increase)
 * - 0–1 days away (today or tomorrow): 0.50 (50% increase)
 */
export function computeTimeAdjustment(state: EventPricingState): number {
  const daysUntilEvent = Math.floor(
    (state.eventDate.getTime() - state.now.getTime()) / MS_PER_DAY
  );

  if (daysUntilEvent > 30) return 0;
  if (daysUntilEvent <= 1) return 0.50;
  if (daysUntilEvent <= 7) return 0.20;

  // Linear interpolation between 8–30 days: 0 at 30 days, 0.20 at 8 days
  return 0.20 * ((30 - daysUntilEvent) / 22);
}

/**
 * Creates a time-based pricing rule with the given weight.
 * The weight is typically sourced from the PRICING_TIME_WEIGHT env var.
 */
export function createTimeRule(weight: number): PricingRule {
  return {
    name: 'time',
    compute: computeTimeAdjustment,
    weight,
  };
}
