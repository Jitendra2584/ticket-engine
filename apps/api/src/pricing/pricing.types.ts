/**
 * Represents the current state of an event used for pricing calculations.
 * All pricing rules receive this state to compute their adjustments.
 */
export interface EventPricingState {
  /** The scheduled date/time of the event */
  eventDate: Date;
  /** The current date/time (for deterministic testing, pass explicitly) */
  now: Date;
  /** Total ticket capacity for the event */
  totalTickets: number;
  /** Number of tickets already booked */
  bookedTickets: number;
  /** Number of bookings created in the last 60 minutes */
  recentBookingsCount: number;
}

/**
 * A pricing rule that computes a raw adjustment based on event state.
 * Each rule is a pure function — no side effects, deterministic output.
 */
export interface PricingRule {
  /** Human-readable name of the rule (e.g. "time", "demand", "inventory") */
  name: string;
  /** Computes a raw adjustment value between 0 and 1 from the event state */
  compute(state: EventPricingState): number;
  /** Weight multiplier applied to the raw adjustment (from env config) */
  weight: number;
}

/**
 * A single rule's contribution to the price breakdown.
 */
export interface RuleBreakdownItem {
  /** Name of the pricing rule */
  name: string;
  /** Raw adjustment returned by the rule's compute function (0 to 1) */
  rawAdjustment: number;
  /** Weight multiplier for this rule */
  weight: number;
  /** Effective adjustment: rawAdjustment × weight */
  weightedAdjustment: number;
}

/**
 * Full breakdown of how the final price was computed.
 * Provides auditability for every pricing decision.
 */
export interface PriceBreakdown {
  /** The event's base ticket price */
  basePrice: number;
  /** Individual rule contributions */
  rules: RuleBreakdownItem[];
  /** Sum of all weightedAdjustment values across rules */
  sumOfWeightedAdjustments: number;
  /** Price before floor/ceiling clamping: basePrice × (1 + sumOfWeightedAdjustments) */
  computedPrice: number;
  /** Final price after clamping to [floorPrice, ceilingPrice] */
  finalPrice: number;
  /** Minimum allowed price */
  floorPrice: number;
  /** Maximum allowed price */
  ceilingPrice: number;
}


