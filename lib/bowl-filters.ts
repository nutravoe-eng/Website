import type { Bowl, SubscriptionPlan } from "@/types";

/** Weekly spread plans the customer UI advertises (3 / 5 / 7 per week). */
const WEEKLY_SPREAD_COUNTS = new Set([3, 5, 7]);

/**
 * Excludes one-off or mis-typed `subscriptionPlan` documents from CMS (e.g. add-on products
 * that were modelled as plans) that would appear after the main weekly plans in admin selects.
 */
export function filterWeeklySpreadPlansForUI(plans: SubscriptionPlan[]): SubscriptionPlan[] {
  return plans.filter(
    (p) => p.billingCycle === "weekly" && WEEKLY_SPREAD_COUNTS.has(p.bowlsPerCycle),
  );
}

function tierKey(t: Bowl["subscriptionPriceTier"] | undefined | string | null): string {
  if (t == null) return "";
  return String(t)
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim()
    .toLowerCase();
}

/**
 * Only offer bowls that are valid subscription SKUs: tier is set in Sanity and the product is
 * intended for bowl subscriptions (strips stray add-on bowl documents without a tier, e.g. drinks).
 * Uses case-insensitive tier so CMS/Studio casing matches (e.g. "Premium" vs "premium").
 */
export function filterBowlsForSubscriptionPicker(bowls: Bowl[]): Bowl[] {
  return bowls.filter((b) => {
    if (b.available === false) return false;
    const k = tierKey(b.subscriptionPriceTier);
    return k === "standard" || k === "premium";
  });
}
