'use client';

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import type { Bowl, PlanId, DeliveryStyle, DayBowlConfig, IngredientCustomization } from "@/types";
import { formatCurrency } from "@/lib/utils";
import PlanCard, { PLANS } from "./PlanCard";
import { creditWallet } from "@/lib/wallet";
import BowlPicker from "./BowlPicker";
import CustomizationModal from "@/components/CustomizationModal";
import { createClient } from "@/lib/supabase/client";

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
type Day = typeof DAYS[number];

const TIME_SLOTS = [
  '7:00 AM – 8:00 AM',
  '8:00 AM – 9:00 AM',
  '9:00 AM – 10:00 AM',
] as const;

interface WizardState {
  step: 1 | 2 | 3;
  planId: PlanId | null;
  deliveryStyle: DeliveryStyle | null;
  bulkDeliveryDay: string;
  selectedDays: Day[];
  // Scenario C (daily) — one bowl per day
  dayBowlMap: Record<string, string>;
  dayCustomMap: Record<string, IngredientCustomization[]>;
  // Scenario A (spread) — multiple bowls + quantities per day
  dayBowlCounts: Record<string, Record<string, number>>;
  dayBowlCustomMap: Record<string, Record<string, IngredientCustomization[]>>;
  // Scenario B (bulk)
  bulkBowlCounts: Record<string, number>;
  bulkCustomMap: Record<string, IngredientCustomization[]>;
  // Shared
  deliveryTimeSlot: string;
}

interface Props {
  bowls: Bowl[];
}

function calcCustomCost(customizations: IngredientCustomization[], bowl?: Bowl | null): number {
  if (!bowl?.customizableIngredients) return 0;
  return customizations
    .filter(c => c.option === 'extra')
    .reduce((sum, c) => {
      const ing = bowl.customizableIngredients!.find(i => i.id === c.ingredientId);
      return sum + (ing?.extraCost ?? 0);
    }, 0);
}

export default function SubscribeWizard({ bowls }: Props) {
  const [state, setState] = useState<WizardState>({
    step: 1,
    planId: null,
    deliveryStyle: null,
    bulkDeliveryDay: 'next-day',
    selectedDays: [],
    dayBowlMap: {},
    dayCustomMap: {},
    dayBowlCounts: {},
    dayBowlCustomMap: {},
    bulkBowlCounts: {},
    bulkCustomMap: {},
    deliveryTimeSlot: '',
  });

  const [user, setUser] = useState<{ name: string; phone: string; email: string; id: string } | null>(null);
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [hasActiveSub, setHasActiveSub] = useState(false);

  // Customization modal triggers
  const [customizingDay, setCustomizingDay] = useState<string | null>(null);  // scenario C
  const [customizingSpreadKey, setCustomizingSpreadKey] = useState<{ day: string; bowlId: string } | null>(null);  // scenario A
  const [customizingBulkBowlId, setCustomizingBulkBowlId] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();

    supabase.auth.getUser().then(async ({ data: { user: authUser } }) => {
      if (!authUser) return;

      const name =
        (authUser.user_metadata?.full_name as string | undefined) ??
        authUser.email?.split('@')[0] ??
        'there';

      setUser({
        id: authUser.id,
        name,
        phone: (authUser.user_metadata?.phone as string | undefined) ?? '',
        email: authUser.email ?? '',
      });

      // Check for active subscription
      const { data: activeSub } = await supabase
        .from('subscriptions')
        .select('id')
        .eq('user_id', authUser.id)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle();

      if (activeSub) setHasActiveSub(true);

      // Load default delivery address from Supabase
      const { data: addresses } = await supabase
        .from('addresses')
        .select('line1, line2, pincode, is_default')
        .eq('user_id', authUser.id)
        .order('is_default', { ascending: false })
        .limit(5);

      if (addresses && addresses.length > 0) {
        const def = addresses.find(a => a.is_default) ?? addresses[0];
        if (def) {
          setDeliveryAddress(`${def.line1}, ${def.line2}, Karnataka ${def.pincode}`);
        }
      }
    });
  }, []);

  const currentPlan = PLANS.find(p => p.id === state.planId);

  function getScenario(): 'A' | 'B' | 'C' | 'D' {
    if (state.planId === 'daily') return 'C';
    if (state.deliveryStyle === 'bulk') return 'B';
    if (state.deliveryStyle === 'flexible') return 'D';
    return 'A';
  }

  // ─── Validation ─────────────────────────────────────────────────────────────

  const canProceedStep1 =
    state.planId !== null &&
    (state.planId === 'daily' || state.deliveryStyle !== null);

  const spreadTotal = Object.values(state.dayBowlCounts).reduce(
    (sum, dayCounts) => sum + Object.values(dayCounts).reduce((s, c) => s + c, 0), 0
  );

  const canProceedStep2 = (() => {
    if (!currentPlan) return false;
    const scenario = getScenario();

    if (scenario === 'D') return true;  // wallet — no pre-selection needed

    // All non-flexible scenarios require a time slot
    if (!state.deliveryTimeSlot) return false;

    if (scenario === 'A') {
      return spreadTotal === currentPlan.bowlsPerWeek;
    }

    if (scenario === 'C') {
      if (state.selectedDays.length !== currentPlan.bowlsPerWeek) return false;
      return state.selectedDays.every(day => Boolean(state.dayBowlMap[day]));
    }

    if (scenario === 'B') {
      const total = Object.values(state.bulkBowlCounts).reduce((s, c) => s + c, 0);
      return total === currentPlan.bowlsPerWeek;
    }

    return false;
  })();

  // ─── Step transitions ────────────────────────────────────────────────────────

  function goToStep2() {
    if (!currentPlan) return;
    // Pre-fill days for Daily scenario
    if (state.planId === 'daily') {
      setState(s => ({ ...s, step: 2, selectedDays: [...DAYS] }));
    } else {
      setState(s => ({ ...s, step: 2 }));
    }
  }

  function goToStep3() {
    setState(s => ({ ...s, step: 3 }));
    setError('');
  }

  function goBack() {
    setState(s => ({ ...s, step: (s.step - 1) as 1 | 2 }));
    setError('');
  }

  // ─── Day toggle (Step 2A & 2C) ───────────────────────────────────────────────

  function toggleDay(day: Day) {
    const scenario = getScenario();
    const isSelected = state.selectedDays.includes(day);

    if (isSelected) {
      // Clear bowl data for this day on deselect
      setState(s => {
        const newDayBowlCounts = { ...s.dayBowlCounts };
        delete newDayBowlCounts[day];
        const newDayBowlCustomMap = { ...s.dayBowlCustomMap };
        delete newDayBowlCustomMap[day];
        return {
          ...s,
          selectedDays: s.selectedDays.filter(d => d !== day),
          dayBowlMap: { ...s.dayBowlMap, [day]: '' },
          dayBowlCounts: newDayBowlCounts,
          dayBowlCustomMap: newDayBowlCustomMap,
        };
      });
    } else {
      // Scenario C (daily): hard cap at 7 days
      if (scenario === 'C' && !currentPlan) return;
      setState(s => ({ ...s, selectedDays: [...s.selectedDays, day] }));
    }
  }

  // Scenario C only
  function setDayBowl(day: string, bowlId: string) {
    setState(s => ({ ...s, dayBowlMap: { ...s.dayBowlMap, [day]: bowlId } }));
  }

  // Scenario A: per-day, per-bowl quantity adjustment
  function adjustDayBowlCount(day: string, bowlId: string, delta: number) {
    if (!currentPlan) return;
    if (delta > 0 && spreadTotal >= currentPlan.bowlsPerWeek) return;
    const current = state.dayBowlCounts[day]?.[bowlId] ?? 0;
    const next = Math.max(0, current + delta);
    setState(s => ({
      ...s,
      dayBowlCounts: {
        ...s.dayBowlCounts,
        [day]: { ...(s.dayBowlCounts[day] ?? {}), [bowlId]: next },
      },
    }));
  }

  // ─── Bulk bowl controls (Step 2B) ────────────────────────────────────────────

  function adjustBulkCount(bowlId: string, delta: number) {
    if (!currentPlan) return;
    const current = state.bulkBowlCounts[bowlId] ?? 0;
    const total = Object.values(state.bulkBowlCounts).reduce((s, c) => s + c, 0);

    if (delta > 0 && total >= currentPlan.bowlsPerWeek) return;
    const next = Math.max(0, current + delta);
    setState(s => ({ ...s, bulkBowlCounts: { ...s.bulkBowlCounts, [bowlId]: next } }));
  }

  // ─── Payment ─────────────────────────────────────────────────────────────────

  async function handlePayment() {
    if (!user || !currentPlan) return;
    setSubmitting(true);
    setError('');

    const razorpayKeyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;

    try {
      if (razorpayKeyId) {
        const res = await fetch('/api/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customer: { name: user.name, phone: user.phone, email: user.email },
            items: [{ bowl_name: currentPlan.name, quantity: 1, price: currentPlan.weeklyPrice }],
            total_amount_paise: currentPlan.weeklyPrice * 100,
          }),
        });

        if (!res.ok) throw new Error('Failed to create order.');
        const { razorpay_order_id } = await res.json();

        const options = {
          key: razorpayKeyId,
          amount: currentPlan.weeklyPrice * 100,
          currency: 'INR',
          name: 'Nutravoe',
          description: `${currentPlan.name} — Week 1`,
          order_id: razorpay_order_id,
          handler: (response: { razorpay_payment_id: string }) => {
            saveSubscription(response.razorpay_payment_id);
          },
          prefill: { name: user.name, contact: user.phone, email: user.email },
          theme: { color: '#7D9B76' },
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const win = window as any;
        if (!win.Razorpay) {
          const script = document.createElement('script');
          script.src = 'https://checkout.razorpay.com/v1/checkout.js';
          document.body.appendChild(script);
          await new Promise(r => (script.onload = r));
        }
        const rzp = new win.Razorpay(options);
        rzp.open();
      } else {
        // No Razorpay key — simulate success
        await saveSubscription('mock_' + Date.now());
      }
    } catch {
      setError('Something went wrong with payment. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function saveSubscription(paymentId: string) {
    if (!currentPlan || !user) return;
    const supabase = createClient();
    const scenario = getScenario();

    // Build day_configs for spread/daily scenarios
    const dayConfigs: DayBowlConfig[] = scenario === 'A'
      ? Object.entries(state.dayBowlCounts).flatMap(([day, bowlCounts]) =>
          Object.entries(bowlCounts)
            .filter(([, count]) => count > 0)
            .map(([bowlId, quantity]) => ({
              day: day as DayBowlConfig['day'],
              bowlId,
              bowlName: bowls.find(b => b._id === bowlId)?.name ?? '',
              quantity,
              customizations: state.dayBowlCustomMap[day]?.[bowlId] ?? [],
              customizationCost: calcCustomCost(
                state.dayBowlCustomMap[day]?.[bowlId] ?? [],
                bowls.find(b => b._id === bowlId)
              ),
            }))
        )
      : scenario === 'C'
      ? state.selectedDays.map(day => ({
          day,
          bowlId: state.dayBowlMap[day],
          bowlName: bowls.find(b => b._id === state.dayBowlMap[day])?.name ?? '',
          quantity: 1,
          customizations: state.dayCustomMap[day] ?? [],
          customizationCost: calcCustomCost(
            state.dayCustomMap[day] ?? [],
            bowls.find(b => b._id === state.dayBowlMap[day])
          ),
        }))
      : [];

    const startDate = new Date().toISOString();

    // Map DeliveryStyle to Supabase enum values
    const supabaseStyle: string = state.planId === 'daily'
      ? 'spread'
      : (state.deliveryStyle ?? 'spread');

    const { data: newSub, error: insertError } = await supabase
      .from('subscriptions')
      .insert({
        user_id: user.id,
        plan_id: state.planId,
        style: supabaseStyle,
        status: 'active',
        start_date: startDate,
        delivery_time_slot: scenario !== 'D' ? state.deliveryTimeSlot : null,
        bulk_bowls: scenario === 'B'
          ? Object.values(state.bulkBowlCounts).reduce((s, c) => s + c, 0)
          : null,
        bulk_delivery_date: scenario === 'B' ? state.bulkDeliveryDay : null,
        wallet_balance_rs: scenario === 'D' ? currentPlan.weeklyPrice : null,
        notes: paymentId ? `payment:${paymentId}` : null,
      })
      .select('id')
      .single();

    if (insertError || !newSub) {
      setError('Failed to save subscription. Please contact support.');
      return;
    }

    // Insert day configs
    if (dayConfigs.length > 0) {
      const configRows = dayConfigs.map(dc => ({
        subscription_id: newSub.id,
        day_of_week: dc.day.toLowerCase(),
        bowl_slug: dc.bowlId,
        quantity: dc.quantity,
      }));
      await supabase.from('subscription_day_configs').insert(configRows);
    }

    // Credit wallet immediately for flexible plans
    if (scenario === 'D') {
      await creditWallet(
        currentPlan.weeklyPrice * 100,
        `${currentPlan.name} — Week 1 wallet load`
      );
    }

    setSuccess(true);
  }

  // ─── Derived values ───────────────────────────────────────────────────────────

  const bulkTotal = Object.values(state.bulkBowlCounts).reduce((s, c) => s + c, 0);

  // Bowl being customised (for modal)
  const customizingDayBowl = customizingDay  // scenario C only
    ? bowls.find(b => b._id === state.dayBowlMap[customizingDay]) ?? null
    : null;
  const customizingBulkBowl = customizingBulkBowlId
    ? bowls.find(b => b._id === customizingBulkBowlId) ?? null
    : null;

  // ─── Active subscription blocker ──────────────────────────────────────────────

  if (hasActiveSub && !success) {
    return (
      <div className="max-w-lg mx-auto">
        <div className="bg-white rounded-2xl border border-black/8 p-10 text-center shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
          <div className="w-16 h-16 rounded-full bg-terracotta/10 flex items-center justify-center mx-auto mb-6">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#C4714A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </div>
          <h2 className="font-display text-2xl font-medium text-ink mb-3">You already have an active subscription</h2>
          <p className="font-body text-[14px] text-stone leading-relaxed mb-8">
            Only one active subscription is allowed at a time. To switch plans, please cancel your current subscription first and then subscribe again.
          </p>
          <Link
            href="/subscriptions"
            className="inline-flex items-center gap-2 bg-ink hover:bg-ink/90 text-white font-body text-[13px] font-bold tracking-wide px-6 py-3 rounded-md transition-colors shadow-sm"
          >
            Manage My Subscription
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
          </Link>
        </div>
      </div>
    );
  }

  // ─── Success screen ───────────────────────────────────────────────────────────

  if (success && currentPlan) {
    return (
      <div className="max-w-lg mx-auto">
        <div className="bg-white rounded-2xl border border-sage/20 p-10 text-center shadow-[0_8px_30px_rgb(0,0,0,0.04)] animate-in zoom-in-95 duration-400">
          <div className="w-16 h-16 rounded-full bg-sage/10 flex items-center justify-center mx-auto mb-6">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#7D9B76" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h2 className="font-display text-3xl font-medium text-ink mb-3">You're subscribed!</h2>
          <p className="font-body text-[14px] text-stone leading-relaxed mb-2">
            Your <strong className="text-ink">{currentPlan.name}</strong> plan is now active.
          </p>
          <p className="font-body text-[13px] text-stone mb-8">
            First delivery arrives tomorrow morning.
          </p>
          <Link
            href="/subscriptions"
            className="bg-sage hover:bg-sage-dark text-white font-body text-sm font-bold tracking-wide px-8 py-3 rounded-md transition-colors shadow-sm inline-block"
          >
            View My Subscription
          </Link>
        </div>
      </div>
    );
  }

  // ─── Step indicator ───────────────────────────────────────────────────────────

  const StepIndicator = () => (
    <div className="flex items-center justify-center gap-3 mb-10">
      {[1, 2, 3].map(n => (
        <div key={n} className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-body text-[13px] font-bold transition-all duration-300 ${
            state.step === n
              ? 'bg-terracotta text-white shadow-md'
              : state.step > n
              ? 'bg-sage text-white'
              : 'border-2 border-black/15 text-stone'
          }`}>
            {state.step > n
              ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
              : n}
          </div>
          {n < 3 && (
            <div className={`w-12 h-px transition-colors duration-300 ${state.step > n ? 'bg-sage' : 'bg-black/10'}`} />
          )}
        </div>
      ))}
    </div>
  );

  // ─── Step 1 — Choose Plan ─────────────────────────────────────────────────────

  if (state.step === 1) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="font-display text-4xl font-medium text-ink mb-3">Subscribe & Save</h1>
          <p className="font-body text-[15px] text-stone">
            Fresh oatmeal bowls delivered to your door, every week.
          </p>
        </div>
        <StepIndicator />

        <h2 className="font-display text-xl font-medium text-ink mb-6 text-center">Choose your plan</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          {PLANS.map(plan => (
            <PlanCard
              key={plan.id}
              plan={plan}
              selected={state.planId === plan.id}
              deliveryStyle={state.planId === plan.id ? state.deliveryStyle : null}
              bulkDeliveryDay={state.planId === plan.id ? state.bulkDeliveryDay : 'next-day'}
              onSelect={() => setState(s => ({
                ...s,
                planId: plan.id,
                deliveryStyle: plan.id === 'daily' ? 'spread' : null,
                bulkDeliveryDay: 'next-day',
                selectedDays: [],
                dayBowlMap: {},
                dayCustomMap: {},
                dayBowlCounts: {},
                dayBowlCustomMap: {},
                bulkBowlCounts: {},
                bulkCustomMap: {},
              }))}
              onDeliveryStyle={(style) => setState(s => ({ ...s, deliveryStyle: style }))}
              onBulkDeliveryDay={(day) => setState(s => ({ ...s, bulkDeliveryDay: day }))}
            />
          ))}
        </div>

        <div className="flex justify-end">
          <button
            disabled={!canProceedStep1}
            onClick={goToStep2}
            className="bg-terracotta hover:bg-[#D55F43] disabled:bg-black/10 disabled:text-stone text-white font-body text-sm font-bold tracking-wide px-8 py-3.5 rounded-md transition-colors shadow-sm"
          >
            Next: Configure Delivery →
          </button>
        </div>
      </div>
    );
  }

  // ─── Step 2 — Configure Delivery ─────────────────────────────────────────────

  if (state.step === 2 && currentPlan) {
    const scenario = getScenario();

    return (
      <>
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="font-display text-4xl font-medium text-ink mb-3">Subscribe & Save</h1>
            <p className="font-body text-[14px] text-stone">
              {currentPlan.name} — {formatCurrency(currentPlan.weeklyPrice)}/week
            </p>
          </div>
          <StepIndicator />

          <h2 className="font-display text-xl font-medium text-ink mb-6 text-center">
            {scenario === 'B' ? 'Choose your bowls'
              : scenario === 'D' ? 'How your wallet works'
              : 'Assign bowls to delivery days'}
          </h2>

          {/* Scenario A — Spread (multi-bowl per day) */}
          {scenario === 'A' && (
            <div className="space-y-6">
              {/* Day pills */}
              <div className="bg-white rounded-xl border border-black/8 p-5">
                <div className="flex items-center justify-between mb-3">
                  <p className="font-body text-[11px] font-bold uppercase tracking-wider text-stone">
                    Select delivery days
                  </p>
                  <span className={`font-body text-[12px] font-bold ${spreadTotal === currentPlan.bowlsPerWeek ? 'text-sage' : 'text-ink'}`}>
                    {spreadTotal} / {currentPlan.bowlsPerWeek} bowls assigned
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {DAYS.map(day => {
                    const isSelected = state.selectedDays.includes(day);
                    const dayTotal = Object.values(state.dayBowlCounts[day] ?? {}).reduce((s, c) => s + c, 0);
                    return (
                      <button
                        key={day}
                        onClick={() => toggleDay(day)}
                        className={`px-4 py-2 rounded-full font-body text-[13px] font-medium transition-all duration-200 border ${
                          isSelected
                            ? 'bg-sage text-white border-sage'
                            : 'border-black/15 text-stone hover:border-sage/60'
                        }`}
                      >
                        {day}{dayTotal > 0 && ` (${dayTotal})`}
                      </button>
                    );
                  })}
                </div>
                <p className="font-body text-[11px] text-stone mt-3">
                  Select any days, then assign bowls to each. Total must equal {currentPlan.bowlsPerWeek}.
                </p>
              </div>

              {/* Per-day bowl pickers */}
              {state.selectedDays.length > 0 && (
                <div className="space-y-4">
                  {DAYS.filter(d => state.selectedDays.includes(d)).map(day => {
                    const dayCounts = state.dayBowlCounts[day] ?? {};
                    const dayTotal = Object.values(dayCounts).reduce((s, c) => s + c, 0);

                    return (
                      <div key={day} className="bg-white rounded-xl border border-black/8 p-4">
                        {/* Day header */}
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-2">
                            <span className="w-10 h-10 rounded-full bg-sage/10 text-sage font-body text-[12px] font-bold flex items-center justify-center shrink-0">
                              {day}
                            </span>
                            <p className="font-body text-[13px] font-medium text-ink">
                              {dayTotal === 0
                                ? <span className="text-stone italic">No bowls yet</span>
                                : `${dayTotal} bowl${dayTotal > 1 ? 's' : ''}`}
                            </p>
                          </div>
                          <button
                            onClick={() => toggleDay(day)}
                            className="font-body text-[11px] text-stone hover:text-terracotta transition-colors"
                          >
                            Remove day
                          </button>
                        </div>

                        {/* Bowl rows */}
                        <div className="space-y-2">
                          {bowls.map(bowl => {
                            const count = dayCounts[bowl._id] ?? 0;
                            const customs = state.dayBowlCustomMap[day]?.[bowl._id] ?? [];
                            const hasCustoms = customs.some(c => c.option !== 'default');

                            return (
                              <div key={bowl._id} className={`flex items-center gap-3 p-2.5 rounded-lg border transition-all ${count > 0 ? 'border-sage/40 bg-sage/5' : 'border-black/6 bg-[#F9F8F6]'}`}>
                                <div className="w-9 h-9 rounded-md overflow-hidden bg-white relative shrink-0">
                                  <Image src={bowl.image} alt={bowl.name} fill className="object-contain" sizes="36px" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="font-body text-[12px] font-medium text-ink truncate">{bowl.name}</p>
                                  {count > 0 && (
                                    <button
                                      onClick={() => setCustomizingSpreadKey({ day, bowlId: bowl._id })}
                                      className="font-body text-[10px] text-sage font-semibold hover:underline flex items-center gap-0.5 cursor-pointer mt-0.5"
                                    >
                                      {hasCustoms ? 'Edit customisation' : 'Customise'} →
                                      {hasCustoms && <span className="w-1.5 h-1.5 rounded-full bg-terracotta ml-1" />}
                                    </button>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <button
                                    onClick={() => adjustDayBowlCount(day, bowl._id, -1)}
                                    disabled={count === 0}
                                    className="w-7 h-7 rounded-full border border-black/10 flex items-center justify-center text-stone hover:text-ink hover:border-black/20 disabled:opacity-30 transition-all text-sm"
                                  >
                                    −
                                  </button>
                                  <span className="font-body text-[13px] font-bold text-ink w-4 text-center">{count}</span>
                                  <button
                                    onClick={() => adjustDayBowlCount(day, bowl._id, 1)}
                                    disabled={spreadTotal >= currentPlan.bowlsPerWeek}
                                    className="w-7 h-7 rounded-full border border-black/10 flex items-center justify-center text-stone hover:text-ink hover:border-black/20 disabled:opacity-30 transition-all text-sm"
                                  >
                                    +
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {state.selectedDays.length === 0 && (
                <p className="font-body text-[13px] text-stone text-center py-4">
                  Select days above to assign your bowls.
                </p>
              )}
            </div>
          )}

          {/* Scenario C — Daily (one bowl per day, all 7 days) */}
          {scenario === 'C' && (
            <div className="space-y-6">
              <div className="bg-white rounded-xl border border-black/8 p-5">
                <div className="flex items-center justify-between mb-3">
                  <p className="font-body text-[11px] font-bold uppercase tracking-wider text-stone">
                    Delivery Days (Mon–Sun)
                  </p>
                  <span className="font-body text-[12px] text-stone">
                    {state.selectedDays.length} / {currentPlan.bowlsPerWeek} selected
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {DAYS.map(day => (
                    <button
                      key={day}
                      disabled
                      className="px-4 py-2 rounded-full font-body text-[13px] font-medium border bg-sage/20 text-sage border-sage/30 cursor-default"
                    >
                      {day}
                    </button>
                  ))}
                </div>
              </div>

              {state.selectedDays.length > 0 && (
                <div className="space-y-4">
                  {DAYS.filter(d => state.selectedDays.includes(d)).map(day => {
                    const selectedBowl = bowls.find(b => b._id === state.dayBowlMap[day]);
                    const dayCustoms = state.dayCustomMap[day] ?? [];
                    const hasCustoms = dayCustoms.some(c => c.option !== 'default');
                    return (
                      <div key={day} className="bg-white rounded-xl border border-black/8 p-4">
                        <div className="flex items-center gap-2 mb-3">
                          <span className="w-10 h-10 rounded-full bg-sage/10 text-sage font-body text-[12px] font-bold flex items-center justify-center shrink-0">
                            {day}
                          </span>
                          <p className="font-body text-[13px] font-medium text-ink">
                            {selectedBowl ? selectedBowl.name : <span className="text-stone italic">Select a bowl</span>}
                          </p>
                          {selectedBowl && (
                            <div className="ml-auto flex items-center gap-2">
                              <button
                                onClick={() => setCustomizingDay(day)}
                                className="font-body text-[11px] text-sage cursor-pointer font-semibold hover:underline flex items-center gap-1"
                              >
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                                {hasCustoms ? 'Edit' : 'Customise'}
                              </button>
                              {hasCustoms && <span className="w-2 h-2 rounded-full bg-terracotta" />}
                            </div>
                          )}
                        </div>
                        <BowlPicker
                          bowls={bowls}
                          selectedBowlId={state.dayBowlMap[day] ?? ''}
                          onSelect={(bowlId) => setDayBowl(day, bowlId)}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Scenario B — Bulk */}
          {scenario === 'B' && (
            <div className="bg-white rounded-xl border border-black/8 p-6">
              <div className="flex items-center justify-between mb-1">
                <p className="font-body text-[11px] font-bold uppercase tracking-wider text-stone">
                  Pick your bowls
                </p>
                <span className={`font-body text-[13px] font-bold ${bulkTotal === currentPlan.bowlsPerWeek ? 'text-sage' : 'text-ink'}`}>
                  {bulkTotal} / {currentPlan.bowlsPerWeek}
                </span>
              </div>
              <p className="font-body text-[12px] text-stone mb-5">
                All {currentPlan.bowlsPerWeek} bowls delivered together{' '}
                {state.bulkDeliveryDay === 'next-day'
                  ? 'the next day'
                  : `every ${state.bulkDeliveryDay}`}
                , then every week.
              </p>

              <div className="space-y-3">
                {bowls.map(bowl => {
                  const count = state.bulkBowlCounts[bowl._id] ?? 0;
                  const bulkCustoms = state.bulkCustomMap[bowl._id] ?? [];
                  const hasCustoms = bulkCustoms.some(c => c.option !== 'default');

                  return (
                    <div key={bowl._id} className={`flex items-center gap-4 p-3 rounded-xl border transition-all ${count > 0 ? 'border-sage/40 bg-sage/5' : 'border-black/8 bg-[#F9F8F6]'}`}>
                      <div className="w-12 h-12 rounded-lg overflow-hidden bg-white relative shrink-0">
                        <Image
                          src={bowl.image}
                          alt={bowl.name}
                          fill
                          className="object-contain"
                          sizes="48px"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-body text-[13px] font-medium text-ink truncate">{bowl.name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <p className="font-body text-[11px] text-stone">{bowl.tagline}</p>
                          {count > 0 && (
                            <button
                              onClick={() => setCustomizingBulkBowlId(bowl._id)}
                              className="font-body text-[11px] text-sage font-semibold hover:underline flex items-center gap-1 cursor-pointer"
                            >
                              {hasCustoms ? 'Edit' : 'Customise'} →
                            </button>
                          )}
                          {hasCustoms && <span className="w-1.5 h-1.5 rounded-full bg-terracotta" />}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => adjustBulkCount(bowl._id, -1)}
                          disabled={count === 0}
                          className="w-8 h-8 rounded-full border border-black/10 flex items-center justify-center text-stone hover:text-ink hover:border-black/20 disabled:opacity-30 transition-all"
                        >
                          −
                        </button>
                        <span className="font-body text-[14px] font-bold text-ink w-5 text-center">
                          {count}
                        </span>
                        <button
                          onClick={() => adjustBulkCount(bowl._id, 1)}
                          disabled={bulkTotal >= currentPlan.bowlsPerWeek}
                          className="w-8 h-8 rounded-full border border-black/10 flex items-center justify-center text-stone hover:text-ink hover:border-black/20 disabled:opacity-30 transition-all"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Scenario D — Flexible / Wallet */}
          {scenario === 'D' && (
            <div className="space-y-4">
              {/* Wallet balance card */}
              <div className="bg-white rounded-xl border border-black/8 p-6">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-10 h-10 rounded-full bg-terracotta/10 flex items-center justify-center shrink-0">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#C4714A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="5" width="20" height="14" rx="2"/>
                      <path d="M16 12h.01"/>
                      <path d="M2 10h20"/>
                    </svg>
                  </div>
                  <div>
                    <p className="font-body text-[13px] font-semibold text-ink">Nutravoe Wallet</p>
                    <p className="font-body text-[11px] text-stone">Loaded on payment, used as you go</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-3 p-3 bg-sage/5 rounded-lg border border-sage/20">
                    <div className="w-6 h-6 rounded-full bg-sage/20 flex items-center justify-center shrink-0 text-sage font-bold text-[12px]">1</div>
                    <p className="font-body text-[13px] text-ink">
                      Pay <strong>₹{currentPlan.weeklyPrice.toLocaleString('en-IN')}</strong> now — this is added to your Nutravoe wallet instantly.
                    </p>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-sage/5 rounded-lg border border-sage/20">
                    <div className="w-6 h-6 rounded-full bg-sage/20 flex items-center justify-center shrink-0 text-sage font-bold text-[12px]">2</div>
                    <p className="font-body text-[13px] text-ink">
                      Schedule any bowl, any day through the week — each delivery costs <strong>₹{currentPlan.perBowl}</strong> and is deducted from your wallet.
                    </p>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-sage/5 rounded-lg border border-sage/20">
                    <div className="w-6 h-6 rounded-full bg-sage/20 flex items-center justify-center shrink-0 text-sage font-bold text-[12px]">3</div>
                    <p className="font-body text-[13px] text-ink">
                      Your wallet refills automatically every week as long as your subscription is active.
                    </p>
                  </div>
                </div>
              </div>

              {/* Customization warning */}
              <div className="flex items-start gap-3 p-4 bg-terracotta/5 rounded-xl border border-terracotta/20">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#C4714A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <div>
                  <p className="font-body text-[13px] font-semibold text-terracotta mb-1">Customisations cost extra</p>
                  <p className="font-body text-[12px] text-terracotta/80 leading-relaxed">
                    If you add ingredient extras when scheduling a bowl, the additional charge will be deducted from your wallet automatically at the time of ordering. You'll always see the exact amount before confirming.
                  </p>
                </div>
              </div>

              {/* Wallet balance summary */}
              <div className="bg-white rounded-xl border border-black/8 p-4 flex items-center justify-between">
                <div>
                  <p className="font-body text-[11px] font-bold uppercase tracking-wider text-stone">Wallet balance after payment</p>
                  <p className="font-body text-[12px] text-stone mt-0.5">{currentPlan.bowlsPerWeek} bowls × ₹{currentPlan.perBowl} each</p>
                </div>
                <p className="font-display text-2xl font-medium text-sage-dark">
                  ₹{currentPlan.weeklyPrice.toLocaleString('en-IN')}
                </p>
              </div>
            </div>
          )}

          {/* Time slot picker — shown for all non-flexible scenarios */}
          {scenario !== 'D' && (
            <div className="bg-white rounded-xl border border-black/8 p-5 mt-6">
              <div className="flex items-center gap-2 mb-3">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#7D9B76" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                <p className="font-body text-[11px] font-bold uppercase tracking-wider text-stone">Preferred delivery time</p>
              </div>
              <p className="font-body text-[12px] text-stone mb-3">All deliveries happen between 7:00 AM and 10:00 AM. Choose your preferred hour.</p>
              <div className="flex flex-wrap gap-2">
                {TIME_SLOTS.map(slot => (
                  <button
                    key={slot}
                    onClick={() => setState(s => ({ ...s, deliveryTimeSlot: slot }))}
                    className={`px-4 py-2.5 rounded-xl border font-body text-[13px] font-medium transition-all ${
                      state.deliveryTimeSlot === slot
                        ? 'border-sage bg-sage/10 text-sage-dark font-bold'
                        : 'border-black/15 text-stone hover:border-sage/50'
                    }`}
                  >
                    {slot}
                  </button>
                ))}
              </div>
              {!state.deliveryTimeSlot && (
                <p className="font-body text-[11px] text-terracotta mt-2">Please select a time slot to continue.</p>
              )}
            </div>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between mt-8">
            <button
              onClick={goBack}
              className="font-body text-[13px] font-bold text-stone hover:text-ink transition-colors flex items-center gap-1.5"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="m15 18-6-6 6-6" />
              </svg>
              Back
            </button>
            <button
              disabled={!canProceedStep2}
              onClick={goToStep3}
              className="bg-terracotta hover:bg-[#D55F43] disabled:bg-black/10 disabled:text-stone text-white font-body text-sm font-bold tracking-wide px-8 py-3.5 rounded-md transition-colors shadow-sm"
            >
              Next: Review & Pay →
            </button>
          </div>
        </div>

        {/* Customization modal — scenario C (daily, one bowl per day) */}
        {customizingDay && customizingDayBowl && (
          <CustomizationModal
            bowl={customizingDayBowl}
            initialCustomizations={state.dayCustomMap[customizingDay]}
            mode="subscription"
            onConfirm={(customizations) => {
              setState(s => ({
                ...s,
                dayCustomMap: { ...s.dayCustomMap, [customizingDay]: customizations },
              }));
              setCustomizingDay(null);
            }}
            onClose={() => setCustomizingDay(null)}
          />
        )}

        {/* Customization modal — scenario A (spread, per-day per-bowl) */}
        {customizingSpreadKey && (() => {
          const bowl = bowls.find(b => b._id === customizingSpreadKey.bowlId) ?? null;
          if (!bowl) return null;
          return (
            <CustomizationModal
              bowl={bowl}
              initialCustomizations={state.dayBowlCustomMap[customizingSpreadKey.day]?.[customizingSpreadKey.bowlId]}
              mode="subscription"
              onConfirm={(customizations) => {
                const { day, bowlId } = customizingSpreadKey;
                setState(s => ({
                  ...s,
                  dayBowlCustomMap: {
                    ...s.dayBowlCustomMap,
                    [day]: { ...(s.dayBowlCustomMap[day] ?? {}), [bowlId]: customizations },
                  },
                }));
                setCustomizingSpreadKey(null);
              }}
              onClose={() => setCustomizingSpreadKey(null)}
            />
          );
        })()}

        {/* Customization modal — bulk bowl */}
        {customizingBulkBowlId && customizingBulkBowl && (
          <CustomizationModal
            bowl={customizingBulkBowl}
            initialCustomizations={state.bulkCustomMap[customizingBulkBowlId]}
            mode="subscription"
            onConfirm={(customizations) => {
              setState(s => ({
                ...s,
                bulkCustomMap: { ...s.bulkCustomMap, [customizingBulkBowlId]: customizations },
              }));
              setCustomizingBulkBowlId(null);
            }}
            onClose={() => setCustomizingBulkBowlId(null)}
          />
        )}
      </>
    );
  }

  // ─── Step 3 — Review & Pay ────────────────────────────────────────────────────

  if (state.step === 3 && currentPlan) {
    const scenario = getScenario();

    // Build human-readable summary
    const deliverySummaryText = (() => {
      if (scenario === 'D') return `₹${currentPlan.weeklyPrice.toLocaleString('en-IN')} loaded to your wallet — schedule freely`;

      if (scenario === 'B') {
        const parts = Object.entries(state.bulkBowlCounts)
          .filter(([, c]) => c > 0)
          .map(([id, c]) => `${c}× ${bowls.find(b => b._id === id)?.name ?? id}`);
        return parts.join(', ');
      }
      if (scenario === 'A') {
        return DAYS.filter(d => state.selectedDays.includes(d))
          .map(d => {
            const parts = Object.entries(state.dayBowlCounts[d] ?? {})
              .filter(([, c]) => c > 0)
              .map(([id, c]) => `${c}× ${bowls.find(b => b._id === id)?.name ?? id}`);
            return parts.length > 0 ? `${d}: ${parts.join(' + ')}` : null;
          })
          .filter(Boolean)
          .join(' · ');
      }
      return state.selectedDays
        .map(d => `${d}: ${bowls.find(b => b._id === state.dayBowlMap[d])?.name ?? ''}`)
        .join(' · ');
    })();

    return (
      <div className="max-w-lg mx-auto">
        <div className="text-center mb-8">
          <h1 className="font-display text-4xl font-medium text-ink mb-3">Subscribe & Save</h1>
        </div>
        <StepIndicator />
        <h2 className="font-display text-xl font-medium text-ink mb-6 text-center">Review & Pay</h2>

        {/* Auth gate */}
        {!user && (
          <div className="bg-white rounded-xl border border-terracotta/20 p-8 text-center mb-6">
            <div className="w-12 h-12 rounded-full bg-terracotta/10 flex items-center justify-center mx-auto mb-4">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#C4714A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </div>
            <h3 className="font-display text-xl font-medium text-ink mb-2">Sign in to subscribe</h3>
            <p className="font-body text-[13px] text-stone mb-5">
              You need an account to manage your subscription and delivery.
            </p>
            <Link
              href="/signin?redirect=/subscribe"
              className="bg-terracotta hover:bg-[#D55F43] text-white font-body text-sm font-bold tracking-wide px-8 py-3 rounded-md transition-colors shadow-sm inline-block"
            >
              Sign In
            </Link>
          </div>
        )}

        {user && (
          <>
            {/* Address block */}
            <div className={`rounded-xl border p-4 mb-4 ${deliveryAddress ? 'bg-white border-black/8' : 'bg-terracotta/5 border-terracotta/20'}`}>
              <p className="font-body text-[11px] font-bold uppercase tracking-wider text-stone mb-2">
                Delivery Address
              </p>
              {deliveryAddress ? (
                <p className="font-body text-[14px] text-ink">{deliveryAddress}</p>
              ) : (
                <div className="flex items-center gap-2">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#C4714A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  <p className="font-body text-[13px] text-terracotta flex-1">
                    No address on file —{' '}
                    <Link href="/profile" className="font-bold underline hover:no-underline">
                      add one in your profile
                    </Link>
                  </p>
                </div>
              )}
            </div>

            {/* Order summary */}
            <div className="bg-white rounded-xl border border-black/8 p-5 mb-6">
              <p className="font-body text-[11px] font-bold uppercase tracking-wider text-stone mb-4">
                Order Summary
              </p>

              <div className="space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <span className="font-body text-[13px] text-stone">Plan</span>
                  <span className="font-body text-[13px] font-medium text-ink text-right">{currentPlan.name}</span>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <span className="font-body text-[13px] text-stone">Delivery</span>
                  <span className="font-body text-[12px] text-stone text-right max-w-[220px]">{deliverySummaryText}</span>
                </div>
                {scenario === 'A' && (
                  <div className="flex items-start justify-between gap-4">
                    <span className="font-body text-[13px] text-stone">Schedule</span>
                    <span className="font-body text-[13px] text-ink text-right">
                      {state.selectedDays.join(', ')}
                    </span>
                  </div>
                )}
                {scenario === 'B' && (
                  <div className="flex items-start justify-between gap-4">
                    <span className="font-body text-[13px] text-stone">Delivery day</span>
                    <span className="font-body text-[13px] text-ink text-right">
                      {state.bulkDeliveryDay === 'next-day' ? 'Next day (weekly)' : `Every ${state.bulkDeliveryDay}`}
                    </span>
                  </div>
                )}
              </div>

              <div className="border-t border-black/5 mt-4 pt-4 flex items-center justify-between">
                <span className="font-body text-sm font-bold uppercase tracking-wider text-ink/70">
                  Week 1
                </span>
                <span className="font-display text-2xl font-medium text-sage-dark">
                  {formatCurrency(currentPlan.weeklyPrice)}
                </span>
              </div>
            </div>

            {scenario === 'D' && (
              <div className="flex items-start gap-3 p-4 bg-terracotta/5 rounded-xl border border-terracotta/20 mb-4">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#C4714A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <p className="font-body text-[12px] text-terracotta leading-relaxed">
                  <strong>Customisations are charged extra.</strong> When scheduling a bowl with ingredient extras, the additional cost will be deducted from your wallet automatically. You'll see the exact amount before confirming each order.
                </p>
              </div>
            )}

            {error && (
              <div className="mb-4 p-4 bg-terracotta/5 border border-terracotta/20 rounded-md">
                <p className="font-body text-[13px] font-medium text-terracotta">{error}</p>
              </div>
            )}

            <button
              onClick={handlePayment}
              disabled={submitting || !deliveryAddress}
              className="w-full bg-terracotta hover:bg-[#D55F43] disabled:bg-black/10 disabled:text-stone text-white font-body text-sm font-bold tracking-wide py-4 rounded-md transition-colors shadow-sm"
            >
              {submitting
                ? 'Connecting to secure gateway...'
                : `Subscribe & Pay ${formatCurrency(currentPlan.weeklyPrice)}`}
            </button>
            <p className="font-body text-[11px] text-stone text-center mt-3">
              Recurring {formatCurrency(currentPlan.weeklyPrice)}/week. Cancel anytime.
            </p>
          </>
        )}

        <div className="mt-6">
          <button
            onClick={goBack}
            className="font-body text-[13px] font-bold text-stone hover:text-ink transition-colors flex items-center gap-1.5"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="m15 18-6-6 6-6" />
            </svg>
            Back
          </button>
        </div>
      </div>
    );
  }

  return null;
}
