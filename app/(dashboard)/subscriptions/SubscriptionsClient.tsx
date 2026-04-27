"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import type { Bowl, Subscription, DayBowlConfig } from "@/types";
import { formatCurrency } from "@/lib/utils";
import { getWhatsAppNumber } from "@/lib/contact";
import { STUB_PLANS as PLANS } from "../../subscribe/PlanCard";
import ManageModal from "./ManageModal";
import CancelModal from "./CancelModal";
import { createClient } from "@/lib/supabase/client";
import { getUserWithRetry } from "@/lib/supabase/auth-client";
import TopupModal from "./TopupModal";
import { isPaidFlexibleWalletEligible } from "@/lib/flexible-subscription";

const DEBUG_SUBSCRIPTIONS = process.env.NEXT_PUBLIC_SUBS_DEBUG === "1";

const PLAN_LABELS = Object.fromEntries(PLANS.map(p => [p.id, p.name]));

function mapDay(d: string): DayBowlConfig['day'] {
  const map: Record<string, DayBowlConfig['day']> = {
    mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu',
    fri: 'Fri', sat: 'Sat', sun: 'Sun',
  };
  return map[d] ?? 'Mon';
}

function getNextDeliveryDate(dayConfigs: DayBowlConfig[]): string {
  const dayIndexMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  const configuredDays = dayConfigs
    .map(dc => dayIndexMap[dc.day])
    .filter((d): d is number => d !== undefined);

  if (configuredDays.length === 0) return new Date().toISOString();

  const today = new Date();
  const todayIndex = today.getDay();

  const diffs = configuredDays.map(d => {
    const diff = d - todayIndex;
    return diff <= 0 ? diff + 7 : diff;
  });

  const next = new Date(today);
  next.setDate(today.getDate() + Math.min(...diffs));
  next.setHours(0, 0, 0, 0);
  return next.toISOString();
}

function flattenCustomizations(value: unknown): { ingredientId: string; option: "default" | "remove" | "extra" }[] {
  if (!Array.isArray(value)) return [];
  const first = value[0];
  const raw = Array.isArray(first)
    ? (value as unknown[]).flatMap((entry) => (Array.isArray(entry) ? entry : []))
    : value;
  return raw.filter(
    (item): item is { ingredientId: string; option: "default" | "remove" | "extra" } =>
      Boolean(item) &&
      typeof item === "object" &&
      typeof (item as { ingredientId?: unknown }).ingredientId === "string" &&
      ["default", "remove", "extra"].includes(String((item as { option?: unknown }).option)),
  );
}

function formatIngredientLabel(rawId: string): string {
  return rawId
    .replace(/^ingredient[-_]/i, "")
    .replace(/[-_]+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function customizationsSummary(config: DayBowlConfig): string {
  const list = flattenCustomizations(config.customizations);
  if (list.length === 0) return "";

  const base = list.some((c) => c.ingredientId === "__preset_base_milk") ? "Milk" : "Yogurt";
  const oats = list.some((c) => c.ingredientId === "__preset_oats_roasted") ? "Roasted" : "Soaked";
  const sugar = list.some((c) => c.ingredientId === "__preset_no_sugar") ? "No sugar" : "Regular sugar";
  const added = list
    .filter((c) => c.option === "extra" && !c.ingredientId.startsWith("__preset_"))
    .map((c) => formatIngredientLabel(c.ingredientId));
  const removed = list
    .filter((c) => c.option === "remove" && !c.ingredientId.startsWith("__preset_"))
    .map((c) => formatIngredientLabel(c.ingredientId));

  const parts = [`Base: ${base}`, `Oats: ${oats}`, sugar];
  if (added.length) parts.push(`Added: ${added.join(", ")}`);
  if (removed.length) parts.push(`Removed: ${removed.join(", ")}`);
  return parts.join(" · ");
}

function nextDeliveryLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86_400_000);
  if (diff <= 0) return "Today";
  if (diff === 1) return "Tomorrow";
  return d.toLocaleDateString("en-IN", { weekday: "short", month: "short", day: "numeric" });
}

interface Props {
  bowls: Bowl[];
}

export default function SubscriptionsClient({ bowls }: Props) {
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [managingId, setManagingId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [topupId, setTopupId] = useState<string | null>(null);

  const supabase = createClient();

  const fetchSubscriptions = useCallback(async () => {
    const user = await getUserWithRetry(supabase);
    if (DEBUG_SUBSCRIPTIONS) {
      console.info("[subscriptions/client] session_user_id", user?.id ?? null);
    }
    if (!user) {
      setLoaded(true);
      return;
    }

    const { data: subRows, error: subError } = await supabase
      .from('subscriptions')
      .select('*, subscription_plans ( slug, name, price_per_bowl )')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (subError) {
      if (DEBUG_SUBSCRIPTIONS) {
        console.info("[subscriptions/client] query_error", subError.message);
      }
      setError('Failed to load subscriptions. Please refresh the page.');
      setLoaded(true);
      return;
    }

    if (DEBUG_SUBSCRIPTIONS) {
      console.info("[subscriptions/client] raw_rows_count", subRows?.length ?? 0);
      console.info("[subscriptions/client] raw_rows", subRows ?? []);
    }

    if (!subRows || subRows.length === 0) {
      setSubs([]);
      setLoaded(true);
      return;
    }

    const subIds = subRows.map(s => s.id);
    const [{ data: dayConfigRows }, { data: periodOrderRows }] = await Promise.all([
      supabase
        .from('subscription_day_configs')
        .select('*')
        .in('subscription_id', subIds),
      supabase
        .from('orders')
        .select('subscription_id, order_items ( quantity )')
        .in('subscription_id', subIds)
        .in('status', ['confirmed', 'delivered']),
    ]);

    // Count total bowls ordered per subscription (across all confirmed/delivered orders)
    const bowlsOrderedBySub: Record<string, number> = {};
    for (const order of (periodOrderRows ?? [])) {
      const subId = order.subscription_id as string;
      const qty = (Array.isArray(order.order_items) ? order.order_items : [])
        .reduce((sum: number, item: { quantity?: number }) => sum + (item?.quantity ?? 0), 0);
      bowlsOrderedBySub[subId] = (bowlsOrderedBySub[subId] ?? 0) + qty;
    }

    const mapped: Subscription[] = subRows.map(sub => {
      const configs = (dayConfigRows ?? []).filter(r => r.subscription_id === sub.id);
      const dayConfigs: DayBowlConfig[] = configs.map(row => ({
        day: mapDay(row.day_of_week),
        bowlId: row.bowl_slug,
        bowlName: row.bowl_slug,
        quantity: row.quantity,
        customizations: row.customizations,
      }));

      const planSlug = sub.subscription_plans?.slug ?? sub.plan_id;
      const plan = PLANS.find(p => p.id === planSlug);
      const weeklyFromPlan = plan?.weeklyPrice ?? 0;
      const weeklyFromQuote = typeof sub.total_amount_rs === "number" ? sub.total_amount_rs : 0;

      return {
        id: sub.id,
        planId: planSlug,
        deliveryStyle: sub.style,
        billingCycle: sub.billing_cycle ?? 'weekly',
        status: sub.status,
        paymentStatus: sub.payment_status ?? 'pending',
        weeklyPrice: weeklyFromPlan > 0 ? weeklyFromPlan : weeklyFromQuote,
        nextDelivery: getNextDeliveryDate(dayConfigs),
        startDate: sub.start_date,
        deliveryTimeSlot: sub.delivery_time_slot ?? undefined,
        dayConfigs,
        walletBalancePaise: sub.wallet_balance_rs != null ? sub.wallet_balance_rs * 100 : 0,
        deliveryAddress: '',
        createdAt: sub.created_at,
        periodEndDate: sub.period_end_date,
        deliveriesCompleted: bowlsOrderedBySub[sub.id] ?? 0,
      } as Subscription;
    });

    setSubs(mapped);
    setLoaded(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchSubscriptions();
  }, [fetchSubscriptions]);

  async function updateStatus(id: string, status: Subscription["status"]) {
    const res = await fetch(`/api/subscriptions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });

    if (!res.ok) {
      setError('Failed to update subscription status. Please try again.');
      return;
    }

    setSubs(prev => prev.map(s => s.id === id ? { ...s, status } : s));
  }

  async function handleDiscard(id: string) {
    if (!confirm('Are you sure you want to discard this request? This will permanently delete your configuration.')) return;
    
    const res = await fetch(`/api/subscriptions/${id}`, {
      method: 'DELETE',
    });

    if (!res.ok) {
      setError('Failed to discard request. Please try again.');
      return;
    }

    setSubs(prev => prev.filter(s => s.id !== id));
  }

  async function handleManageSave(updated: Subscription) {
    const res = await fetch(`/api/subscriptions/${updated.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deliveryTimeSlot: updated.deliveryTimeSlot ?? null,
        dayConfigs: updated.dayConfigs.map((dc) => ({
          day: dc.day,
          bowlId: dc.bowlId,
          quantity: dc.quantity,
        })),
      }),
    });

    if (!res.ok) {
      setError('Failed to save changes. Please try again.');
      return;
    }

    setSubs(prev => prev.map(s => s.id === updated.id ? updated : s));
    setManagingId(null);
  }

  if (!loaded) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-7 h-7 rounded-full border-2 border-sage border-t-transparent animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-terracotta/5 border border-terracotta/20 rounded-xl">
        <p className="font-body text-[13px] text-terracotta font-medium">{error}</p>
      </div>
    );
  }

  const activeSubs = subs.filter(s => s.status !== "cancelled");
  const managingSub = managingId ? subs.find(s => s.id === managingId) : null;
  const cancellingSub = cancellingId ? subs.find(s => s.id === cancellingId) : null;

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="flex items-center justify-between mb-8">
        <h2 className="font-display text-2xl font-medium text-ink">My Subscriptions</h2>
        <Link
          href="/subscribe"
          className="px-4 py-2 bg-black/5 hover:bg-black/10 text-ink rounded-md font-body text-[13px] font-bold transition-colors"
        >
          + New Plan
        </Link>
      </div>

      {activeSubs.some(s => s.status === 'active' && s.deliveryStyle === 'flexible' && s.periodEndDate && (Math.ceil((new Date(s.periodEndDate).getTime() - Date.now()) / 86400000) <= 2)) && (
        <div className="mb-8 p-6 bg-sage/10 border border-sage/20 rounded-2xl animate-in fade-in slide-in-from-top-4 duration-500">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h3 className="font-display text-lg font-medium text-sage-dark mb-1">Your plan is ending soon!</h3>
              <p className="font-body text-[13px] text-stone">Renew now to keep your healthy habit going without any break.</p>
            </div>
            <div className="flex gap-3">
              <Link
                href="/subscribe"
                className="px-5 py-2.5 bg-sage hover:bg-sage-dark text-white rounded-md font-body text-[13px] font-bold transition-colors shadow-sm"
              >
                Change My Plan
              </Link>
              <button
                onClick={() => window.open(`https://wa.me/${getWhatsAppNumber()}?text=${encodeURIComponent("Hi Nutravoe, I want to renew my current subscription for the next cycle.")}`, "_blank")}
                className="px-5 py-2.5 border border-sage/30 text-sage-dark hover:bg-sage/5 rounded-md font-body text-[13px] font-bold transition-colors"
              >
                Renew via WhatsApp
              </button>
            </div>
          </div>
        </div>
      )}

      {activeSubs.length === 0 ? (
        <div className="text-center py-12 px-4 bg-black/5 rounded-xl border border-black/5 border-dashed">
          <p className="font-body text-[14px] text-stone mb-4">You have no active subscriptions.</p>
          <Link
            href="/subscribe"
            className="bg-sage hover:bg-sage-dark text-white font-body text-[13px] font-bold px-6 py-2.5 rounded-md transition-colors shadow-sm inline-block"
          >
            Start a New Plan
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {activeSubs.map(sub => {
            const paused = sub.status === "paused";
            const isCompleted = sub.status === "completed";
            const completedFlex =
              sub.status === "completed" &&
              sub.deliveryStyle === "flexible" &&
              isPaidFlexibleWalletEligible({
                style: sub.deliveryStyle,
                status: sub.status,
                payment_status: sub.paymentStatus ?? "pending",
                period_end_date: sub.periodEndDate ?? null,
              });
            const statusLabel =
              sub.status === "pending"
                ? "Pending Activation"
                : sub.status === "completed" && sub.deliveryStyle === "flexible"
                  ? "Cycle completed"
                  : sub.status;
            return (
              <div
                key={sub.id}
                className={`bg-white rounded-xl overflow-hidden shadow-sm relative transition-all duration-300 ${paused ? "border border-stone/30 opacity-80" : (sub.status === 'pending' ? "border border-terracotta/30" : sub.status === 'completed' ? "border border-stone/25" : "border border-sage/30")}`}
              >
                <div className={`absolute top-0 left-0 w-1.5 h-full ${paused ? "bg-stone/50" : (sub.status === 'pending' ? "bg-terracotta" : sub.status === 'completed' ? "bg-stone/40" : "bg-sage")}`} />

                <div className="p-6 md:p-8 flex flex-col md:flex-row md:items-start justify-between gap-6">
                  <div className="flex gap-5 items-start">
                    <div className="w-16 h-16 rounded-lg bg-[#F9F8F6] flex items-center justify-center shrink-0">
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={paused ? "text-stone" : "text-sage"}>
                        <path d="M2 12h5l3 8 4-16 3 8h5" />
                      </svg>
                    </div>
                    <div>
                      <div className="flex items-center gap-3 mb-1.5">
                        <h3 className="font-display text-xl font-medium text-ink">
                          {PLAN_LABELS[sub.planId] ?? sub.planId}
                        </h3>
                        <span className={`px-2.5 py-0.5 rounded-full font-body text-[10px] font-bold uppercase tracking-widest ${paused ? "bg-stone/10 text-stone" : (sub.status === 'pending' ? "bg-terracotta/10 text-terracotta" : sub.status === 'completed' ? "bg-stone/15 text-stone" : "bg-sage/10 text-sage")}`}>
                          {statusLabel}
                        </span>
                      </div>
                      <p className="font-body text-[13px] text-stone mb-1">
                        {formatCurrency(sub.weeklyPrice)}/week
                      </p>
                      {sub.dayConfigs?.length > 0 && (
                        <div className="space-y-1 mb-2">
                          {sub.dayConfigs.map((dc, idx) => {
                            const details = customizationsSummary(dc);
                            return (
                              <p key={`${sub.id}-${dc.day}-${idx}`} className="font-body text-[11px] text-stone/90 leading-relaxed">
                                {dc.day}: {formatIngredientLabel(dc.bowlName)} ×{dc.quantity}
                                {details ? ` (${details})` : ""}
                              </p>
                            );
                          })}
                        </div>
                      )}
                      {completedFlex && sub.periodEndDate ? (
                        <p className="font-body text-[13px] text-ink leading-relaxed max-w-md">
                          This cycle&apos;s bowl quota is complete. You can still spend any remaining wallet balance until{" "}
                          <span className="font-semibold">
                            {new Date(sub.periodEndDate).toLocaleDateString("en-IN", {
                              weekday: "short",
                              day: "numeric",
                              month: "short",
                            })}
                          </span>
                          . Start a new plan anytime — your slot is free.
                        </p>
                      ) : paused ? (
                        <p className="font-body text-[13px] font-semibold text-terracotta">Deliveries paused</p>
                      ) : (
                        <p className="font-body text-[13px] text-ink">
                          Next delivery:{" "}
                          <span className="font-semibold">{nextDeliveryLabel(sub.nextDelivery)}</span>
                        </p>
                      )}

                      {(sub.status === 'active' || sub.status === 'completed') && sub.deliveriesCompleted !== undefined && (
                        <div className="mt-4 pt-4 border-t border-black/5 max-w-[200px]">
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="font-body text-[11px] font-bold text-stone uppercase tracking-wider">Usage Progress</span>
                            <span className="font-body text-[11px] font-bold text-ink">{sub.deliveriesCompleted} bowls consumed</span>
                          </div>
                          <div className="h-1 bg-black/5 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-sage transition-all duration-500" 
                              style={{ width: `${Math.min(100, (sub.deliveriesCompleted / (sub.planId === 'daily' ? 1 : (sub.planId === 'five-bowl' ? 5 : 3))) * 100)}%` }} 
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 min-w-[150px]">
                    {sub.status === 'pending' ? null : isCompleted ? (
                      <div className="space-y-2">
                        <div className="w-full border border-black/10 bg-[#F9F8F6] text-stone font-body text-[13px] font-medium py-2.5 rounded-md text-center">
                          Plan Completed
                        </div>
                        <p className="font-body text-[11px] text-stone leading-relaxed">
                          Manage, cancel, and top-up are disabled after quota completion.
                        </p>
                      </div>
                    ) : (
                      <>
                        <button
                          onClick={() => setManagingId(sub.id)}
                          className="w-full bg-sage hover:bg-sage-dark text-white font-body text-[13px] font-bold py-2.5 rounded-md transition-colors shadow-sm"
                        >
                          Manage
                        </button>
                        {sub.deliveryStyle === 'flexible' &&
                          sub.paymentStatus === 'paid' &&
                          isPaidFlexibleWalletEligible({
                            style: sub.deliveryStyle,
                            status: sub.status,
                            payment_status: sub.paymentStatus,
                            period_end_date: sub.periodEndDate ?? null,
                          }) && (
                          <button
                            onClick={() => setTopupId(sub.id)}
                            className="w-full bg-ink hover:bg-black text-white font-body text-[13px] font-bold py-2.5 rounded-md transition-colors shadow-sm"
                          >
                            Top up Wallet
                          </button>
                        )}
                        {/* Pause/resume controls intentionally hidden for now; keep API hooks in place for future re-enable. */}
                      </>
                    )}
                    {sub.paymentStatus === 'paid' && (
                      <a
                        href={`/invoice/subscription/${sub.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full flex items-center justify-center gap-1.5 border border-black/10 hover:bg-[#F9F8F6] text-stone font-body text-[12px] font-medium py-2 rounded-md transition-colors"
                        title="Subscription Invoice"
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                          <polyline points="7 10 12 15 17 10"/>
                          <line x1="12" y1="15" x2="12" y2="3"/>
                        </svg>
                        Invoice
                      </a>
                    )}
                    {/*
                      Temporarily disable customer-facing "Cancel Plan" action for non-pending subscriptions.
                      Keep pending discard visible so users can remove unapproved requests.
                    */}
                    {sub.status === 'pending' && (
                      <button
                        onClick={() => handleDiscard(sub.id)}
                        className="w-full mt-1 border border-terracotta/30 text-terracotta hover:bg-terracotta/5 font-body text-[12px] font-bold py-2 rounded-md transition-colors"
                      >
                        Discard Request
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {managingSub && (
        <ManageModal
          sub={managingSub}
          bowls={bowls}
          onSave={handleManageSave}
          onClose={() => setManagingId(null)}
        />
      )}

      {cancellingSub && (
        <CancelModal
          sub={cancellingSub}
          onPause={() => updateStatus(cancellingSub.id, "paused")}
          onCancel={() => updateStatus(cancellingSub.id, "cancelled")}
          onClose={() => setCancellingId(null)}
        />
      )}

      {topupId && subs.find(s => s.id === topupId) && (
        <TopupModal
          sub={subs.find(s => s.id === topupId)!}
          onClose={() => setTopupId(null)}
        />
      )}
    </div>
  );
}
