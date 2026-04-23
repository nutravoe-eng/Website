import type { PlanConfig } from "@/app/subscribe/PlanCard";
import type { Bowl, SubscriptionPlan } from "@/types";

/** True when the bowl should use the plan's premium per-bowl row (e.g. ₹399-class menu). */
export function isPremiumBowl(bowl: Bowl): boolean {
  return bowl.subscriptionPriceTier === "premium";
}

/** Standard (299-class) subscription unit price, global (delivery is separate). */
export function subscriptionStandardPerBowl(plan: SubscriptionPlan): number {
  return plan.pricePerBowl || plan.price_per_bowl || 0;
}

/**
 * Premium subscription unit price, or standard if premium fields are unset (migration-safe).
 */
export function subscriptionPremiumPerBowl(plan: SubscriptionPlan): number {
  const p = plan.pricePerBowlPremium;
  if (p != null && p > 0) return p;
  return subscriptionStandardPerBowl(plan);
}

/**
 * Per-bowl subscriber base price for wallet orders and spread quotes: standard vs premium row.
 */
export function getSubscriptionBaseUnitPriceForBowl(
  plan: SubscriptionPlan,
  bowl: Bowl,
): number {
  if (isPremiumBowl(bowl)) {
    return subscriptionPremiumPerBowl(plan);
  }
  return subscriptionStandardPerBowl(plan);
}

/**
 * Resolves tiered subscription base ₹ for cart + subscribe wizard when only {@link PlanConfig} is available.
 */
export function getSubscriberBaseFromPlanConfig(bowl: Bowl, plan: PlanConfig): number {
  const std = plan.perBowl;
  const asPlan: SubscriptionPlan = {
    _id: "plan-config",
    name: plan.name,
    slug: plan.id,
    bowlsPerCycle: plan.bowlsPerWeek,
    billingCycle: plan.billingCycle ?? "weekly",
    pricePerBowl: std,
    pricePerBowlPremium: plan.ratePremium,
    customisationChargePerBowl: plan.customisationChargePerBowl ?? 0,
    deliveryStyles: plan.deliveryStyles ?? ["spread", "flexible"],
    isActive: true,
    displayOrder: 0,
  };
  return getSubscriptionBaseUnitPriceForBowl(asPlan, bowl);
}
