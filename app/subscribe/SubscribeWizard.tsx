'use client';

import { useState, useEffect, useRef } from "react";

const WIZARD_SESSION_KEY = "nutravoe_subscribe_wizard";
import Link from "next/link";
import Image from "next/image";
import type {
  Bowl,
  BowlPresetOptions,
  PlanId,
  DeliveryStyle,
  DayBowlConfig,
  IngredientCustomization,
  SubscriptionPlan,
} from "@/types";
import { buildSubscriptionWhatsAppMessage, formatCurrency, getWhatsAppUrl } from "@/lib/utils";
import PlanCard, { STUB_PLANS } from "./PlanCard";
import type { PlanConfig } from "./PlanCard";
import BowlPicker from "./BowlPicker";
import CustomizationModal from "@/components/CustomizationModal";
import { createClient } from "@/lib/supabase/client";
import { resolveDeliveryCoords } from "@/lib/geocodeCache";
import { FREE_ZONE_RADIUS_KM } from "@/lib/delivery";
import { getSubscriberBaseFromPlanConfig } from "@/lib/subscription-pricing";
import { DELIVERY_TIME_SLOTS } from "@/lib/delivery-slots";

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
type Day = typeof DAYS[number];

const TIME_SLOTS = DELIVERY_TIME_SLOTS;

export type TimeSlotMode = 'same' | 'different' | null;

interface WizardState {
  step: 1 | 2 | 3;
  planId: PlanId | null;
  deliveryStyle: DeliveryStyle | null;
  selectedDays: Day[];
  // Scenario C (daily) — one bowl per day
  dayBowlMap: Record<string, string>;
  dayCustomMap: Record<string, IngredientCustomization[]>;
  dayPresetMap: Record<string, BowlPresetOptions>;
  // Scenario A (spread) — multiple bowls + quantities per day
  dayBowlCounts: Record<string, Record<string, number>>;
  // Per-instance customizations: [day][bowlId][instanceIndex] = IngredientCustomization[]
  dayBowlCustomMap: Record<string, Record<string, IngredientCustomization[][]>>;
  // Per-instance preset options: [day][bowlId][instanceIndex] = BowlPresetOptions
  dayBowlPresetMap: Record<string, Record<string, BowlPresetOptions[]>>;
  // Shared
  timeSlotMode: TimeSlotMode;
  deliveryTimeSlot: string;     // used if same time
  dayTimeSlotMap: Record<string, string>; // used if different times
}

const DEFAULT_PRESET_OPTIONS: BowlPresetOptions = {
  baseChoice: "yogurt",
  oatsChoice: "roasted",
  noSugar: false,
};

interface Props {
  bowls: Bowl[];
  whatsappNumber: string;
  plans?: SubscriptionPlan[];
}

const INITIAL_WIZARD_STATE: WizardState = {
  step: 1,
  planId: null,
  deliveryStyle: null,
  selectedDays: [],
  dayBowlMap: {},
  dayCustomMap: {},
  dayPresetMap: {},
  dayBowlCounts: {},
  dayBowlCustomMap: {},
  dayBowlPresetMap: {},
  timeSlotMode: 'same',
  deliveryTimeSlot: '',
  dayTimeSlotMap: {},
};

function calcCustomCost(customizations: IngredientCustomization[], bowl?: Bowl | null): number {
  if (!bowl?.customizableIngredients) return 0;
  return customizations
    .filter(c => c.option === 'extra')
    .reduce((sum, c) => {
      const ing = bowl.customizableIngredients!.find(i => i.id === c.ingredientId);
      return sum + (ing?.extraCost ?? 0);
    }, 0);
}

function findBowlByIdentifier(bowls: Bowl[], identifier: string | undefined): Bowl | undefined {
  if (!identifier) return undefined;
  return bowls.find(
    (bowl) =>
      bowl.slug === identifier ||
      bowl._id === identifier ||
      `bowl-${bowl.slug}` === identifier,
  );
}

function encodePresetIntoCustomizations(
  customizations: IngredientCustomization[],
  preset: BowlPresetOptions,
): IngredientCustomization[] {
  const filtered = customizations.filter((c) => !c.ingredientId.startsWith("__preset_"));
  const presetEntries: IngredientCustomization[] = [
    {
      ingredientId: `__preset_base_${preset.baseChoice}`,
      option: "default",
    },
    {
      ingredientId: `__preset_oats_${preset.oatsChoice}`,
      option: "default",
    },
  ];
  if (preset.noSugar) {
    presetEntries.push({ ingredientId: "__preset_no_sugar", option: "default" });
  }
  return [...filtered, ...presetEntries];
}

export default function SubscribeWizard({ bowls, whatsappNumber, plans: sanityPlans }: Props) {
  const [state, setState] = useState<WizardState>(INITIAL_WIZARD_STATE);
  const step2TopRef = useRef<HTMLDivElement | null>(null);
  const spreadDaysRef = useRef<HTMLDivElement | null>(null);
  const flexibleIntroRef = useRef<HTMLDivElement | null>(null);
  const step3TopRef = useRef<HTMLDivElement | null>(null);

  function smoothScrollTo(element: HTMLElement | null | undefined) {
    if (!element) return;
    requestAnimationFrame(() => {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  // Persist wizard state so it survives the sign-in redirect
  const isFirstRender = useRef(true);
  const didHydrateSessionState = useRef(false);
  useEffect(() => {
    if (didHydrateSessionState.current) return;
    didHydrateSessionState.current = true;
    try {
      const raw = sessionStorage.getItem(WIZARD_SESSION_KEY);
      if (raw) {
        setState(JSON.parse(raw) as WizardState);
      }
    } catch {
      // ignore malformed session state
    }
  }, []);

  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    try { sessionStorage.setItem(WIZARD_SESSION_KEY, JSON.stringify(state)); } catch { /* ignore */ }
  }, [state]);

  const [user, setUser] = useState<{ name: string; phone: string; email: string; id: string } | null>(null);
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryLat, setDeliveryLat] = useState<number | undefined>(undefined);
  const [deliveryLng, setDeliveryLng] = useState<number | undefined>(undefined);
  const [deliveryPincode, setDeliveryPincode] = useState('');
  const [deliveryDistanceKm, setDeliveryDistanceKm] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [notes, setNotes] = useState('');
  const [success, setSuccess] = useState(false);
  const [pendingApproval, setPendingApproval] = useState(false);
  const [flexibleWhatsAppUrl, setFlexibleWhatsAppUrl] = useState<string | null>(null);
  const [hasActiveSub, setHasActiveSub] = useState(false);
  const [activeSubEndDate, setActiveSubEndDate] = useState<string | null>(null);
  const [isRenewalFlow, setIsRenewalFlow] = useState(false);

  // Convert Sanity plans to PlanConfig (global standard/premium pricing; delivery is separate)
  const plans: PlanConfig[] = sanityPlans
    ? sanityPlans.map(p => {
        const pricePerBowl = p.pricePerBowl ?? p.price_per_bowl ?? 0;
        return {
          id: p.slug as PlanId,
          name: p.name,
          bowlsPerWeek: p.bowlsPerCycle,
          weeklyPrice: pricePerBowl * p.bowlsPerCycle,
          perBowl: pricePerBowl,
          ratePremium: p.pricePerBowlPremium,
          billingCycle: p.billingCycle,
          savingsBadge: p.savingsBadge ?? '',
          customisationChargePerBowl: p.customisationChargePerBowl,
          deliveryStyles: p.deliveryStyles,
        };
      })
    : STUB_PLANS;

  // Customization modal triggers
  const [customizingSpreadKey, setCustomizingSpreadKey] = useState<{ day: string; bowlId: string; instanceIndex: number } | null>(null);  // scenario A
  const [repeatChoiceKey, setRepeatChoiceKey] = useState<{ day: string; bowlId: string } | null>(null);  // scenario A — repeat/customise sheet

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

      // Check for active or pending subscription
      const { data: activeSub } = await supabase
        .from('subscriptions')
        .select('id, status, period_end_date')
        .eq('user_id', authUser.id)
        .in('status', ['active', 'pending'])
        .maybeSingle();

      if (activeSub) {
        if (activeSub.status === 'pending') {
          setHasActiveSub(true); // Still treat pending as "blocked" unless they discard
        } else if (activeSub.status === 'active') {
          const endDate = activeSub.period_end_date;
          setActiveSubEndDate(endDate);
          
          const daysLeft = endDate ? Math.ceil((new Date(endDate).getTime() - Date.now()) / 86400000) : 99;
          if (daysLeft > 2) {
            setHasActiveSub(true);
          } else {
            setIsRenewalFlow(true);
          }
        }
      } else {
        // Guard against stale session state from a previous subscription flow.
        // New starts must always re-confirm delivery style to avoid accidental
        // carry-over (e.g., prior flexible selection showing up for spread intent).
        setState(s => ({
          ...s,
          step: 1,
          deliveryStyle: null,
        }));
      }

      // Load default delivery address from Supabase
      const { data: addresses } = await supabase
        .from('addresses')
        .select('line1, line2, pincode, is_default, lat, lng, distance_km')
        .eq('user_id', authUser.id)
        .order('is_default', { ascending: false })
        .limit(5);

      if (addresses && addresses.length > 0) {
        const def = addresses.find(a => a.is_default) ?? addresses[0];
        if (def) {
          setDeliveryAddress(`${def.line1}, ${def.line2}, Karnataka ${def.pincode}`);
          setDeliveryLat(typeof def.lat === "number" ? def.lat : undefined);
          setDeliveryLng(typeof def.lng === "number" ? def.lng : undefined);
          setDeliveryPincode(def.pincode);
          // Prefer stored route distance (synced on address save) to avoid duplicate Ola on load
          if (typeof def.distance_km === "number" && Number.isFinite(def.distance_km)) {
            setDeliveryDistanceKm(Math.round(def.distance_km * 10) / 10);
          } else {
            const coords = await resolveDeliveryCoords(def.pincode, def.lat, def.lng);
            if (coords) {
              const res = await fetch(
                `/api/delivery-distance?lat=${encodeURIComponent(String(coords.lat))}&lng=${encodeURIComponent(String(coords.lng))}`,
              );
              if (res.ok) {
                const d = (await res.json()) as { distanceKm: number; deliveryFee: number };
                setDeliveryDistanceKm(Math.round(d.distanceKm * 10) / 10);
              }
            }
          }
        }
      }
    });
  }, []);

  // Suppress unused variable warning — deliveryPincode is set alongside deliveryAddress
  void deliveryPincode;

  const currentPlan = plans.find(p => p.id === state.planId);

  function getScenario(): 'A' | 'D' {
    if (state.deliveryStyle === 'flexible') return 'D';
    // All spread plans (3/5/daily) use the same configurable flow:
    // choose any days and distribute the plan's bowls across those days.
    return 'A';
  }

  // ─── Validation ─────────────────────────────────────────────────────────────

  const canProceedStep1 =
    state.planId !== null &&
    state.deliveryStyle !== null;

  const spreadTotal = Object.values(state.dayBowlCounts).reduce(
    (sum, dayCounts) => sum + Object.values(dayCounts).reduce((s, c) => s + c, 0), 0
  );

  const canProceedStep2 = (() => {
    if (!currentPlan) return false;
    const scenario = getScenario();

    if (scenario === 'D') return true;  // wallet — no pre-selection needed

    // All non-flexible scenarios require a time slot
    if (state.timeSlotMode === 'same' && !state.deliveryTimeSlot) return false;
    if (state.timeSlotMode === 'different') {
      const hasAllDailySlots = state.selectedDays.every(day => Boolean(state.dayTimeSlotMap[day]));
      if (!hasAllDailySlots) return false;
    }

    if (scenario === 'A') {
      return spreadTotal === currentPlan.bowlsPerWeek;
    }

    return false;
  })();

  // ─── Step transitions ────────────────────────────────────────────────────────

  function goToStep2() {
    if (!currentPlan) return;
    setState(s => ({ ...s, step: 2 }));
  }

  function goToStep3() {
    setState(s => ({ ...s, step: 3 }));
    setError('');
  }

  function goBack() {
    setState(s => ({ ...s, step: (s.step - 1) as 1 | 2 }));
    setError('');
  }

  useEffect(() => {
    if (state.step === 2) {
      smoothScrollTo(step2TopRef.current);
      if (state.deliveryStyle === "flexible") {
        smoothScrollTo(flexibleIntroRef.current);
      } else {
        smoothScrollTo(spreadDaysRef.current);
      }
      return;
    }
    if (state.step === 3) {
      smoothScrollTo(step3TopRef.current);
    }
  }, [state.step, state.deliveryStyle]);

  useEffect(() => {
    if (state.step !== 1 || !state.planId || state.deliveryStyle) return;
    const el = document.getElementById(`delivery-style-${state.planId}`);
    smoothScrollTo(el);
  }, [state.step, state.planId, state.deliveryStyle]);

  // ─── Day toggle (Step 2A & 2C) ───────────────────────────────────────────────

  function toggleDay(day: Day) {
    const isSelected = state.selectedDays.includes(day);

    if (isSelected) {
      // Clear bowl data for this day on deselect
      setState(s => {
        const newDayBowlCounts = { ...s.dayBowlCounts };
        delete newDayBowlCounts[day];
        const newDayBowlCustomMap = { ...s.dayBowlCustomMap };
        delete newDayBowlCustomMap[day];
        const newDayBowlPresetMap = { ...s.dayBowlPresetMap };
        delete newDayBowlPresetMap[day];
        return {
          ...s,
          selectedDays: s.selectedDays.filter(d => d !== day),
          dayBowlMap: { ...s.dayBowlMap, [day]: '' },
          dayPresetMap: { ...s.dayPresetMap, [day]: DEFAULT_PRESET_OPTIONS },
          dayBowlCounts: newDayBowlCounts,
          dayBowlCustomMap: newDayBowlCustomMap,
          dayBowlPresetMap: newDayBowlPresetMap,
        };
      });
    } else {
      if (!currentPlan) return;
      setState(s => ({ ...s, selectedDays: [...s.selectedDays, day] }));
    }
  }

  // Scenario A: per-day, per-bowl quantity adjustment
  function adjustDayBowlCount(day: string, bowlId: string, delta: number) {
    if (!currentPlan) return;
    if (delta > 0 && spreadTotal >= currentPlan.bowlsPerWeek) return;
    const current = state.dayBowlCounts[day]?.[bowlId] ?? 0;

    if (delta > 0 && current >= 1) {
      const bowl = findBowlByIdentifier(bowls, bowlId);
      if (bowl?.customizableIngredients?.length) {
        setRepeatChoiceKey({ day, bowlId });
        return; // increment happens via the choice sheet
      }
    }

    const next = Math.max(0, current + delta);
    setState(s => {
      const currentInstances = s.dayBowlCustomMap[day]?.[bowlId] ?? [];
      const currentPresetInstances = s.dayBowlPresetMap[day]?.[bowlId] ?? [];
      const newInstances = delta > 0
        ? [...currentInstances, [] as IngredientCustomization[]]
        : currentInstances.slice(0, -1);
      const newPresetInstances = delta > 0
        ? [...currentPresetInstances, { ...DEFAULT_PRESET_OPTIONS }]
        : currentPresetInstances.slice(0, -1);
      return {
        ...s,
        dayBowlCounts: {
          ...s.dayBowlCounts,
          [day]: { ...(s.dayBowlCounts[day] ?? {}), [bowlId]: next },
        },
        dayBowlCustomMap: {
          ...s.dayBowlCustomMap,
          [day]: { ...(s.dayBowlCustomMap[day] ?? {}), [bowlId]: newInstances },
        },
        dayBowlPresetMap: {
          ...s.dayBowlPresetMap,
          [day]: { ...(s.dayBowlPresetMap[day] ?? {}), [bowlId]: newPresetInstances },
        },
      };
    });
  }

  // Applies the confirmed repeat-choice: increments count and pushes the given customizations as a new instance
  function doIncrementBowl(
    day: string,
    bowlId: string,
    customizations: IngredientCustomization[],
    presetOptions: BowlPresetOptions,
  ) {
    setState(s => {
      const currentCount = s.dayBowlCounts[day]?.[bowlId] ?? 0;
      const currentInstances = s.dayBowlCustomMap[day]?.[bowlId] ?? [];
      const currentPresetInstances = s.dayBowlPresetMap[day]?.[bowlId] ?? [];
      return {
        ...s,
        dayBowlCounts: {
          ...s.dayBowlCounts,
          [day]: { ...(s.dayBowlCounts[day] ?? {}), [bowlId]: currentCount + 1 },
        },
        dayBowlCustomMap: {
          ...s.dayBowlCustomMap,
          [day]: { ...(s.dayBowlCustomMap[day] ?? {}), [bowlId]: [...currentInstances, customizations] },
        },
        dayBowlPresetMap: {
          ...s.dayBowlPresetMap,
          [day]: { ...(s.dayBowlPresetMap[day] ?? {}), [bowlId]: [...currentPresetInstances, presetOptions] },
        },
      };
    });
  }

  const describeCustomizations = (
    customizations: IngredientCustomization[] | undefined,
    bowl: Bowl | undefined,
    presetOptions?: BowlPresetOptions,
  ) => {
    const list = customizations ?? [];
    const removed = list
      .filter(c => c.option === 'remove')
      .map(c => bowl?.customizableIngredients?.find(i => i.id === c.ingredientId)?.name)
      .filter(Boolean) as string[];
    const extras = list
      .filter(c => c.option === 'extra')
      .map(c => bowl?.customizableIngredients?.find(i => i.id === c.ingredientId)?.name)
      .filter(Boolean) as string[];
    const lines: string[] = [];
    if (presetOptions) {
      lines.push(`base: ${presetOptions.baseChoice}`);
      lines.push(`oats: ${presetOptions.oatsChoice}`);
      lines.push(
        presetOptions.noSugar
          ? "sweetness: no sugar (exclude banana, honey, dates)"
          : "sweetness: natural (banana, honey, dates)",
      );
    }
    if (removed.length > 0) lines.push(`remove: ${removed.join(", ")}`);
    if (extras.length > 0) lines.push(`extra: ${extras.join(", ")}`);
    return lines.length > 0 ? ` (${lines.join(" | ")})` : "";
  };

  const buildSubscriptionConfigLines = (currentPlanName: string): string[] => {
    const scenario = getScenario();
    if (scenario === "D") {
      return [
        `- Flexible wallet plan: ${currentPlanName}`,
        `- Funds are loaded only after payment approval and expire in ${currentPlan?.billingCycle === 'monthly' ? '1 month' : '7 days'}.`,
        "- Bowls are scheduled later from dashboard.",
      ];
    }
    if (scenario === "A") {
      return DAYS.filter(d => state.selectedDays.includes(d)).flatMap(day => {
        const dayCounts = state.dayBowlCounts[day] ?? {};
        const lines = Object.entries(dayCounts)
          .filter(([, qty]) => qty > 0)
          .flatMap(([bowlId, qty]) => {
            const bowl = findBowlByIdentifier(bowls, bowlId);
            const instances = state.dayBowlCustomMap[day]?.[bowlId] ?? [];
            const presetInstances = state.dayBowlPresetMap[day]?.[bowlId] ?? [];
            const slot = state.timeSlotMode === 'different' ? state.dayTimeSlotMap[day] : state.deliveryTimeSlot;
            const s = slot ? ` [${slot}]` : "";
            // If all instances share the same customizations, collapse into one line
            const allSame = instances.length <= 1 || instances.every((inst, i) =>
              i === 0 || JSON.stringify(inst) === JSON.stringify(instances[0])
            );
            const allPresetSame = presetInstances.length <= 1 || presetInstances.every((inst, i) =>
              i === 0 || JSON.stringify(inst) === JSON.stringify(presetInstances[0])
            );
            if (qty === 1 || (allSame && allPresetSame)) {
              const c = describeCustomizations(instances[0] ?? [], bowl, presetInstances[0] ?? DEFAULT_PRESET_OPTIONS);
              return [`- ${day}: ${qty} x ${bowl?.name ?? bowlId}${c}${s}`];
            }
            // Different customizations per instance — list each bowl separately
            return instances.map((inst, i) => {
              const c = describeCustomizations(inst, bowl, presetInstances[i] ?? DEFAULT_PRESET_OPTIONS);
              return `- ${day}: 1 x ${bowl?.name ?? bowlId} [Bowl ${i + 1}]${c}${s}`;
            });
          });
        return lines.length > 0 ? lines : [`- ${day}: no bowls assigned`];
      });
    }
    return [];
  };

  // ─── Order request via WhatsApp ──────────────────────────────────────────────

  async function handlePayment() {
    if (!user || !currentPlan) return;
    setSubmitting(true);
    setError('');

    try {
      const subRef = await saveSubscription();
      if (!subRef) {
        return; // saveSubscription already set the specific error
      }
      const message = buildSubscriptionWhatsAppMessage({
        customerName: user.name,
        customerPhone: user.phone,
        customerEmail: user.email,
        planName: currentPlan.name,
        weeklyPrice: totalWeeklyPrice,
        weeklyDeliveryFeeRs: weeklyDeliveryFeeRs > 0 ? weeklyDeliveryFeeRs : undefined,
        deliveryAddress,
        lat: deliveryLat,
        lng: deliveryLng,
        deliveryStyle:
          getScenario() === "D"
            ? "Flexible wallet"
            : (state.deliveryStyle ?? "spread"),
        deliveryTimeSlot: getScenario() !== "D" ? state.deliveryTimeSlot : undefined,
        configurationLines: buildSubscriptionConfigLines(currentPlan.name),
        subscriptionRef: subRef,
        notes: notes.trim() || undefined,
      });
      const waUrl = getWhatsAppUrl(whatsappNumber, message);
      try { sessionStorage.removeItem(WIZARD_SESSION_KEY); } catch { /* ignore */ }
      // Store the URL and let the user click it directly for all plans
      // (window.open after async/await is blocked by pop-up blockers)
      setFlexibleWhatsAppUrl(waUrl);
    } catch {
      setError('Something went wrong while creating your subscription. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function saveSubscription(): Promise<string | null> {
    if (!currentPlan || !user) return null;
    const scenario = getScenario();

    // Build day_configs for spread/daily scenarios
    const dayConfigs: DayBowlConfig[] = scenario === 'A'
      ? Object.entries(state.dayBowlCounts).flatMap(([day, bowlCounts]) =>
          Object.entries(bowlCounts)
            .filter(([, count]) => count > 0)
            .map(([bowlId, quantity]) => {
              const bowl = findBowlByIdentifier(bowls, bowlId);
              const instances = state.dayBowlCustomMap[day]?.[bowlId] ?? [];
              const presetInstances = state.dayBowlPresetMap[day]?.[bowlId] ?? [];
              // Pad to match quantity in case instances array is shorter
              const paddedInstances = Array.from({ length: quantity }, (_, i) => instances[i] ?? []);
              const paddedPresetInstances = Array.from(
                { length: quantity },
                (_, i) => presetInstances[i] ?? DEFAULT_PRESET_OPTIONS
              );
              return {
                day: day as DayBowlConfig['day'],
                bowlId,
                bowlName: bowl?.name ?? '',
                quantity,
                // Send per-instance array; API and checkout-security handle [][] format
                customizations: paddedInstances.map((inst, idx) =>
                  encodePresetIntoCustomizations(inst, paddedPresetInstances[idx] ?? DEFAULT_PRESET_OPTIONS)
                ) as unknown as IngredientCustomization[],
                presetOptions: paddedPresetInstances[0] ?? DEFAULT_PRESET_OPTIONS,
                customizationCost: paddedInstances.reduce((sum, inst) => sum + calcCustomCost(inst, bowl), 0),
                deliveryTimeSlot: state.timeSlotMode === 'different' ? state.dayTimeSlotMap[day] : state.deliveryTimeSlot,
              };
            })
        )
      : [];

    const res = await fetch('/api/subscriptions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        planId: state.planId,
        deliveryStyle: state.deliveryStyle ?? 'spread',
        deliveryTimeSlot: scenario !== 'D' ? state.deliveryTimeSlot : null,
        dayConfigs: dayConfigs.map((config) => ({
          day: config.day,
          bowlId: findBowlByIdentifier(bowls, config.bowlId)?.slug ?? config.bowlId.replace(/^bowl-/, ''),
          quantity: config.quantity,
          customizations: config.customizations ?? [],
          presetOptions: config.presetOptions ?? DEFAULT_PRESET_OPTIONS,
          deliveryTimeSlot: config.deliveryTimeSlot,
        })),
        startDate: activeSubEndDate ? new Date(new Date(activeSubEndDate).getTime() + 86400000).toISOString().split('T')[0] : null,
        notes: notes.trim() || undefined,
      }),
    });

    if (!res.ok) {
      const payload = await res.json().catch(() => null);
      setError(typeof payload?.error === 'string' ? payload.error : 'Failed to save subscription. Please contact support.');
      return null;
    }

    const newSub = await res.json() as { id?: string };
    if (!newSub.id) {
      setError('Failed to save subscription. Please contact support.');
      return null;
    }

    // Return short ref for WhatsApp message (caller sets success/pending state)
    return newSub.id.slice(-6).toUpperCase();
  }

  // ─── Customization Pricing ───────────────────────────────────────────────────

  // Sum actual per-ingredient extra costs (e.g. ₹X per extra topping) across all days/bowls.
  const totalIngredientExtras = (() => {
    const scenario = getScenario();
    if (scenario === 'D') return 0; // flexible — charged at wallet debit time
    return Object.entries(state.dayBowlCustomMap).reduce((total, [day, bowlMap]) => {
      return total + Object.entries(bowlMap).reduce((dayTotal, [bowlId, instances]) => {
        const bowl = findBowlByIdentifier(bowls, bowlId);
        // Sum cost across each individual instance
        return dayTotal + instances.reduce((instTotal, inst) => instTotal + calcCustomCost(inst, bowl), 0);
      }, 0);
    }, 0);
  })();

  const scenario = getScenario();
  const weeklyDeliveryFeeRs = (() => {
    if (scenario === 'D') return 0; // flexible wallet — delivery charged per cart order
    if (!deliveryDistanceKm || deliveryDistanceKm <= FREE_ZONE_RADIUS_KM) return 0;
    const uniqueDeliveryDays = state.selectedDays.length;
    return Math.ceil(deliveryDistanceKm) * 5 * uniqueDeliveryDays;
  })();

  const tieredBowlSubtotal = (() => {
    if (!currentPlan) return 0;
    if (scenario === "D") return currentPlan.weeklyPrice;
    let s = 0;
    for (const day of state.selectedDays) {
      const counts = state.dayBowlCounts[day] ?? {};
      for (const [bowlId, qty] of Object.entries(counts)) {
        if (qty <= 0) continue;
        const bowl = findBowlByIdentifier(bowls, bowlId);
        if (!bowl) continue;
        s += getSubscriberBaseFromPlanConfig(bowl, currentPlan) * qty;
      }
    }
    return s;
  })();

  const totalWeeklyPrice = currentPlan
    ? tieredBowlSubtotal + totalIngredientExtras + weeklyDeliveryFeeRs
    : 0;

  // ─── Active subscription blocker ──────────────────────────────────────────────

  if (hasActiveSub && !success && !pendingApproval) {
    return (
      <div className="max-w-lg mx-auto">
        <div className="bg-white rounded-2xl border border-black/8 p-10 text-center shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
          <div className="w-16 h-16 rounded-full bg-terracotta/10 flex items-center justify-center mx-auto mb-6">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#C4714A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </div>
          <h2 className="font-display text-2xl font-medium text-ink mb-3">You already have a subscription</h2>
          <p className="font-body text-[14px] text-stone leading-relaxed mb-8">
            Only one subscription is allowed at a time. To switch plans, please cancel your current subscription first and then subscribe again.
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

  // ─── Pending approval screen ─────────────────────────────────────────────────
  // Shown after user clicks "Send on WhatsApp" on the send screen below.
  // pendingApproval is checked first so it takes priority over the send screen.

  if (pendingApproval && currentPlan) {
    const waUrl = flexibleWhatsAppUrl;
    return (
      <div className="max-w-lg mx-auto">
        <div className="bg-white rounded-2xl border border-black/10 p-10 text-center shadow-[0_8px_30px_rgb(0,0,0,0.04)] animate-in zoom-in-95 duration-400">
          <div className="w-16 h-16 rounded-full bg-terracotta/10 flex items-center justify-center mx-auto mb-6">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#C4714A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 2L11 13"/><path d="m22 2-7 20-4-9-9-4Z"/>
            </svg>
          </div>
          <h2 className="font-display text-3xl font-medium text-ink mb-3">Request Sent!</h2>
          <p className="font-body text-[14px] text-stone leading-relaxed mb-6">
            Your <strong className="text-ink">{currentPlan.name}</strong> request is waiting for activation. Please send the WhatsApp message to our team to confirm your subscription.
          </p>
          
          <div className="space-y-4">
            {waUrl && (
              <button
                onClick={() => window.open(waUrl, "_blank")}
                className="w-full bg-[#25D366] hover:bg-[#20bd5a] text-white font-body text-sm font-bold tracking-wide py-4 rounded-md transition-colors shadow-sm flex items-center justify-center gap-2"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                Send Request on WhatsApp
              </button>
            )}

            <Link
              href="/subscriptions"
              className="block w-full text-stone hover:text-ink font-body text-[13px] font-medium py-2 transition-colors border border-black/5 rounded-md hover:bg-black/5"
            >
              Go to My Subscriptions →
            </Link>
          </div>
          
          <p className="font-body text-[12px] text-stone mt-6 italic">
            Once approved, your plan will appear as "Active" in your dashboard.
          </p>
        </div>
      </div>
    );
  }

  // ─── WhatsApp send screen (all plans) ────────────────────────────────────────
  // Shown after subscription is saved. User must click the link directly —
  // window.open after async/await is blocked by browsers as a pop-up.

  if (flexibleWhatsAppUrl && currentPlan) {
    return (
      <div className="max-w-lg mx-auto">
        <div className="bg-white rounded-2xl border border-black/10 p-10 text-center shadow-[0_8px_30px_rgb(0,0,0,0.04)] animate-in zoom-in-95 duration-400">
          <div className="w-16 h-16 rounded-full bg-[#25D366]/10 flex items-center justify-center mx-auto mb-6">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="#25D366">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
              <path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.558 4.122 1.533 5.849L.057 23.886a.5.5 0 0 0 .611.61l6.101-1.456A11.932 11.932 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.793 9.793 0 0 1-4.98-1.364l-.357-.212-3.698.883.934-3.613-.232-.371A9.793 9.793 0 0 1 2.182 12C2.182 6.57 6.57 2.182 12 2.182S21.818 6.57 21.818 12 17.43 21.818 12 21.818z"/>
            </svg>
          </div>
          <h2 className="font-display text-3xl font-medium text-ink mb-3">Almost there!</h2>
          <p className="font-body text-[14px] text-stone leading-relaxed mb-2">
            Your <strong className="text-ink">{currentPlan.name}</strong> subscription is ready. Tap below to send your request on WhatsApp — we&apos;ll activate your plan once confirmed.
          </p>
          <p className="font-body text-[13px] text-stone mb-8">
            Your subscription details will be pre-filled in the message.
          </p>
          <a
            href={flexibleWhatsAppUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => { try { sessionStorage.removeItem(WIZARD_SESSION_KEY); } catch { /* ignore */ } setTimeout(() => setPendingApproval(true), 500); }}
            className="bg-[#25D366] hover:bg-[#1ebe5d] text-white font-body text-sm font-bold tracking-wide px-8 py-3.5 rounded-md transition-colors shadow-sm inline-flex items-center gap-2"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
              <path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.558 4.122 1.533 5.849L.057 23.886a.5.5 0 0 0 .611.61l6.101-1.456A11.932 11.932 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.793 9.793 0 0 1-4.98-1.364l-.357-.212-3.698.883.934-3.613-.232-.371A9.793 9.793 0 0 1 2.182 12C2.182 6.57 6.57 2.182 12 2.182S21.818 6.57 21.818 12 17.43 21.818 12 21.818z"/>
            </svg>
            Send on WhatsApp
          </a>
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
        {isRenewalFlow && (
          <div className="mb-8 p-6 bg-sage/10 border border-sage/20 rounded-2xl animate-in fade-in slide-in-from-top-4 duration-500">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-sage/20 flex items-center justify-center shrink-0 mt-0.5">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7D9B76" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="m9 12 2 2 4-4"/></svg>
              </div>
              <div>
                <h3 className="font-display text-lg font-medium text-sage-dark mb-1">Plan Transition Mode</h3>
                <p className="font-body text-[13px] text-stone leading-relaxed">
                  You have an active plan ending on <strong className="text-ink">{activeSubEndDate}</strong>. 
                  Your new selection will be scheduled to start automatically the very next day.
                </p>
              </div>
            </div>
          </div>
        )}
        <StepIndicator />

        <h2 className="font-display text-xl font-medium text-ink mb-6 text-center">Choose your plan</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          {plans.map(plan => (
            <PlanCard
              key={plan.id}
              plan={plan}
              selected={state.planId === plan.id}
              deliveryStyle={state.planId === plan.id ? state.deliveryStyle : null}
              onSelect={() => setState(s => ({
                ...s,
                planId: plan.id,
                deliveryStyle: null,
                selectedDays: [],
                dayBowlMap: {},
                dayCustomMap: {},
                dayPresetMap: {},
                dayBowlCounts: {},
                dayBowlCustomMap: {},
                dayBowlPresetMap: {},
              }))}
              onDeliveryStyle={(style) => {
                setState(s => ({ ...s, deliveryStyle: style, step: 2 }));
              }}
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
        <div ref={step2TopRef} className="max-w-2xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="font-display text-4xl font-medium text-ink mb-3">Subscribe & Save</h1>
            <p className="font-body text-[14px] text-stone">
              {currentPlan.name} — {formatCurrency(totalWeeklyPrice)}/week
            </p>
            <p className="font-body text-[12px] text-stone/80 mt-1">
              {currentPlan.ratePremium != null && currentPlan.ratePremium > 0
                ? `Standard bowls ${formatCurrency(currentPlan.perBowl)}/bowl; premium ${formatCurrency(currentPlan.ratePremium)}/bowl. `
                : `Starts from ${formatCurrency(currentPlan.perBowl)} per bowl. `}
              Delivery is free within 10 km; beyond 10 km, delivery charges are added based on distance.
            </p>
          </div>
          <StepIndicator />

          {isRenewalFlow && (
            <div className="mb-8 p-5 bg-sage/10 border border-sage/20 rounded-xl animate-in fade-in slide-in-from-top-2 duration-500">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-sage/20 flex items-center justify-center shrink-0 mt-0.5">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7D9B76" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="m9 12 2 2 4-4"/></svg>
                </div>
                <div>
                  <p className="font-body text-[13px] font-bold text-sage-dark">Transitioning to next cycle</p>
                  <p className="font-body text-[11px] text-stone leading-relaxed">
                    Setting up your next plan to start on <strong className="text-ink">{activeSubEndDate ? new Date(new Date(activeSubEndDate).getTime() + 86400000).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '...'}</strong>.
                  </p>
                </div>
              </div>
            </div>
          )}

          <h2 className="font-display text-xl font-medium text-ink mb-6 text-center">
            {scenario === 'D' ? 'How your wallet works'
              : 'Assign bowls to delivery days'}
          </h2>

          {/* Scenario A — Spread (multi-bowl per day) */}
          {scenario === 'A' && (
            <div className="space-y-6">
              {/* Day pills */}
              <div ref={spreadDaysRef} className="bg-white rounded-xl border border-black/8 p-5">
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
                            const instances = state.dayBowlCustomMap[day]?.[bowl._id] ?? [];
                            const presetInstances = state.dayBowlPresetMap[day]?.[bowl._id] ?? [];

                            return (
                              <div key={bowl._id} className={`flex items-center gap-3 p-2.5 rounded-lg border transition-all ${count > 0 ? 'border-sage/40 bg-sage/5' : 'border-black/6 bg-[#F9F8F6]'}`}>
                                <div className="w-9 h-9 rounded-md overflow-hidden bg-white relative shrink-0">
                                  <Image src={bowl.image} alt={bowl.name} fill className="object-contain" sizes="36px" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="font-body text-[12px] font-medium text-ink truncate">{bowl.name}</p>
                                  {count > 0 && (
                                    <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                                      {Array.from({ length: count }).map((_, idx) => {
                                        const instCustoms = instances[idx] ?? [];
                                        const instPreset = presetInstances[idx] ?? DEFAULT_PRESET_OPTIONS;
                                        const instHasCustom =
                                          instCustoms.some(c => c.option !== 'default') ||
                                          instPreset.baseChoice !== DEFAULT_PRESET_OPTIONS.baseChoice ||
                                          instPreset.oatsChoice !== DEFAULT_PRESET_OPTIONS.oatsChoice ||
                                          instPreset.noSugar !== DEFAULT_PRESET_OPTIONS.noSugar;
                                        return (
                                          <button
                                            key={idx}
                                            onClick={() => setCustomizingSpreadKey({ day, bowlId: bowl._id, instanceIndex: idx })}
                                            className="font-body text-[10px] text-sage font-semibold hover:underline flex items-center gap-0.5 cursor-pointer"
                                          >
                                            {count > 1 && <span className="text-stone font-normal mr-0.5">Bowl {idx + 1}:</span>}
                                            {instHasCustom ? 'Edit' : 'Customise'} →
                                            {instHasCustom && <span className="w-1.5 h-1.5 rounded-full bg-terracotta ml-0.5 shrink-0" />}
                                          </button>
                                        );
                                      })}
                                    </div>
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

          {/* Scenario D — Flexible / Wallet */}
          {scenario === 'D' && (
            <div ref={flexibleIntroRef} className="space-y-4">
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
                      Pay <strong>₹{currentPlan.weeklyPrice.toLocaleString('en-IN')}</strong> now. The amount is loaded only after Nutravoe approves the payment.
                    </p>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-sage/5 rounded-lg border border-sage/20">
                    <div className="w-6 h-6 rounded-full bg-sage/20 flex items-center justify-center shrink-0 text-sage font-bold text-[12px]">2</div>
                    <p className="font-body text-[13px] text-ink">
                      Schedule any bowl, any day through the week — each delivery deducts the subscriber price
                      {currentPlan.ratePremium != null && currentPlan.ratePremium > 0 ? (
                        <> (<strong>₹{currentPlan.perBowl}</strong> standard / <strong>₹{currentPlan.ratePremium}</strong> premium per bowl)</>
                      ) : (
                        <><strong>₹{currentPlan.perBowl}</strong> per bowl</>
                      )}{" "}
                      from your wallet.
                    </p>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-sage/5 rounded-lg border border-sage/20">
                    <div className="w-6 h-6 rounded-full bg-sage/20 flex items-center justify-center shrink-0 text-sage font-bold text-[12px]">3</div>
                    <p className="font-body text-[13px] text-ink">
                      Once loaded, this balance expires in {currentPlan.billingCycle === 'monthly' ? '1 month' : '7 days'} from the approval date.
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
                  <p className="font-body text-[11px] font-bold uppercase tracking-wider text-stone">Wallet balance after approval</p>
                  <p className="font-body text-[12px] text-stone mt-0.5">
                    {currentPlan.bowlsPerWeek} bowls at standard load rate (₹{currentPlan.perBowl} each), loaded after approval. Premium menu bowls debit more per order.
                  </p>
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

              <div className="flex gap-4 mb-5">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input 
                    type="radio" 
                    name="timeSlotMode" 
                    checked={state.timeSlotMode === 'same'} 
                    onChange={() => setState(s => ({ ...s, timeSlotMode: 'same' }))}
                    className="text-sage focus:ring-sage"
                  />
                  <span className="font-body text-[13px] text-ink">Same time every day</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input 
                    type="radio" 
                    name="timeSlotMode" 
                    checked={state.timeSlotMode === 'different'} 
                    onChange={() => setState(s => ({ ...s, timeSlotMode: 'different' }))}
                    className="text-sage focus:ring-sage"
                  />
                  <span className="font-body text-[13px] text-ink">Different times for each day</span>
                </label>
              </div>

              {state.timeSlotMode === 'same' ? (
                <>
                  <p className="font-body text-[12px] text-stone mb-3">Choose one preferred hour spanning all deliveries.</p>
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
                </>
              ) : (
                <div className="space-y-4">
                  {state.selectedDays.length === 0 ? (
                    <p className="font-body text-[13px] text-stone">Select days above to choose times.</p>
                  ) : (
                    state.selectedDays.map(day => (
                      <div key={day} className="flex flex-col md:flex-row md:items-center gap-3 p-3 bg-[#F9F8F6] rounded-lg border border-black/5">
                        <span className="w-12 font-body text-[13px] font-bold text-ink shrink-0">{day}</span>
                        <select 
                          className="w-full md:w-auto px-3 py-2 rounded-lg border border-black/15 font-body text-[13px] text-ink bg-white focus:outline-none focus:border-sage focus:ring-1 focus:ring-sage transition-all"
                          value={state.dayTimeSlotMap[day] || ""}
                          onChange={(e) => setState(s => ({ 
                            ...s, 
                            dayTimeSlotMap: { ...s.dayTimeSlotMap, [day]: e.target.value } 
                          }))}
                        >
                          <option value="" disabled>Select time slot...</option>
                          {TIME_SLOTS.map(slot => (
                            <option key={slot} value={slot}>{slot}</option>
                          ))}
                        </select>
                      </div>
                    ))
                  )}
                  {!state.selectedDays.every(d => Boolean(state.dayTimeSlotMap[d])) && state.selectedDays.length > 0 && (
                     <p className="font-body text-[11px] text-terracotta mt-2">Please select a time slot for all days.</p>
                  )}
                </div>
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
            Next: Review & Confirm →
            </button>
          </div>
        </div>

        {/* Customization modal — scenario A (spread, per-instance) */}
        {customizingSpreadKey && (() => {
          const { day, bowlId, instanceIndex } = customizingSpreadKey;
          const bowl = findBowlByIdentifier(bowls, bowlId) ?? null;
          if (!bowl) return null;
          const instances = state.dayBowlCustomMap[day]?.[bowlId] ?? [];
          const presetInstances = state.dayBowlPresetMap[day]?.[bowlId] ?? [];
          return (
            <CustomizationModal
              bowl={bowl}
              initialCustomizations={instances[instanceIndex] ?? []}
              initialPresetOptions={presetInstances[instanceIndex] ?? DEFAULT_PRESET_OPTIONS}
              mode="subscription"
              onConfirm={(customizations, presetOptions) => {
                setState(s => {
                  const current = [...(s.dayBowlCustomMap[day]?.[bowlId] ?? [])];
                  const currentPresets = [...(s.dayBowlPresetMap[day]?.[bowlId] ?? [])];
                  current[instanceIndex] = customizations;
                  currentPresets[instanceIndex] = presetOptions;
                  return {
                    ...s,
                    dayBowlCustomMap: {
                      ...s.dayBowlCustomMap,
                      [day]: { ...(s.dayBowlCustomMap[day] ?? {}), [bowlId]: current },
                    },
                    dayBowlPresetMap: {
                      ...s.dayBowlPresetMap,
                      [day]: { ...(s.dayBowlPresetMap[day] ?? {}), [bowlId]: currentPresets },
                    },
                  };
                });
                setCustomizingSpreadKey(null);
              }}
              onClose={() => setCustomizingSpreadKey(null)}
            />
          );
        })()}

        {/* Repeat-or-customise choice sheet — scenario A */}
        {repeatChoiceKey && (() => {
          const bowl = findBowlByIdentifier(bowls, repeatChoiceKey.bowlId);
          const { day, bowlId } = repeatChoiceKey;
          const existingInstances = state.dayBowlCustomMap[day]?.[bowlId] ?? [];
          const existingPresetInstances = state.dayBowlPresetMap[day]?.[bowlId] ?? [];
          const lastCustomizations = existingInstances[existingInstances.length - 1] ?? [];
          const lastPresetOptions = existingPresetInstances[existingPresetInstances.length - 1] ?? DEFAULT_PRESET_OPTIONS;
          const existingCount = state.dayBowlCounts[day]?.[bowlId] ?? 0;
          const lastSummary = describeCustomizations(lastCustomizations, bowl, lastPresetOptions).replace(/^\s*\(|\)$/g, '');
          return (
            <div
              className="fixed inset-0 z-[120] flex items-end md:items-center justify-center p-0 md:p-4 bg-ink/60 backdrop-blur-sm animate-in fade-in duration-200"
              onClick={(e) => { if (e.target === e.currentTarget) setRepeatChoiceKey(null); }}
            >
              <div
                role="dialog"
                aria-modal="true"
                className="bg-white rounded-t-2xl md:rounded-2xl w-full md:max-w-sm shadow-2xl animate-in slide-in-from-bottom-4 md:zoom-in-95 duration-200"
              >
                <div className="flex items-center justify-between px-6 py-5 border-b border-black/5">
                  <div>
                    <h3 className="font-display text-xl font-medium text-ink">Add another {bowl?.name}?</h3>
                    <p className="font-body text-[12px] text-stone mt-0.5">Choose how you&apos;d like it</p>
                  </div>
                  <button
                    onClick={() => setRepeatChoiceKey(null)}
                    aria-label="Close"
                    className="w-8 h-8 flex items-center justify-center rounded-full bg-black/5 hover:bg-black/10 text-stone hover:text-ink transition-colors"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
                    </svg>
                  </button>
                </div>
                <div className="p-4 flex flex-col gap-3 pb-8 md:pb-4">
                  <button
                    onClick={() => {
                      doIncrementBowl(day, bowlId, [...lastCustomizations], { ...lastPresetOptions });
                      setRepeatChoiceKey(null);
                    }}
                    className="flex items-center gap-4 p-4 border border-black/10 hover:border-sage/40 rounded-xl hover:bg-sage/5 transition-all text-left group"
                  >
                    <div className="w-10 h-10 rounded-full bg-sage/10 text-sage-dark flex items-center justify-center shrink-0">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                        <path d="M3 3v5h5"/>
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-body text-[14px] font-bold text-ink group-hover:text-sage-dark transition-colors">Repeat same customisation</p>
                      {lastSummary && (
                        <p className="font-body text-[11px] text-stone mt-0.5 truncate">{lastSummary}</p>
                      )}
                    </div>
                  </button>
                  <button
                    onClick={() => {
                      const newInstanceIndex = existingCount;
                      doIncrementBowl(day, bowlId, [], { ...DEFAULT_PRESET_OPTIONS });
                      setRepeatChoiceKey(null);
                      setCustomizingSpreadKey({ day, bowlId, instanceIndex: newInstanceIndex });
                    }}
                    className="flex items-center gap-4 p-4 border border-black/10 hover:border-terracotta/40 rounded-xl hover:bg-terracotta/5 transition-all text-left group"
                  >
                    <div className="w-10 h-10 rounded-full bg-terracotta/10 text-terracotta flex items-center justify-center shrink-0">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
                        <path d="m15 5 4 4"/>
                      </svg>
                    </div>
                    <div>
                      <p className="font-body text-[14px] font-bold text-ink group-hover:text-terracotta transition-colors">Customise differently</p>
                      <p className="font-body text-[11px] text-stone mt-0.5">Opens ingredient options for this bowl</p>
                    </div>
                  </button>
                </div>
              </div>
            </div>
          );
        })()}
      </>
    );
  }

  // ─── Step 3 — Review & Confirm ────────────────────────────────────────────────

  if (state.step === 3 && currentPlan) {
    const scenario = getScenario();

    // Build human-readable summary
    const deliverySummaryText = (() => {
      if (scenario === 'D') return `₹${currentPlan.weeklyPrice.toLocaleString('en-IN')} will load after approval and expire in ${currentPlan.billingCycle === 'monthly' ? '1 month' : '7 days'}`;

      if (scenario === 'A') {
        return DAYS.filter(d => state.selectedDays.includes(d))
          .map(d => {
            const parts = Object.entries(state.dayBowlCounts[d] ?? {})
              .filter(([, c]) => c > 0)
              .map(([id, c]) => `${c}× ${findBowlByIdentifier(bowls, id)?.name ?? id}`);
            return parts.length > 0 ? `${d}: ${parts.join(' + ')}` : null;
          })
          .filter(Boolean)
          .join(' · ');
      }
      return '';
    })();

    return (
      <div ref={step3TopRef} className="max-w-lg mx-auto">
        <div className="text-center mb-8">
          <h1 className="font-display text-4xl font-medium text-ink mb-3">Subscribe & Save</h1>
        </div>
        <StepIndicator />
        <h2 className="font-display text-xl font-medium text-ink mb-6 text-center">Review & Confirm</h2>

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
              href="/signin?next=/subscribe"
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
              </div>

              <div className="border-t border-black/5 mt-4 pt-4">
                {(totalIngredientExtras > 0 || weeklyDeliveryFeeRs > 0) && currentPlan && (
                  <div className="mb-3 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-body text-[11px] text-stone">Base bowls (selected mix)</span>
                      <span className="font-body text-[11px] text-stone">{formatCurrency(tieredBowlSubtotal)}</span>
                    </div>
                    {totalIngredientExtras > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="font-body text-[11px] text-stone">Ingredient extras</span>
                        <span className="font-body text-[11px] text-stone">+ {formatCurrency(totalIngredientExtras)}</span>
                      </div>
                    )}
                    {weeklyDeliveryFeeRs > 0 && scenario !== 'D' && (
                      <>
                        <div className="flex items-center justify-between">
                          <span className="font-body text-[11px] text-stone">
                            Delivery ({state.selectedDays.length} day{state.selectedDays.length > 1 ? 's' : ''} × {formatCurrency(Math.ceil(deliveryDistanceKm!) * 5)}/day)
                          </span>
                          <span className="font-body text-[11px] text-stone">+ {formatCurrency(weeklyDeliveryFeeRs)}</span>
                        </div>
                        <div className="rounded-lg bg-sage/5 border border-sage/15 px-3 py-2 space-y-1 mt-1">
                          <div className="flex items-center justify-between">
                            <span className="font-body text-[10px] text-stone/70">Total delivery cost/week</span>
                            <span className="font-body text-[10px] text-stone/70">{formatCurrency(weeklyDeliveryFeeRs * 2)}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="font-body text-[10px] text-sage-dark font-medium">Nutravoe covers</span>
                            <span className="font-body text-[10px] text-sage-dark font-medium">− {formatCurrency(weeklyDeliveryFeeRs)}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="font-body text-[10px] font-bold text-ink">You pay/week</span>
                            <span className="font-body text-[10px] font-bold text-ink">{formatCurrency(weeklyDeliveryFeeRs)}</span>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}
                {scenario !== 'D' && (
                  <p className="font-body text-[10px] text-stone/70 mb-2">
                    Delivery is free within 10 km. If your address is beyond 10 km, the additional delivery fee is shown above.
                  </p>
                )}
                <div className="flex items-center justify-between">
                  <span className="font-body text-sm font-bold uppercase tracking-wider text-ink/70">
                    Week 1
                  </span>
                  <span className="font-display text-2xl font-medium text-sage-dark">
                    {formatCurrency(totalWeeklyPrice)}
                  </span>
                </div>
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

            {/* Customer notes */}
            <div className="mb-5">
              <label htmlFor="sub-notes" className="block font-body text-[12px] font-bold uppercase tracking-wider text-stone mb-2">
                Any notes for us? <span className="font-normal normal-case tracking-normal">(allergies, preferences…)</span>
              </label>
              <textarea
                id="sub-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value.slice(0, 300))}
                placeholder="e.g. I'm allergic to peanuts"
                rows={3}
                className="w-full border border-black/10 rounded-lg px-4 py-3 font-body text-[13px] text-ink placeholder:text-stone/50 bg-[#F9F8F6] focus:outline-none focus:ring-1 focus:ring-sage/40 resize-none"
              />
              <p className="font-body text-[11px] text-stone/60 text-right mt-1">{notes.length}/300</p>
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
                ? 'Preparing WhatsApp message...'
                : `Send Subscription Request on WhatsApp`}
            </button>
            <p className="font-body text-[11px] text-stone text-center mt-3">
              Your full subscription summary will open in WhatsApp for confirmation.
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
