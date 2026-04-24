import type { PlanConfig } from "@/app/subscribe/PlanCard";
import type { Bowl } from "@/types";
import { getSubscriberBaseFromPlanConfig } from "@/lib/subscription-pricing";

/** Minimum weekly bowl subtotal if every slot used a standard-tier bowl. */
export function minWeeklyBowlSubtotalFromPlan(plan: PlanConfig): number {
  return plan.perBowl * plan.bowlsPerWeek;
}

/** Maximum weekly bowl subtotal if every slot used a premium-tier bowl (when premium rate exists). */
export function maxWeeklyBowlSubtotalFromPlan(plan: PlanConfig): number {
  const prem = plan.ratePremium != null && plan.ratePremium > 0 ? plan.ratePremium : plan.perBowl;
  return prem * plan.bowlsPerWeek;
}

/**
 * Sum subscriber bowl ₹ for a spread plan from day rows (matches checkout / admin).
 */
export function weeklyBowlSubtotalFromDayRows(
  plan: PlanConfig,
  rows: { bowlId: string; quantity?: number }[],
  resolveBowl: (bowlId: string) => Bowl | undefined,
): number {
  let s = 0;
  for (const row of rows) {
    const q = Math.max(1, Math.trunc(row.quantity ?? 1));
    const bowl = resolveBowl(row.bowlId);
    if (!bowl) continue;
    s += getSubscriberBaseFromPlanConfig(bowl, plan) * q;
  }
  return s;
}
