"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import type { Bowl, Subscription, DayBowlConfig } from "@/types";
import { formatCurrency } from "@/lib/utils";
import { STUB_PLANS as PLANS } from "../../subscribe/PlanCard";
import ManageModal from "./ManageModal";
import CancelModal from "./CancelModal";
import { createClient } from "@/lib/supabase/client";
import TopupModal from "./TopupModal";

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

function deliverySummary(sub: Subscription): string {
  if (sub.dayConfigs?.length) {
    return sub.dayConfigs.map(d => `${d.day}: ${d.bowlName}`).join(" · ");
  }
  return "—";
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
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoaded(true);
      return;
    }

    const { data: subRows, error: subError } = await supabase
      .from('subscriptions')
      .select('*, subscription_plans ( slug )')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (subError) {
      setError('Failed to load subscriptions. Please refresh the page.');
      setLoaded(true);
      return;
    }

    if (!subRows || subRows.length === 0) {
      setSubs([]);
      setLoaded(true);
      return;
    }

    const subIds = subRows.map(s => s.id);
    const { data: dayConfigRows } = await supabase
      .from('subscription_day_configs')
      .select('*')
      .in('subscription_id', subIds);

    const mapped: Subscription[] = subRows.map(sub => {
      const configs = (dayConfigRows ?? []).filter(r => r.subscription_id === sub.id);
      const dayConfigs: DayBowlConfig[] = configs.map(row => ({
        day: mapDay(row.day_of_week),
        bowlId: row.bowl_slug,
        bowlName: row.bowl_slug,
        quantity: row.quantity,
      }));

      const planSlug = sub.subscription_plans?.slug ?? sub.plan_id;
      const plan = PLANS.find(p => p.id === planSlug);

      return {
        id: sub.id,
        planId: planSlug,
        deliveryStyle: sub.style,
        billingCycle: sub.billing_cycle ?? 'weekly',
        status: sub.status,
        weeklyPrice: plan?.weeklyPrice ?? 0,
        nextDelivery: getNextDeliveryDate(dayConfigs),
        startDate: sub.start_date,
        deliveryTimeSlot: sub.delivery_time_slot ?? undefined,
        dayConfigs,
        walletBalancePaise: sub.wallet_balance_rs != null ? sub.wallet_balance_rs * 100 : 0,
        deliveryAddress: '',
        createdAt: sub.created_at,
        periodEndDate: sub.period_end_date,
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
            return (
              <div
                key={sub.id}
                className={`bg-white rounded-xl overflow-hidden shadow-sm relative transition-all duration-300 ${paused ? "border border-stone/30 opacity-80" : "border border-sage/30"}`}
              >
                <div className={`absolute top-0 left-0 w-1.5 h-full ${paused ? "bg-stone/50" : "bg-sage"}`} />

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
                        <span className={`px-2.5 py-0.5 rounded-full font-body text-[10px] font-bold uppercase tracking-widest ${paused ? "bg-stone/10 text-stone" : "bg-sage/10 text-sage"}`}>
                          {sub.status}
                        </span>
                      </div>
                      <p className="font-body text-[13px] text-stone mb-1">
                        {formatCurrency(sub.weeklyPrice)}/week
                      </p>
                      <p className="font-body text-[12px] text-stone mb-2 max-w-sm leading-relaxed">
                        {deliverySummary(sub)}
                      </p>
                      {paused ? (
                        <p className="font-body text-[13px] font-semibold text-terracotta">Deliveries paused</p>
                      ) : (
                        <p className="font-body text-[13px] text-ink">
                          Next delivery:{" "}
                          <span className="font-semibold">{nextDeliveryLabel(sub.nextDelivery)}</span>
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 min-w-[150px]">
                    <button
                      onClick={() => setManagingId(sub.id)}
                      className="w-full bg-sage hover:bg-sage-dark text-white font-body text-[13px] font-bold py-2.5 rounded-md transition-colors shadow-sm"
                    >
                      Manage
                    </button>
                    {sub.deliveryStyle === 'flexible' && (
                      <button
                        onClick={() => setTopupId(sub.id)}
                        className="w-full bg-ink hover:bg-black text-white font-body text-[13px] font-bold py-2.5 rounded-md transition-colors shadow-sm"
                      >
                        Top up Wallet
                      </button>
                    )}
                    {paused ? (
                      <button
                        onClick={() => updateStatus(sub.id, "active")}
                        className="w-full bg-ink hover:bg-black text-white font-body text-[13px] font-bold py-2.5 rounded-md transition-colors shadow-sm"
                      >
                        Resume Deliveries
                      </button>
                    ) : (
                      <button
                        onClick={() => updateStatus(sub.id, "paused")}
                        className="w-full border border-black/10 hover:bg-[#F9F8F6] text-ink font-body text-[13px] font-medium py-2.5 rounded-md transition-colors"
                      >
                        Pause
                      </button>
                    )}
                    <button
                      onClick={() => setCancellingId(sub.id)}
                      className="text-stone hover:text-terracotta font-body text-[12px] font-medium transition-colors mt-1 text-left"
                    >
                      Cancel Plan
                    </button>
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
