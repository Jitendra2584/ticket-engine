import { Injectable } from '@nestjs/common';
import {
  EventPricingState,
  PriceBreakdown,
  PricingRule,
  RuleBreakdownItem,
} from './pricing.types';
import { createTimeRule } from './rules/time.rule';
import { createDemandRule } from './rules/demand.rule';
import { createInventoryRule } from './rules/inventory.rule';
import { PricingRulesConfig } from '@repo/database';

/**
 * Pure function that computes the current ticket price from base price,
 * pricing rules, and event state. Deterministic — no side effects.
 *
 * Formula: currentPrice = basePrice × (1 + sum of weighted adjustments)
 * Result is clamped to [floorPrice, ceilingPrice].
 */
export function computePrice(
  basePrice: number,
  floorPrice: number,
  ceilingPrice: number,
  rules: PricingRule[],
  state: EventPricingState,
): PriceBreakdown {
  const ruleBreakdowns: RuleBreakdownItem[] = rules.map((rule) => {
    const rawAdjustment = rule.compute(state);
    const weightedAdjustment = rawAdjustment * rule.weight;
    return {
      name: rule.name,
      rawAdjustment,
      weight: rule.weight,
      weightedAdjustment,
    };
  });

  const sumOfWeightedAdjustments = ruleBreakdowns.reduce(
    (sum, item) => sum + item.weightedAdjustment,
    0,
  );

  const computedPrice = basePrice * (1 + sumOfWeightedAdjustments);

  const finalPrice = Math.min(
    Math.max(computedPrice, floorPrice),
    ceilingPrice,
  );

  return {
    basePrice,
    rules: ruleBreakdowns,
    sumOfWeightedAdjustments,
    computedPrice,
    finalPrice,
    floorPrice,
    ceilingPrice,
  };
}

@Injectable()
export class PricingService {
  /**
   * Computes the current ticket price with a full breakdown.
   * Delegates to the pure `computePrice` function.
   */
  computePrice(
    basePrice: number,
    floorPrice: number,
    ceilingPrice: number,
    rules: PricingRule[],
    state: EventPricingState,
  ): PriceBreakdown {
    return computePrice(basePrice, floorPrice, ceilingPrice, rules, state);
  }

  /**
   * Builds the array of pricing rules from environment variable weights.
   * Optionally accepts a PricingRulesConfig to override which rules are enabled.
   */
  buildRules(config?: PricingRulesConfig): PricingRule[] {
    const timeWeight = parseFloat(process.env.PRICING_TIME_WEIGHT ?? '1.0');
    const demandWeight = parseFloat(process.env.PRICING_DEMAND_WEIGHT ?? '1.0');
    const inventoryWeight = parseFloat(
      process.env.PRICING_INVENTORY_WEIGHT ?? '1.0',
    );

    const rules: PricingRule[] = [];

    if (!config || config.timeRule.enabled) {
      const weight = config ? config.timeRule.weight : timeWeight;
      rules.push(createTimeRule(weight));
    }

    if (!config || config.demandRule.enabled) {
      const weight = config ? config.demandRule.weight : demandWeight;
      rules.push(createDemandRule(weight));
    }

    if (!config || config.inventoryRule.enabled) {
      const weight = config ? config.inventoryRule.weight : inventoryWeight;
      rules.push(createInventoryRule(weight));
    }

    return rules;
  }
}
