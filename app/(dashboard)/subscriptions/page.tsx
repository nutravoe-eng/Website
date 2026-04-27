"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { getUserWithRetry } from "@/lib/supabase/auth-client";
import { getAllBowls, getSubscriptionPlans } from "@/lib/sanity";
import { formatCurrency } from "@/lib/utils";
import type { PlanId } from "@/types";
import type { PlanConfig } from "@/app/subscribe/PlanCard";
import { STUB_PLANS } from "@/app/subscribe/PlanCard";
import {
  minWeeklyBowlSubtotalFromPlan,
  maxWeeklyBowlSubtotalFromPlan,
  weeklyBowlSubtotalFromDayRows,
} from "@/lib/subscription-weekly-display";
import { findBowlByIdentifier } from "@/lib/bowl-customization";
import type { Bowl } from "@/types";

const DEBUG_SUBSCRIPTIONS = process.env.NEXT_PUBLIC_SUBS_DEBUG === "1";

type SubRow = {
  id: string;
  style: "spread" | "bulk" | "flexible";
  status: string;
  start_date: string | null;
  total_amount_rs: number | null;
  delivery_fee: number | null;
  subscription_plans: { slug: string; name: string; price_per_bowl: number } | null;
  subscription_day_configs: { day_of_week: string; bowl_slug: string; quantity: number | null }[];
};

function sanityPlansToPlanConfig(
  plans: Awaited<ReturnType<typeof getSubscriptionPlans>>,
): PlanConfig[] {
  if (!plans?.length) return STUB_PLANS;
  return plans.map((p) => {
    const perBowl = p.pricePerBowl ?? p.price_per_bowl ?? 0;
    return {
      id: p.slug as PlanId,
      name: p.name,
      bowlsPerWeek: p.bowlsPerCycle,
      weeklyPrice: perBowl * p.bowlsPerCycle,
      perBowl,
      ratePremium: p.pricePerBowlPremium,
      billingCycle: p.billingCycle,
      savingsBadge: p.savingsBadge ?? "",
      customisationChargePerBowl: p.customisationChargePerBowl ?? 0,
      deliveryStyles: p.deliveryStyles,
    };
  });
}

export default function SubscriptionsPage() {
  const [loading, setLoading] = useState(true);
  const [sub, setSub] = useState<SubRow | null>(null);
  const [bowls, setBowls] = useState<Bowl[] | null>(null);
  const [planConfigs, setPlanConfigs] = useState<PlanConfig[] | null>(null);
  const [err, setErr] = useState("");
  const [discarding, setDiscarding] = useState(false);

  useEffect(() => {
    (async () => {
      setErr("");
      const supabase = createClient();
      const user = await getUserWithRetry(supabase);
      if (!user) {
        setLoading(false);
        return;
      }
      try {
        const [pRes, b, plans] = await Promise.all([
          supabase
            .from("subscriptions")
            .select(
              "id, style, status, start_date, total_amount_rs, delivery_fee, subscription_plans ( slug, name, price_per_bowl ), subscription_day_configs ( day_of_week, bowl_slug, quantity )",
            )
            .eq("user_id", user.id)
            .in("status", ["active", "pending"])
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
          getAllBowls(),
          getSubscriptionPlans(),
        ]);
        if (DEBUG_SUBSCRIPTIONS) {
          console.info("[subscriptions/page] session_user_id", user.id);
          console.info("[subscriptions/page] query_error", pRes.error?.message ?? null);
          console.info("[subscriptions/page] query_row", pRes.data ?? null);
        }
        if (pRes.error) setErr("Could not load your subscription.");
        setSub(pRes.data as SubRow | null);
        setBowls(b);
        setPlanConfigs(sanityPlansToPlanConfig(plans));
      } catch {
        setErr("Something went wrong.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const plan = useMemo(() => {
    if (!sub?.subscription_plans?.slug || !planConfigs) return null;
    return planConfigs.find((p) => p.id === sub.subscription_plans!.slug) ?? null;
  }, [sub, planConfigs]);

  const lineDescription = useMemo(() => {
    if (!plan || !bowls?.length) return null;
    if (sub?.style === "flexible") {
      return (
        <p className="font-body text-[13px] text-stone">
          Your wallet is loaded with the plan&apos;s <strong>standard</strong> per-bowl value for this cycle (see checkout). Add premium bowls and your balance is debited at the <strong>premium</strong> rate when you order.
        </p>
      );
    }
    const rows = (sub?.subscription_day_configs ?? []).map((r) => ({
      bowlId: r.bowl_slug,
      quantity: r.quantity ?? 1,
    }));
    if (rows.length === 0) {
      return (
        <p className="font-body text-[13px] text-stone">
          From {formatCurrency(minWeeklyBowlSubtotalFromPlan(plan))}/week (all standard bowls) up to{" "}
          {formatCurrency(maxWeeklyBowlSubtotalFromPlan(plan))}/week (all premium) — exact total depends on the bowls you choose.
        </p>
      );
    }
    const tiered = weeklyBowlSubtotalFromDayRows(
      plan,
      rows,
      (id) => findBowlByIdentifier(bowls, id) ?? findBowlByIdentifier(bowls, id.replace(/^bowl-/, "")),
    );
    return (
      <p className="font-body text-[13px] text-stone">
        <span className="font-semibold text-ink">{formatCurrency(tiered)}/week</span> for your current bowl mix
        (standard {formatCurrency(plan.perBowl)}/bowl, premium {formatCurrency(plan.ratePremium ?? plan.perBowl)}/bowl
        {plan.ratePremium == null || plan.ratePremium <= 0 ? "" : " where applicable"}).
      </p>
    );
  }, [plan, bowls, sub]);

  async function handleDiscardPending() {
    if (!sub || sub.status !== "pending" || discarding) return;
    const ok = window.confirm("Discard this pending subscription request? You can create a new plan right after this.");
    if (!ok) return;

    setDiscarding(true);
    setErr("");
    try {
      const res = await fetch(`/api/subscriptions/${sub.id}`, { method: "DELETE" });
      if (!res.ok) {
        setErr("Failed to discard pending subscription. Please try again.");
        return;
      }
      setSub(null);
    } catch {
      setErr("Failed to discard pending subscription. Please try again.");
    } finally {
      setDiscarding(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 rounded-full border-2 border-sage border-t-transparent animate-spin" />
      </div>
    );
  }

  if (err) {
    return <p className="font-body text-sm text-terracotta">{err}</p>;
  }

  if (!sub) {
    return (
      <div className="text-center space-y-4">
        <p className="font-body text-stone">You don&apos;t have an active subscription yet.</p>
        <Link
          href="/subscribe"
          className="inline-flex bg-terracotta hover:bg-terracotta/90 text-white font-body text-sm font-bold px-5 py-2.5 rounded-md"
        >
          View plans
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-lg">
      <h2 className="font-display text-2xl font-medium text-ink">Subscriptions</h2>
      <div className="rounded-xl border border-black/10 bg-[#F9F8F6] p-5 space-y-2">
        <p className="font-body text-[11px] font-bold uppercase tracking-wider text-stone">Current plan</p>
        <p className="font-display text-lg text-ink">
          {sub.subscription_plans?.name ?? "Subscription"} · {sub.status}
        </p>
        {lineDescription}
        {sub.total_amount_rs != null && sub.total_amount_rs > 0 && (
          <p className="font-body text-[12px] text-stone/90 pt-1">
            Last quoted cycle amount (incl. delivery where applicable):{" "}
            <span className="font-semibold text-ink">{formatCurrency(sub.total_amount_rs)}</span>
          </p>
        )}
        {sub.start_date && (
          <p className="font-body text-[12px] text-stone">Started {sub.start_date}</p>
        )}
        {sub.status === "pending" && (
          <div className="pt-2">
            <button
              onClick={handleDiscardPending}
              disabled={discarding}
              className="font-body text-[12px] font-semibold text-terracotta hover:underline disabled:opacity-50 disabled:no-underline"
            >
              {discarding ? "Discarding..." : "Discard pending request"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
