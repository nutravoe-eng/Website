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
        paymentStatus: sub.payment_status ?? 'pending',
        weeklyPrice: plan?.weeklyPrice ?? 0,
        nextDelivery: getNextDeliveryDate(dayConfigs),
        startDate: sub.start_date,
        deliveryTimeSlot: sub.delivery_time_slot ?? undefined,
        dayConfigs,
        walletBalancePaise: sub.wallet_balance_rs != null ? sub.wallet_balance_rs * 100 : 0,
        deliveryAddress: '',
        createdAt: sub.created_at,
        periodEndDate: sub.period_end_date,
        deliveriesCompleted: sub.deliveries_completed ?? 0,
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

      {activeSubs.some(s => s.status === 'active' && s.periodEndDate && (Math.ceil((new Date(s.periodEndDate).getTime() - Date.now()) / 86400000) <= 2)) && (
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
                onClick={() => window.open(`https://wa.me/91XXXXXXXXXX?text=${encodeURIComponent("Hi Nutravoe, I want to renew my current subscription for the next cycle.")}`, "_blank")}
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
            return (
              <div
                key={sub.id}
                className={`bg-white rounded-xl overflow-hidden shadow-sm relative transition-all duration-300 ${paused ? "border border-stone/30 opacity-80" : (sub.status === 'pending' ? "border border-terracotta/30" : "border border-sage/30")}`}
              >
                <div className={`absolute top-0 left-0 w-1.5 h-full ${paused ? "bg-stone/50" : (sub.status === 'pending' ? "bg-terracotta" : "bg-sage")}`} />

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
                        <span className={`px-2.5 py-0.5 rounded-full font-body text-[10px] font-bold uppercase tracking-widest ${paused ? "bg-stone/10 text-stone" : (sub.status === 'pending' ? "bg-terracotta/10 text-terracotta" : "bg-sage/10 text-sage")}`}>
                          {sub.status === 'pending' ? 'Pending Activation' : sub.status}
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

                      {sub.status === 'active' && sub.deliveriesCompleted !== undefined && (
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
                    {sub.status === 'pending' ? (
                      <button
                        onClick={() => window.open(`https://wa.me/91XXXXXXXXXX?text=${encodeURIComponent("Hi Nutravoe, following up on my subscription request (#NV-" + sub.id.slice(0, 4).toUpperCase() + "). Please let me know the activation status.")}`, "_blank")}
                        className="w-full bg-[#25D366] hover:bg-[#20bd5a] text-white font-body text-[13px] font-bold py-2.5 rounded-md transition-colors shadow-sm flex items-center justify-center gap-2"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                        </svg>
                        Resend WhatsApp
                      </button>
                    ) : (
                      <>
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
                    <button
                      onClick={() => sub.status === 'pending' ? handleDiscard(sub.id) : setCancellingId(sub.id)}
                      className="text-stone hover:text-terracotta font-body text-[12px] font-medium transition-colors mt-1 text-left"
                    >
                      {sub.status === 'pending' ? 'Discard Request' : 'Cancel Plan'}
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
