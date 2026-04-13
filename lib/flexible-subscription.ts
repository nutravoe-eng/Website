import type { SupabaseClient } from "@supabase/supabase-js";

/** IST calendar date YYYY-MM-DD for period comparisons (matches DB wallet_topup trigger). */
export function todayISTDateString(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

/** Row shape for per-bowl subscriber vs retail pricing (wallet + WhatsApp/COD). */
export type PricedSubscriptionRow = {
  id: string;
  style: string;
  status: string;
  billing_cycle?: string | null;
  start_date?: string | null;
  period_end_date?: string | null;
  /** Supabase join is one object; generated types may use an array. */
  subscription_plans?: { slug?: string; min_bowls?: number } | { slug?: string; min_bowls?: number }[] | null;
};

function subscriptionPlanJoin(
  join: PricedSubscriptionRow["subscription_plans"],
): { slug?: string; min_bowls?: number } | null {
  if (join == null) return null;
  return Array.isArray(join) ? join[0] ?? null : join;
}

/**
 * Plan slug for `buildAuthoritativeOrder`: subscriber price when in-quota flexible, else retail (`null`).
 * Spread and other styles keep plan slug; flexible `completed` is always retail; flexible `active` matches wallet over-quota logic.
 */
export async function planSlugForCheckoutPricing(
  admin: SupabaseClient,
  pricedSub: PricedSubscriptionRow | null | undefined,
): Promise<string | null> {
  if (!pricedSub) return null;

  const plan = subscriptionPlanJoin(pricedSub.subscription_plans);
  const slug = plan?.slug ?? null;

  if (pricedSub.style === "flexible" && pricedSub.status === "completed") {
    return null;
  }

  const planLimit = Number(plan?.min_bowls ?? 0);
  if (planLimit <= 0) {
    return slug;
  }

  const isWeekly = pricedSub.billing_cycle !== "monthly";
  const cycleDays = isWeekly ? 7 : 30;
  let periodEndStr = (pricedSub.period_end_date as string) || "";
  let periodStartStr: string;

  if (periodEndStr) {
    const periodEndDate = new Date(periodEndStr);
    const periodStartDate = new Date(periodEndDate.getTime() - cycleDays * 24 * 60 * 60 * 1000);
    periodStartStr = periodStartDate.toISOString().split("T")[0];
  } else {
    periodStartStr = (pricedSub.start_date as string) || "2000-01-01";
    periodEndStr = new Date(Date.now() + cycleDays * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  }

  const { data: orderedData } = await admin
    .from("orders")
    .select("id, order_items ( quantity )")
    .eq("subscription_id", pricedSub.id)
    .in("status", ["confirmed", "delivered"])
    .gte("delivery_date", periodStartStr)
    .lte("delivery_date", periodEndStr);

  const alreadyOrderedCount = (orderedData ?? []).reduce((acc, order: { order_items?: unknown }) => {
    const items = Array.isArray(order.order_items) ? order.order_items : [];
    return (
      acc +
      items.reduce(
        (sum: number, item: { quantity?: number }) => sum + (item?.quantity ?? 0),
        0,
      )
    );
  }, 0);

  const isOverQuota = alreadyOrderedCount >= planLimit;
  return isOverQuota ? null : slug;
}

/** Paid flexible subscription that may place wallet orders or request top-ups (active, or completed but still in cycle). */
export function isPaidFlexibleWalletEligible(row: {
  style: string;
  status: string;
  payment_status: string;
  period_end_date: string | null;
}): boolean {
  if (row.style !== "flexible" || row.payment_status !== "paid") return false;
  const today = todayISTDateString();
  if (row.status === "active") return true;
  if (
    row.status === "completed" &&
    row.period_end_date != null &&
    row.period_end_date !== "" &&
    row.period_end_date >= today
  ) {
    return true;
  }
  return false;
}

export function preferActiveSubscription<T extends { status: string; created_at?: string }>(
  rows: T[],
): T | undefined {
  if (!rows.length) return undefined;
  const actives = rows.filter((r) => r.status === "active");
  const pool = actives.length ? actives : rows;
  return pool.sort((a, b) => {
    const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
    const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
    return tb - ta;
  })[0];
}
