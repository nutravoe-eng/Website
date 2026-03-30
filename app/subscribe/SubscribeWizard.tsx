'use client';

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import type { Bowl, PlanId, DeliveryStyle, Subscription, IngredientCustomization } from "@/types";
import { formatCurrency } from "@/lib/utils";
import PlanCard, { PLANS } from "./PlanCard";
import BowlPicker from "./BowlPicker";
import CustomizationModal from "@/components/CustomizationModal";

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
type Day = typeof DAYS[number];

interface WizardState {
  step: 1 | 2 | 3;
  planId: PlanId | null;
  deliveryStyle: DeliveryStyle | null;
  bulkDeliveryDay: string;
  selectedDays: Day[];
  dayBowlMap: Record<string, string>;
  bulkBowlCounts: Record<string, number>;
  dayCustomMap: Record<string, IngredientCustomization[]>;
  bulkCustomMap: Record<string, IngredientCustomization[]>;
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
    bulkBowlCounts: {},
    dayCustomMap: {},
    bulkCustomMap: {},
  });

  const [user, setUser] = useState<{ name: string; phone: string; email: string } | null>(null);
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // Customization modal triggers
  const [customizingDay, setCustomizingDay] = useState<string | null>(null);
  const [customizingBulkBowlId, setCustomizingBulkBowlId] = useState<string | null>(null);

  useEffect(() => {
    const storedUser = localStorage.getItem('nutravoe_currentUser');
    if (storedUser) setUser(JSON.parse(storedUser));

    const storedAddresses = localStorage.getItem('nutravoe_addresses');
    if (storedAddresses) {
      const addresses: { id: string; tag: string; line1: string; line2: string; pincode: string; isDefault: boolean }[] =
        JSON.parse(storedAddresses);
      const def = addresses.find(a => a.isDefault) ?? addresses[0];
      if (def) {
        setDeliveryAddress(`${def.line1}, ${def.line2}, Karnataka ${def.pincode}`);
      }
    }
  }, []);

  const currentPlan = PLANS.find(p => p.id === state.planId);

  function getScenario(): 'A' | 'B' | 'C' {
    if (state.planId === 'daily') return 'C';
    if (state.deliveryStyle === 'bulk') return 'B';
    return 'A';
  }

  // ─── Validation ─────────────────────────────────────────────────────────────

  const canProceedStep1 =
    state.planId !== null &&
    (state.planId === 'daily' || state.deliveryStyle !== null);

  const canProceedStep2 = (() => {
    if (!currentPlan) return false;
    const scenario = getScenario();

    if (scenario === 'A' || scenario === 'C') {
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

  // ─── Day toggle (Step 2A) ────────────────────────────────────────────────────

  function toggleDay(day: Day) {
    if (!currentPlan) return;
    const isSelected = state.selectedDays.includes(day);

    if (isSelected) {
      setState(s => ({
        ...s,
        selectedDays: s.selectedDays.filter(d => d !== day),
        dayBowlMap: { ...s.dayBowlMap, [day]: '' },
      }));
    } else {
      if (state.selectedDays.length >= currentPlan.bowlsPerWeek) return;
      setState(s => ({ ...s, selectedDays: [...s.selectedDays, day] }));
    }
  }

  function setDayBowl(day: string, bowlId: string) {
    setState(s => ({ ...s, dayBowlMap: { ...s.dayBowlMap, [day]: bowlId } }));
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
        saveSubscription('mock_' + Date.now());
      }
    } catch {
      setError('Something went wrong with payment. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  function saveSubscription(paymentId: string) {
    if (!currentPlan || !user) return;
    const scenario = getScenario();

    const subscription: Subscription = {
      id: 'SUB' + Math.floor(Math.random() * 1_000_000),
      planId: state.planId!,
      deliveryStyle: state.planId === 'daily' ? 'spread' : state.deliveryStyle!,
      bulkDeliveryDay: scenario === 'B' ? state.bulkDeliveryDay : undefined,
      dayConfigs: scenario !== 'B'
        ? state.selectedDays.map(day => ({
            day,
            bowlId: state.dayBowlMap[day],
            bowlName: bowls.find(b => b._id === state.dayBowlMap[day])?.name ?? '',
            customizations: state.dayCustomMap[day] ?? [],
            customizationCost: calcCustomCost(
              state.dayCustomMap[day] ?? [],
              bowls.find(b => b._id === state.dayBowlMap[day])
            ),
          }))
        : [],
      bulkBowls: scenario === 'B'
        ? Object.entries(state.bulkBowlCounts)
            .filter(([, count]) => count > 0)
            .map(([bowlId, quantity]) => ({
              bowlId,
              bowlName: bowls.find(b => b._id === bowlId)?.name ?? '',
              quantity,
              customizations: state.bulkCustomMap[bowlId] ?? [],
              customizationCost: calcCustomCost(
                state.bulkCustomMap[bowlId] ?? [],
                bowls.find(b => b._id === bowlId)
              ),
            }))
        : undefined,
      weeklyPrice: currentPlan.weeklyPrice,
      deliveryAddress: deliveryAddress,
      createdAt: new Date().toISOString(),
      status: 'active',
      nextDelivery: new Date(Date.now() + 86_400_000).toISOString(),
    };

    const stored = localStorage.getItem('nutravoe_subscriptions');
    const existing: Subscription[] = stored ? JSON.parse(stored) : [];
    localStorage.setItem('nutravoe_subscriptions', JSON.stringify([subscription, ...existing]));
    setSuccess(true);
  }

  // ─── Derived values ───────────────────────────────────────────────────────────

  const bulkTotal = Object.values(state.bulkBowlCounts).reduce((s, c) => s + c, 0);

  // Bowl being customised (for modal)
  const customizingDayBowl = customizingDay
    ? bowls.find(b => b._id === state.dayBowlMap[customizingDay]) ?? null
    : null;
  const customizingBulkBowl = customizingBulkBowlId
    ? bowls.find(b => b._id === customizingBulkBowlId) ?? null
    : null;

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
                bulkBowlCounts: {},
                dayCustomMap: {},
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
            {scenario === 'B' ? 'Choose your bowls' : 'Assign bowls to delivery days'}
          </h2>

          {/* Scenario A & C — Spread or Daily */}
          {(scenario === 'A' || scenario === 'C') && (
            <div className="space-y-6">
              {/* Day pills */}
              <div className="bg-white rounded-xl border border-black/8 p-5">
                <div className="flex items-center justify-between mb-3">
                  <p className="font-body text-[11px] font-bold uppercase tracking-wider text-stone">
                    {scenario === 'C' ? 'Delivery Days (Mon–Sun)' : 'Select delivery days'}
                  </p>
                  <span className="font-body text-[12px] text-stone">
                    {state.selectedDays.length} / {currentPlan.bowlsPerWeek} selected
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {DAYS.map(day => {
                    const isSelected = state.selectedDays.includes(day);
                    const isDaily = scenario === 'C';
                    return (
                      <button
                        key={day}
                        disabled={isDaily || (!isSelected && state.selectedDays.length >= currentPlan.bowlsPerWeek)}
                        onClick={() => !isDaily && toggleDay(day)}
                        className={`px-4 py-2 rounded-full font-body text-[13px] font-medium transition-all duration-200 border ${
                          isSelected
                            ? 'bg-sage text-white border-sage'
                            : isDaily
                            ? 'bg-sage/20 text-sage border-sage/30 cursor-default'
                            : 'border-black/15 text-stone hover:border-sage/60 disabled:opacity-40 disabled:cursor-not-allowed'
                        }`}
                      >
                        {day}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Bowl selectors per day */}
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
                            {selectedBowl
                              ? selectedBowl.name
                              : <span className="text-stone italic">Select a bowl</span>}
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
                              {hasCustoms && (
                                <span className="w-2 h-2 rounded-full bg-terracotta" />
                              )}
                              <div className="w-5 h-5 rounded-full bg-sage/15 flex items-center justify-center">
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#7D9B76" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                              </div>
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

              {scenario === 'A' && state.selectedDays.length === 0 && (
                <p className="font-body text-[13px] text-stone text-center py-4">
                  Select days above to assign your bowls.
                </p>
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

        {/* Customization modal — day */}
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
    const deliverySummary = (() => {
      if (scenario === 'B') {
        const parts = Object.entries(state.bulkBowlCounts)
          .filter(([, c]) => c > 0)
          .map(([id, c]) => `${c}× ${bowls.find(b => b._id === id)?.name ?? id}`);
        return parts.join(', ');
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
                  <span className="font-body text-[12px] text-stone text-right max-w-[220px]">{deliverySummary}</span>
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
