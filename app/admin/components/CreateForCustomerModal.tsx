'use client';

import { useState, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { DELIVERY_TIME_SLOTS } from '@/lib/delivery-slots';
import { filterBowlsForSubscriptionPicker, filterWeeklySpreadPlansForUI } from '@/lib/bowl-filters';
import {
  DEFAULT_BOWL_PRESET,
  encodePresetIntoCustomizations,
  findBowlByIdentifier,
  formatBowlCustomizationSummary,
} from '@/lib/bowl-customization';
import type { Bowl, SubscriptionPlan, IngredientCustomization, BowlPresetOptions } from '@/types';
import BowlPicker from '@/app/subscribe/BowlPicker';
import CustomizationModal from '@/components/CustomizationModal';
import RepeatCustomisationChoiceSheet from '@/components/RepeatCustomisationChoiceSheet';
import { formatCurrency } from '@/lib/utils';

const MapPicker = dynamic(() => import('@/components/MapPicker'), { ssr: false });

interface FoundUser {
  id: string;
  full_name: string;
  email: string;
  phone: string;
}

interface OrderItem {
  bowlSlug: string;
  quantity: number;
  customizations: IngredientCustomization[];
  presetOptions: BowlPresetOptions;
}

interface DayConfig {
  day: string;
  bowlId: string;
  quantity: number;
  customizations: IngredientCustomization[];
  presetOptions: BowlPresetOptions;
  deliveryTimeSlot: string;
}

type Step = 1 | 2 | 3;
type Mode = 'order' | 'subscription';

interface OrderQuotePreview {
  subtotal: number;
  deliveryFee: number;
  total: number;
  lineItems: { bowl_name: string; quantity: number; total_price: number; unit_price: number }[];
}

interface SubQuotePreview {
  billingCycle: string;
  bowlsPerCycle: number;
  perBowl: number;
  bowlsAmountRs: number;
  baseBowlSubtotalRs: number;
  totalIngredientExtrasRs: number;
  weeklyDeliveryFeeRs: number;
  totalAmountRs: number;
}

interface Props {
  open: boolean;
  defaultMode: Mode;
  onClose: () => void;
  onSuccess: () => void;
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const STATES = [
  'Andhra Pradesh', 'Delhi', 'Goa', 'Gujarat', 'Haryana', 'Karnataka',
  'Kerala', 'Maharashtra', 'Punjab', 'Rajasthan', 'Tamil Nadu', 'Telangana',
  'Uttar Pradesh', 'West Bengal',
];

function inputCls(err?: boolean) {
  return `w-full font-body text-[13px] border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-black/20 ${err ? 'border-red-400' : 'border-black/10'}`;
}

function Lbl({ children }: { children: React.ReactNode }) {
  return <label className="block font-body text-[12px] font-medium text-stone mb-1">{children}</label>;
}

/** Match SubscribeWizard: only bowls with a customisation definition get the repeat/different sheet. */
function bowlOffersCustomiseFlow(b: Bowl | undefined): boolean {
  return Boolean(b?.customizableIngredients?.length);
}

// ── Step 1: Lookup ────────────────────────────────────────────────────────────

function Step1Lookup({ onFound, onNotFound }: {
  onFound: (u: FoundUser) => void;
  onNotFound: (p: { email?: string; phone?: string }) => void;
}) {
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  async function lookup() {
    const val = q.trim();
    if (!val) { setErr('Enter email or phone'); return; }
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);
    const isPhone = /^\d{10}$/.test(val.replace(/\D/g, ''));
    if (!isEmail && !isPhone) { setErr('Enter a valid email or 10-digit phone'); return; }
    setLoading(true); setErr('');
    try {
      const type = isEmail ? 'email' : 'phone';
      const res = await fetch(`/api/admin/customers/lookup?type=${type}&q=${encodeURIComponent(val)}`);
      const data = await res.json();
      if (!res.ok) { setErr(data.error ?? 'Lookup failed'); return; }
      if (data.user) onFound(data.user);
      else onNotFound(isEmail ? { email: val } : { phone: val.replace(/\D/g, '').slice(-10) });
    } catch { setErr('Network error'); } finally { setLoading(false); }
  }

  return (
    <div className="space-y-4">
      <p className="font-body text-[13px] text-stone">Enter the customer&apos;s email or phone to find their account.</p>
      <div>
        <Lbl>Email or Phone</Lbl>
        <input className={inputCls(!!err)} placeholder="customer@email.com or 9876543210"
          value={q} onChange={e => { setQ(e.target.value); setErr(''); }}
          onKeyDown={e => e.key === 'Enter' && lookup()} />
        {err && <p className="font-body text-[11px] text-red-500 mt-1">{err}</p>}
      </div>
      <button onClick={lookup} disabled={loading}
        className="w-full bg-ink text-white font-body text-[13px] font-bold rounded-lg py-2.5 hover:bg-black transition-colors disabled:opacity-50">
        {loading ? 'Searching\u2026' : 'Find Customer'}
      </button>
    </div>
  );
}

// ── Customer confirm card ─────────────────────────────────────────────────────

function CustomerCard({ user, onContinue }: { user: FoundUser; onContinue: () => void }) {
  return (
    <div className="space-y-4 mt-4">
      <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-1">
        <p className="font-body text-[13px] font-bold text-ink">{user.full_name}</p>
        <p className="font-body text-[12px] text-stone">{user.email}</p>
        <p className="font-body text-[12px] text-stone">{user.phone}</p>
      </div>
      <p className="font-body text-[12px] text-stone">Customer found. Proceed to create an order or subscription for them.</p>
      <button onClick={onContinue}
        className="w-full bg-ink text-white font-body text-[13px] font-bold rounded-lg py-2.5 hover:bg-black transition-colors">
        Continue &rarr;
      </button>
    </div>
  );
}

// ── Step 2: Create account ────────────────────────────────────────────────────

function Step2CreateAccount({ prefill, onCreated }: {
  prefill: { email?: string; phone?: string };
  onCreated: (userId: string, user: FoundUser) => void;
}) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState(prefill.email ?? '');
  const [phone, setPhone] = useState(prefill.phone ?? '');
  const [line1, setLine1] = useState('');
  const [line2, setLine2] = useState('');
  const [city, setCity] = useState('');
  const [pincode, setPincode] = useState('');
  const [state, setState] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [pinLat, setPinLat] = useState<number | null>(null);
  const [pinLng, setPinLng] = useState<number | null>(null);
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number } | undefined>();
  const [pincodeLookupLoading, setPincodeLookupLoading] = useState(false);
  const [isIndianPincode, setIsIndianPincode] = useState<boolean | null>(null);

  useEffect(() => {
    if (pincode.length !== 6) {
      setIsIndianPincode(null);
      setPinLat(null);
      setPinLng(null);
      return;
    }
    setPincodeLookupLoading(true);
    fetch(`/api/geocode?pincode=${pincode}`)
      .then(r => r.json())
      .then(d => {
        if (d.lat && d.lng) {
          setMapCenter({ lat: d.lat, lng: d.lng });
          setPinLat(d.lat);
          setPinLng(d.lng);
          if (typeof d.city === 'string') setCity(d.city);
          if (typeof d.state === 'string') setState(d.state);
          setIsIndianPincode(true);
        } else {
          setIsIndianPincode(false);
          setPinLat(null);
          setPinLng(null);
        }
      })
      .catch(() => { setIsIndianPincode(false); setPinLat(null); setPinLng(null); })
      .finally(() => setPincodeLookupLoading(false));
  }, [pincode]);

  async function create() {
    if (!fullName.trim() || !email.trim() || !phone.trim() || !line1.trim() || !city.trim() || !state || !/^\d{6}$/.test(pincode)) {
      setErr('All fields except Landmark are required'); return;
    }
    if (pinLat === null || pinLng === null) {
      setErr('Pin drop on map is required'); return;
    }
    setLoading(true); setErr('');
    try {
      const res = await fetch('/api/admin/customers', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName, email, phone, line1, line2, city, pincode, state, lat: pinLat, lng: pinLng }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.error ?? 'Failed to create account'); return; }
      onCreated(data.userId, { id: data.userId, full_name: fullName, email, phone });
    } catch { setErr('Network error'); } finally { setLoading(false); }
  }

  return (
    <div className="space-y-3 mt-4">
      <p className="font-body text-[12px] text-stone">No account found. Fill in their details — a welcome email with their password will be sent automatically.</p>
      {err && <p className="font-body text-[11px] text-red-500">{err}</p>}
      <div><Lbl>Full Name</Lbl><input className={inputCls()} value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Priya Sharma" /></div>
      <div><Lbl>Email</Lbl><input className={inputCls()} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="priya@example.com" /></div>
      <div><Lbl>Mobile Number</Lbl><input className={inputCls()} value={phone} onChange={e => setPhone(e.target.value)} placeholder="9876543210" /></div>
      <div><Lbl>Street / Flat / Building</Lbl><input className={inputCls()} value={line1} onChange={e => setLine1(e.target.value)} placeholder="Flat 4B, Sunrise Apartments" /></div>
      <div><Lbl>Landmark <span className="font-normal text-stone/60">(optional)</span></Lbl><input className={inputCls()} value={line2} onChange={e => setLine2(e.target.value)} placeholder="Near HDFC Bank" /></div>
      <div><Lbl>City</Lbl><input className={inputCls()} value={city} onChange={e => setCity(e.target.value)} placeholder="Bengaluru" /></div>
      <div><Lbl>Pincode</Lbl><input className={inputCls()} value={pincode} onChange={e => setPincode(e.target.value)} placeholder="560001" maxLength={6} /></div>
      <div>
        <Lbl>State</Lbl>
        <select className={inputCls()} value={state} onChange={e => setState(e.target.value)}>
          <option value="">Select state</option>
          {STATES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div className="border border-dashed border-black/15 rounded-lg overflow-hidden">
        <div className="w-full flex items-center gap-2.5 px-4 py-3">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-stone shrink-0">
            <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
            <circle cx="12" cy="10" r="3"/>
          </svg>
          <span className="font-body text-[13px] text-ink font-medium">Pin exact location</span>
          <span className="font-body text-[11px] text-red-500 ml-1">(required)</span>
        </div>
        <div className="px-4 pb-4">
          <p className="font-body text-[12px] text-stone mb-3">
            {pincode.length !== 6
              ? 'Enter PIN code above to load the map.'
              : pincodeLookupLoading
                ? 'Loading map\u2026'
                : 'Drag the pin or tap to mark the exact delivery location.'}
          </p>
          {pincode.length === 6 && isIndianPincode !== false && (
            <MapPicker
              centerLat={mapCenter?.lat}
              centerLng={mapCenter?.lng}
              onChange={(lat, lng) => { setPinLat(lat); setPinLng(lng); }}
            />
          )}
          {pincode.length === 6 && isIndianPincode === false && (
            <p className="font-body text-[11px] text-red-500">Enter a valid Indian PIN code to load the map.</p>
          )}
        </div>
      </div>
      <button onClick={create} disabled={loading}
        className="w-full bg-ink text-white font-body text-[13px] font-bold rounded-lg py-2.5 hover:bg-black transition-colors disabled:opacity-50">
        {loading ? 'Creating account\u2026' : 'Create Account & Continue \u2192'}
      </button>
    </div>
  );
}

// ── Step 3: Create order or subscription ──────────────────────────────────────

function Step3Create({ userId, defaultMode, onSuccess }: {
  userId: string; defaultMode: Mode; onSuccess: () => void;
}) {
  const [mode, setMode] = useState<Mode>(defaultMode);
  const [bowls, setBowls] = useState<Bowl[] | null>(null);
  const [plans, setPlans] = useState<SubscriptionPlan[] | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');
  const [success, setSuccess] = useState('');

  // Order state
  const [orderItems, setOrderItems] = useState<OrderItem[]>([
    { bowlSlug: '', quantity: 1, customizations: [], presetOptions: { ...DEFAULT_BOWL_PRESET } },
  ]);
  const [orderCustomizeIdx, setOrderCustomizeIdx] = useState<number | null>(null);
  const [deliveryDate, setDeliveryDate] = useState('');
  const [deliverySlot, setDeliverySlot] = useState('');

  // Subscription state
  const [planId, setPlanId] = useState('');
  const [style, setStyle] = useState<'spread' | 'flexible'>('spread');
  const [subSlot, setSubSlot] = useState('');
  const [startDate, setStartDate] = useState('');
  const [dayConfigs, setDayConfigs] = useState<DayConfig[]>([
    {
      day: 'Mon',
      bowlId: '',
      quantity: 1,
      customizations: [],
      presetOptions: { ...DEFAULT_BOWL_PRESET },
      deliveryTimeSlot: '',
    },
  ]);
  const [subDayCustomizeIdx, setSubDayCustomizeIdx] = useState<number | null>(null);
  const [orderRepeatLineIdx, setOrderRepeatLineIdx] = useState<number | null>(null);
  const [subRepeatLineIdx, setSubRepeatLineIdx] = useState<number | null>(null);
  const [orderPreview, setOrderPreview] = useState<OrderQuotePreview | null>(null);
  const [subPreview, setSubPreview] = useState<SubQuotePreview | null>(null);
  const [orderQuoteLoading, setOrderQuoteLoading] = useState(false);
  const [subQuoteLoading, setSubQuoteLoading] = useState(false);
  const [orderPricingError, setOrderPricingError] = useState('');
  const [subPricingError, setSubPricingError] = useState('');

  const subscriptionPlansUi = useMemo(
    () => filterWeeklySpreadPlansForUI(plans ?? []),
    [plans],
  );
  const subscriptionBowls = useMemo(
    () => filterBowlsForSubscriptionPicker(bowls ?? []),
    [bowls],
  );
  const selectedPlan = useMemo(
    () => subscriptionPlansUi.find((p) => p.slug === planId) ?? (plans ?? []).find((p) => p.slug === planId),
    [subscriptionPlansUi, plans, planId],
  );
  const bowlsPerWeekCap = selectedPlan?.bowlsPerCycle ?? 0;
  const spreadTotal = useMemo(
    () => dayConfigs.reduce((a, d) => a + d.quantity, 0),
    [dayConfigs],
  );

  const canPreviewOrder =
    orderItems.length > 0 && orderItems.every((i) => i.bowlSlug && i.quantity >= 1);
  const timeSlotsOkForSpread =
    subSlot || (dayConfigs.length > 0 && dayConfigs.every((d) => d.deliveryTimeSlot));
  const canPreviewSubscription = Boolean(
    planId &&
      (style === 'flexible' ||
        (style === 'spread' &&
          bowlsPerWeekCap > 0 &&
          spreadTotal === bowlsPerWeekCap &&
          !dayConfigs.some((d) => !d.bowlId || d.quantity < 1) &&
          timeSlotsOkForSpread)),
  );

  useEffect(() => {
    setOrderPricingError('');
    setSubPricingError('');
  }, [mode]);

  useEffect(() => {
    setOrderCustomizeIdx(null);
    setSubDayCustomizeIdx(null);
    setOrderRepeatLineIdx(null);
    setSubRepeatLineIdx(null);
  }, [mode]);

  useEffect(() => {
    if (style !== 'spread') setSubDayCustomizeIdx(null);
    setSubRepeatLineIdx(null);
  }, [style]);

  useEffect(() => {
    Promise.all([
      fetch('/api/admin/catalog/bowls').then(r => r.json()),
      fetch('/api/admin/catalog/plans').then(r => r.json()),
    ]).then(([bd, pd]) => {
      setBowls(bd.bowls ?? []);
      setPlans(pd.plans ?? []);
    }).catch(() => setErr('Failed to load catalog')).finally(() => setCatalogLoading(false));
  }, []);

  useEffect(() => {
    if (mode !== 'order' || !userId) {
      setOrderPreview(null);
      return;
    }
    if (!canPreviewOrder) {
      setOrderPreview(null);
      setOrderQuoteLoading(false);
      return;
    }
    const ac = new AbortController();
    setOrderQuoteLoading(true);
    setOrderPricingError('');
    (async () => {
      try {
        const res = await fetch(`/api/admin/customers/${userId}/order-quote`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: orderItems }),
          signal: ac.signal,
        });
        const data = await res.json();
        if (ac.signal.aborted) return;
        if (!res.ok) {
          setOrderPricingError(typeof data.error === 'string' ? data.error : 'Unable to price order');
          setOrderPreview(null);
          return;
        }
        setOrderPreview(data);
        setOrderPricingError('');
      } catch (e) {
        if (ac.signal.aborted) return;
        setOrderPricingError('Network error');
        setOrderPreview(null);
      } finally {
        if (!ac.signal.aborted) setOrderQuoteLoading(false);
      }
    })();
    return () => {
      ac.abort();
    };
  }, [mode, userId, canPreviewOrder, orderItems]);

  useEffect(() => {
    if (mode !== 'subscription' || !userId) {
      setSubPreview(null);
      return;
    }
    if (!canPreviewSubscription) {
      setSubPreview(null);
      setSubQuoteLoading(false);
      return;
    }
    const ac = new AbortController();
    setSubQuoteLoading(true);
    setSubPricingError('');
    const body = {
      planId,
      deliveryStyle: style,
      deliveryTimeSlot: subSlot,
      startDate: startDate || undefined,
      dayConfigs:
        style === 'spread'
          ? dayConfigs.map((d) => ({
              day: d.day,
              bowlId: d.bowlId,
              quantity: d.quantity,
              customizations: encodePresetIntoCustomizations(d.customizations, d.presetOptions),
              deliveryTimeSlot: d.deliveryTimeSlot || undefined,
            }))
          : [],
    };
    (async () => {
      try {
        const res = await fetch(`/api/admin/customers/${userId}/subscription-quote`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: ac.signal,
        });
        const data = await res.json();
        if (ac.signal.aborted) return;
        if (!res.ok) {
          setSubPricingError(typeof data.error === 'string' ? data.error : 'Unable to price subscription');
          setSubPreview(null);
          return;
        }
        setSubPreview(data);
        setSubPricingError('');
      } catch (e) {
        if (ac.signal.aborted) return;
        setSubPricingError('Network error');
        setSubPreview(null);
      } finally {
        if (!ac.signal.aborted) setSubQuoteLoading(false);
      }
    })();
    return () => {
      ac.abort();
    };
  }, [
    mode,
    userId,
    canPreviewSubscription,
    planId,
    style,
    subSlot,
    startDate,
    dayConfigs,
  ]);

  async function submitOrder() {
    if (!deliveryDate || !deliverySlot) { setErr('Delivery date and time slot are required'); return; }
    if (orderItems.some(i => !i.bowlSlug || i.quantity < 1)) { setErr('Each item needs a bowl and qty \u2265 1'); return; }
    setSubmitting(true); setErr('');
    try {
      const res = await fetch(`/api/admin/customers/${userId}/orders`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deliveryDate, deliveryTimeSlot: deliverySlot, items: orderItems }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.error ?? 'Failed to create order'); return; }
      setSuccess(`Order created (\u20b9${data.total}). It will appear in the admin dashboard for approval.`);
      setTimeout(onSuccess, 2000);
    } catch { setErr('Network error'); } finally { setSubmitting(false); }
  }

  async function submitSubscription() {
    if (!planId) { setErr('Select a plan'); return; }
    if (style === 'spread' && planId && bowlsPerWeekCap > 0 && spreadTotal !== bowlsPerWeekCap) {
      setErr(`This plan needs exactly ${bowlsPerWeekCap} bowls per week (you have ${spreadTotal} assigned).`);
      return;
    }
    if (style === 'spread' && dayConfigs.some(d => !d.bowlId || d.quantity < 1)) {
      setErr('Each day config needs a bowl and qty \u2265 1'); return;
    }
    if (style === 'spread' && !subSlot && dayConfigs.some(d => !d.deliveryTimeSlot)) {
      setErr('Provide a global time slot or a per-day slot for each day'); return;
    }
    setSubmitting(true); setErr('');
    try {
      const res = await fetch(`/api/admin/customers/${userId}/subscriptions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId, deliveryStyle: style, deliveryTimeSlot: subSlot,
          startDate: startDate || undefined,
          dayConfigs: style === 'spread' ? dayConfigs.map((d) => ({
            day: d.day,
            bowlId: d.bowlId,
            quantity: d.quantity,
            customizations: encodePresetIntoCustomizations(d.customizations, d.presetOptions),
            deliveryTimeSlot: d.deliveryTimeSlot || undefined,
          })) : [],
        }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.error ?? 'Failed to create subscription'); return; }
      setSuccess(`Subscription created (\u20b9${data.totalAmountRs}/cycle). It will appear as pending in the admin dashboard.`);
      setTimeout(onSuccess, 2000);
    } catch { setErr('Network error'); } finally { setSubmitting(false); }
  }

  function decOrderLine(idx: number) {
    setOrderItems((p) => p.map((it, i) => (i === idx ? { ...it, quantity: Math.max(1, it.quantity - 1) } : it)));
  }

  function incOrderLine(idx: number) {
    const item = orderItems[idx];
    const b = findBowlByIdentifier(bowls ?? [], item.bowlSlug);
    if (!item.bowlSlug || !b) return;
    if (!bowlOffersCustomiseFlow(b)) {
      setOrderItems((p) => p.map((it, i) => (i === idx ? { ...it, quantity: it.quantity + 1 } : it)));
      return;
    }
    if (item.quantity >= 1) setOrderRepeatLineIdx(idx);
  }

  function decSubLine(idx: number) {
    setDayConfigs((p) => p.map((d, i) => (i === idx ? { ...d, quantity: Math.max(1, d.quantity - 1) } : d)));
  }

  function incSubLine(idx: number) {
    if (!planId || bowlsPerWeekCap <= 0) {
      setErr('Select a plan first to set the weekly bowl count.');
      return;
    }
    if (spreadTotal >= bowlsPerWeekCap) {
      setErr(`This plan only includes ${bowlsPerWeekCap} bowls per week.`);
      return;
    }
    setErr('');
    const dc = dayConfigs[idx];
    const b = findBowlByIdentifier(bowls ?? [], dc.bowlId);
    if (!dc.bowlId || !b) return;
    if (!bowlOffersCustomiseFlow(b)) {
      setDayConfigs((p) => p.map((d, i) => (i === idx ? { ...d, quantity: d.quantity + 1 } : d)));
      return;
    }
    if (dc.quantity >= 1) setSubRepeatLineIdx(idx);
  }

  if (catalogLoading) return <p className="font-body text-[13px] text-stone text-center py-8">Loading catalog…</p>;
  if (success) return <p className="font-body text-[13px] text-green-700 bg-green-50 rounded-xl p-4 text-center">{success}</p>;

  return (
    <div className="space-y-4">
      <div className="flex rounded-lg border border-black/10 overflow-hidden">
        {(['order', 'subscription'] as Mode[]).map(m => (
          <button key={m} onClick={() => { setMode(m); setErr(''); }}
            className={`flex-1 py-2 font-body text-[12px] font-bold uppercase tracking-wider transition-colors ${mode === m ? 'bg-ink text-white' : 'bg-white text-stone hover:bg-black/5'}`}>
            {m === 'order' ? 'One-Time Order' : 'Subscription'}
          </button>
        ))}
      </div>

      {err && <p className="font-body text-[11px] text-red-500">{err}</p>}

      {mode === 'order' && (
        <div className="space-y-3">
          {orderItems.map((item, idx) => {
            const bowl = findBowlByIdentifier(bowls ?? [], item.bowlSlug);
            return (
              <div key={idx} className="border border-black/10 rounded-xl p-3 space-y-2">
                <div className="flex flex-wrap items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <Lbl>Choose bowl</Lbl>
                    <BowlPicker
                      bowls={bowls ?? []}
                      selectedBowlId={item.bowlSlug}
                      onSelect={(slug) =>
                        setOrderItems((p) =>
                          p.map((it, i) =>
                            i === idx
                              ? {
                                  ...it,
                                  bowlSlug: slug,
                                  customizations: [],
                                  presetOptions: { ...DEFAULT_BOWL_PRESET },
                                }
                              : it,
                          ),
                        )
                      }
                    />
                  </div>
                  <div className="w-28 shrink-0">
                    <Lbl>Qty</Lbl>
                    <div className="flex items-center gap-1 bg-white border border-black/10 rounded-lg px-1 py-0.5">
                      <button
                        type="button"
                        onClick={() => decOrderLine(idx)}
                        className="w-8 h-8 flex items-center justify-center text-stone hover:text-ink rounded-md hover:bg-black/5"
                        aria-label="Decrease quantity"
                      >
                        −
                      </button>
                      <span className="font-body text-[13px] font-medium w-6 text-center tabular-nums">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => incOrderLine(idx)}
                        disabled={!item.bowlSlug}
                        className="w-8 h-8 flex items-center justify-center text-stone hover:text-ink rounded-md hover:bg-black/5 disabled:opacity-30 disabled:cursor-not-allowed"
                        aria-label="Increase quantity"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
                {item.bowlSlug && bowl && (
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setOrderCustomizeIdx(idx)}
                      className="font-body text-[12px] font-bold text-sage-dark border border-sage/30 rounded-lg px-3 py-1.5 hover:bg-sage/5"
                    >
                      Customise bowl
                    </button>
                    <p className="font-body text-[11px] text-stone flex-1 min-w-0">
                      {formatBowlCustomizationSummary(item.customizations, bowl, item.presetOptions)}
                    </p>
                  </div>
                )}
                {orderItems.length > 1 && (
                  <button
                    type="button"
                    onClick={() => {
                      setOrderItems((p) => p.filter((_, i) => i !== idx));
                      setOrderCustomizeIdx((c) => (c === idx ? null : c));
                    }}
                    className="font-body text-[11px] text-red-500 hover:underline"
                  >
                    Remove line
                  </button>
                )}
              </div>
            );
          })}
          <button
            type="button"
            onClick={() =>
              setOrderItems((p) => [
                ...p,
                { bowlSlug: '', quantity: 1, customizations: [], presetOptions: { ...DEFAULT_BOWL_PRESET } },
              ])
            }
            className="font-body text-[12px] text-stone hover:text-ink underline"
          >
            + Add bowl
          </button>
          <div><Lbl>Delivery Date</Lbl><input type="date" className={inputCls()} value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} /></div>
          <div>
            <Lbl>Delivery Time Slot</Lbl>
            <select className={inputCls()} value={deliverySlot} onChange={e => setDeliverySlot(e.target.value)}>
              <option value="">Select slot</option>
              {DELIVERY_TIME_SLOTS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          {orderQuoteLoading && (
            <p className="font-body text-[12px] text-stone">Calculating price from the customer&apos;s address…</p>
          )}
          {orderPricingError && (
            <p className="font-body text-[11px] text-amber-800 bg-amber-50 border border-amber-200/80 rounded-lg px-3 py-2">{orderPricingError}</p>
          )}
          {orderPreview && !orderQuoteLoading && (
            <div className="rounded-xl border border-black/10 bg-[#F9F8F6] p-4 space-y-2">
              <p className="font-body text-[11px] font-bold uppercase tracking-wider text-stone">Estimated total</p>
              <p className="font-body text-[10px] text-stone/80 -mt-1 mb-1">Same pricing as checkout: bowls, customisations, delivery to their saved address.</p>
              {orderPreview.lineItems.map((row, i) => (
                <div key={i} className="flex justify-between gap-3 text-[12px]">
                  <span className="text-stone font-body">{row.bowl_name} <span className="text-stone/70">×{row.quantity}</span></span>
                  <span className="text-ink font-medium shrink-0">{formatCurrency(row.total_price)}</span>
                </div>
              ))}
              <div className="border-t border-black/8 pt-2 mt-1 space-y-1.5">
                <div className="flex justify-between font-body text-[13px] text-stone">
                  <span>Subtotal</span>
                  <span>{formatCurrency(orderPreview.subtotal)}</span>
                </div>
                <div className="flex justify-between font-body text-[13px]">
                  <span className="text-stone">Delivery</span>
                  {orderPreview.deliveryFee === 0 ? (
                    <span className="font-bold text-sage-dark">Free</span>
                  ) : (
                    <span className="font-bold text-terracotta">+ {formatCurrency(orderPreview.deliveryFee)}</span>
                  )}
                </div>
                <div className="flex justify-between items-baseline pt-1">
                  <span className="font-body text-sm font-bold uppercase tracking-wider text-ink/80">Total</span>
                  <span className="font-display text-2xl text-sage-dark font-medium">{formatCurrency(orderPreview.total)}</span>
                </div>
              </div>
            </div>
          )}
          <button onClick={submitOrder} disabled={submitting}
            className="w-full bg-ink text-white font-body text-[13px] font-bold rounded-lg py-2.5 hover:bg-black transition-colors disabled:opacity-50">
            {submitting ? 'Creating order\u2026' : 'Create Order'}
          </button>
        </div>
      )}

      {mode === 'subscription' && (
        <div className="space-y-3">
          <div>
            <Lbl>Plan</Lbl>
            <select className={inputCls()} value={planId} onChange={e => { setPlanId(e.target.value); setErr(''); }}>
              <option value="">Select plan</option>
              {subscriptionPlansUi.map((p) => (
                <option key={p.slug} value={p.slug}>
                  {p.pricePerBowlPremium != null && p.pricePerBowlPremium > 0
                    ? `${p.name} — std ₹${p.pricePerBowl} / prem ₹${p.pricePerBowlPremium} per bowl`
                    : `${p.name} — ₹${p.pricePerBowl}/bowl`}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Lbl>Delivery Style</Lbl>
            <div className="flex rounded-lg border border-black/10 overflow-hidden">
              {(['spread', 'flexible'] as const).map(s => (
                <button key={s} onClick={() => setStyle(s)}
                  className={`flex-1 py-2 font-body text-[12px] capitalize transition-colors ${style === s ? 'bg-ink text-white' : 'bg-white text-stone hover:bg-black/5'}`}>{s}</button>
              ))}
            </div>
          </div>
          <div>
            <Lbl>{style === 'spread' ? 'Global Time Slot (or set per day below)' : 'Delivery Time Slot'}</Lbl>
            <select className={inputCls()} value={subSlot} onChange={e => setSubSlot(e.target.value)}>
              <option value="">Select slot</option>
              {DELIVERY_TIME_SLOTS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <Lbl>Start Date <span className="font-normal text-stone/60">(optional, defaults to tomorrow)</span></Lbl>
            <input type="date" className={inputCls()} value={startDate} onChange={e => setStartDate(e.target.value)} />
          </div>
          {style === 'spread' && (
            <div className="space-y-2">
              <div>
                <Lbl>Delivery days &amp; bowls</Lbl>
                <p className="font-body text-[11px] text-stone/80 -mt-0.5 mb-1">
                  Need two different bowls the same day? Add another row and pick the same weekday for each.
                </p>
                {planId && bowlsPerWeekCap > 0 && (
                  <p className="font-body text-[11px] font-medium text-ink/90 mb-1">
                    {spreadTotal} / {bowlsPerWeekCap} bowls this week
                    {spreadTotal > bowlsPerWeekCap ? ' — reduce quantities or remove rows' : ''}
                  </p>
                )}
              </div>
              {dayConfigs.map((dc, idx) => {
                const bowl = findBowlByIdentifier(bowls ?? [], dc.bowlId);
                return (
                  <div key={idx} className="border border-black/10 rounded-xl p-3 space-y-2">
                    <div className="flex flex-wrap items-start gap-2">
                      <div className="w-24 shrink-0">
                        <Lbl>Day</Lbl>
                        <select
                          className={inputCls()}
                          value={dc.day}
                          onChange={(e) =>
                            setDayConfigs((p) =>
                              p.map((d, i) => (i === idx ? { ...d, day: e.target.value } : d)),
                            )
                          }
                        >
                          {DAYS.map((d) => (
                            <option key={d} value={d}>
                              {d}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="flex-1 min-w-0">
                        <Lbl>Choose bowl</Lbl>
                        <BowlPicker
                          bowls={subscriptionBowls}
                          selectedBowlId={dc.bowlId}
                          onSelect={(slug) =>
                            setDayConfigs((p) =>
                              p.map((d, i) =>
                                i === idx
                                  ? {
                                      ...d,
                                      bowlId: slug,
                                      customizations: [],
                                      presetOptions: { ...DEFAULT_BOWL_PRESET },
                                    }
                                  : d,
                              ),
                            )
                          }
                        />
                      </div>
                      <div className="w-28 shrink-0">
                        <Lbl>Qty</Lbl>
                        <div className="flex items-center gap-1 bg-white border border-black/10 rounded-lg px-1 py-0.5">
                          <button
                            type="button"
                            onClick={() => decSubLine(idx)}
                            className="w-8 h-8 flex items-center justify-center text-stone hover:text-ink rounded-md hover:bg-black/5"
                            aria-label="Decrease quantity"
                          >
                            −
                          </button>
                          <span className="font-body text-[13px] font-medium w-6 text-center tabular-nums">
                            {dc.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => incSubLine(idx)}
                            disabled={
                              !dc.bowlId ||
                              !planId ||
                              (bowlsPerWeekCap > 0 && spreadTotal >= bowlsPerWeekCap)
                            }
                            className="w-8 h-8 flex items-center justify-center text-stone hover:text-ink rounded-md hover:bg-black/5 disabled:opacity-30 disabled:cursor-not-allowed"
                            aria-label="Increase quantity"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </div>
                    {dc.bowlId && bowl && (
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setSubDayCustomizeIdx(idx)}
                          className="font-body text-[12px] font-bold text-sage-dark border border-sage/30 rounded-lg px-3 py-1.5 hover:bg-sage/5"
                        >
                          Customise bowl
                        </button>
                        <p className="font-body text-[11px] text-stone flex-1 min-w-0">
                          {formatBowlCustomizationSummary(dc.customizations, bowl, dc.presetOptions)}
                        </p>
                      </div>
                    )}
                    <div>
                      <Lbl>
                        Per-day slot <span className="font-normal text-stone/60">(optional, overrides global)</span>
                      </Lbl>
                      <select
                        className={inputCls()}
                        value={dc.deliveryTimeSlot}
                        onChange={(e) =>
                          setDayConfigs((p) =>
                            p.map((d, i) => (i === idx ? { ...d, deliveryTimeSlot: e.target.value } : d)),
                          )
                        }
                      >
                        <option value="">Use global slot</option>
                        {DELIVERY_TIME_SLOTS.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </div>
                    {dayConfigs.length > 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          setDayConfigs((p) => p.filter((_, i) => i !== idx));
                          setSubDayCustomizeIdx((c) => (c === idx ? null : c));
                        }}
                        className="font-body text-[11px] text-red-500 hover:underline"
                      >
                        Remove row
                      </button>
                    )}
                  </div>
                );
              })}
              <button
                type="button"
                onClick={() => {
                  if (!planId) { setErr('Select a plan first.'); return; }
                  if (bowlsPerWeekCap > 0 && spreadTotal >= bowlsPerWeekCap) {
                    setErr(`This plan only includes ${bowlsPerWeekCap} bowls per week. Adjust quantities or pick a different plan.`);
                    return;
                  }
                  setErr('');
                  setDayConfigs((p) => [
                    ...p,
                    {
                      day: 'Mon',
                      bowlId: '',
                      quantity: 1,
                      customizations: [],
                      presetOptions: { ...DEFAULT_BOWL_PRESET },
                      deliveryTimeSlot: '',
                    },
                  ]);
                }}
                disabled={!planId || (bowlsPerWeekCap > 0 && spreadTotal >= bowlsPerWeekCap)}
                className={`font-body text-[12px] underline ${
                  !planId || (bowlsPerWeekCap > 0 && spreadTotal >= bowlsPerWeekCap)
                    ? 'text-stone/40 cursor-not-allowed no-underline'
                    : 'text-stone hover:text-ink'
                }`}
              >
                + Add day (or an extra bowl)
              </button>
            </div>
          )}
          {subQuoteLoading && (
            <p className="font-body text-[12px] text-stone">Calculating cycle total from the customer&apos;s address…</p>
          )}
          {subPricingError && (
            <p className="font-body text-[11px] text-amber-800 bg-amber-50 border border-amber-200/80 rounded-lg px-3 py-2">{subPricingError}</p>
          )}
          {subPreview && !subQuoteLoading && style !== 'flexible' && (
            <div className="rounded-xl border border-black/10 bg-[#F9F8F6] p-4 space-y-2">
              <p className="font-body text-[11px] font-bold uppercase tracking-wider text-stone">Estimated cycle total (spread plan)</p>
              <p className="font-body text-[10px] text-stone/80 -mt-1 mb-1">Bowl rates, ingredient extras, and weekly delivery — same as customer subscribe flow.</p>
              <div className="space-y-1.5 text-[12px]">
                <div className="flex justify-between text-stone">
                  <span>Base bowls (selected mix)</span>
                  <span className="text-ink font-medium">{formatCurrency(subPreview.baseBowlSubtotalRs)}</span>
                </div>
                {subPreview.totalIngredientExtrasRs > 0 && (
                  <div className="flex justify-between text-stone">
                    <span>Ingredient extras</span>
                    <span className="text-ink font-medium">+ {formatCurrency(subPreview.totalIngredientExtrasRs)}</span>
                  </div>
                )}
                {subPreview.weeklyDeliveryFeeRs > 0 && (
                  <div className="flex justify-between text-stone">
                    <span>Weekly delivery</span>
                    <span className="text-terracotta font-bold">+ {formatCurrency(subPreview.weeklyDeliveryFeeRs)}</span>
                  </div>
                )}
                {subPreview.weeklyDeliveryFeeRs === 0 && (
                  <div className="flex justify-between text-stone">
                    <span>Weekly delivery</span>
                    <span className="text-sage-dark font-bold">Free</span>
                  </div>
                )}
                <div className="border-t border-black/8 pt-2 flex justify-between items-baseline">
                  <span className="font-body text-sm font-bold uppercase tracking-wider text-ink/80">Total (per cycle)</span>
                  <span className="font-display text-2xl text-sage-dark font-medium">{formatCurrency(subPreview.totalAmountRs)}</span>
                </div>
              </div>
            </div>
          )}
          {subPreview && !subQuoteLoading && style === 'flexible' && (
            <div className="rounded-xl border border-black/10 bg-[#F9F8F6] p-4 space-y-2">
              <p className="font-body text-[11px] font-bold uppercase tracking-wider text-stone">Wallet load (flexible plan)</p>
              <p className="font-body text-[10px] text-stone/80 -mt-1 mb-1">Same formula as customer checkout: per-bowl load includes delivery in the total below.</p>
              <div className="space-y-1.5 text-[12px] text-stone">
                <div className="flex justify-between">
                  <span>Bowls + extras (allotted load)</span>
                  <span className="text-ink font-medium">{formatCurrency(subPreview.bowlsAmountRs)}</span>
                </div>
                {subPreview.weeklyDeliveryFeeRs > 0 && (
                  <div className="flex justify-between">
                    <span>Weekly delivery</span>
                    <span className="text-terracotta font-bold">+ {formatCurrency(subPreview.weeklyDeliveryFeeRs)}</span>
                  </div>
                )}
                <div className="border-t border-black/8 pt-2 flex justify-between items-baseline">
                  <span className="font-body text-sm font-bold uppercase tracking-wider text-ink/80">Total (per cycle)</span>
                  <span className="font-display text-2xl text-sage-dark font-medium">{formatCurrency(subPreview.totalAmountRs)}</span>
                </div>
              </div>
            </div>
          )}
          <button onClick={submitSubscription} disabled={submitting}
            className="w-full bg-ink text-white font-body text-[13px] font-bold rounded-lg py-2.5 hover:bg-black transition-colors disabled:opacity-50">
            {submitting ? 'Creating subscription\u2026' : 'Create Subscription'}
          </button>
        </div>
      )}

      {orderCustomizeIdx !== null && (() => {
        const item = orderItems[orderCustomizeIdx];
        const bowl = findBowlByIdentifier(bowls ?? [], item.bowlSlug);
        if (!item.bowlSlug || !bowl) return null;
        return (
          <CustomizationModal
            key={`order-${orderCustomizeIdx}`}
            bowl={bowl}
            mode="cart"
            initialCustomizations={item.customizations}
            initialPresetOptions={item.presetOptions}
            onClose={() => setOrderCustomizeIdx(null)}
            onConfirm={(customizations, presetOptions) => {
              setOrderItems((p) =>
                p.map((it, i) => (i === orderCustomizeIdx ? { ...it, customizations, presetOptions } : it)),
              );
              setOrderCustomizeIdx(null);
            }}
          />
        );
      })()}

      {subDayCustomizeIdx !== null && (() => {
        const dc = dayConfigs[subDayCustomizeIdx];
        const bowl = findBowlByIdentifier(bowls ?? [], dc.bowlId);
        if (!dc.bowlId || !bowl) return null;
        return (
          <CustomizationModal
            key={`sub-${subDayCustomizeIdx}`}
            bowl={bowl}
            mode="subscription"
            initialCustomizations={dc.customizations}
            initialPresetOptions={dc.presetOptions}
            onClose={() => setSubDayCustomizeIdx(null)}
            onConfirm={(customizations, presetOptions) => {
              setDayConfigs((p) =>
                p.map((d, i) => (i === subDayCustomizeIdx ? { ...d, customizations, presetOptions } : d)),
              );
              setSubDayCustomizeIdx(null);
            }}
          />
        );
      })()}

      {orderRepeatLineIdx !== null && (() => {
        const item = orderItems[orderRepeatLineIdx];
        const b = findBowlByIdentifier(bowls ?? [], item?.bowlSlug);
        if (!item?.bowlSlug || !b) return null;
        const idx = orderRepeatLineIdx;
        return (
          <RepeatCustomisationChoiceSheet
            productName={b.name}
            lastSummaryLine={formatBowlCustomizationSummary(item.customizations, b, item.presetOptions)}
            onClose={() => setOrderRepeatLineIdx(null)}
            onRepeatSame={() => {
              setOrderItems((p) =>
                p.map((it, i) => (i === idx ? { ...it, quantity: it.quantity + 1 } : it)),
              );
              setOrderRepeatLineIdx(null);
            }}
            onCustomiseDifferently={() => {
              setOrderItems((p) => {
                const n = [...p];
                const line = p[idx]!;
                n.splice(idx + 1, 0, {
                  bowlSlug: line.bowlSlug,
                  quantity: 1,
                  customizations: [],
                  presetOptions: { ...DEFAULT_BOWL_PRESET },
                });
                return n;
              });
              setOrderRepeatLineIdx(null);
              setOrderCustomizeIdx(idx + 1);
            }}
          />
        );
      })()}

      {subRepeatLineIdx !== null && (() => {
        const idx = subRepeatLineIdx;
        const dc = dayConfigs[idx];
        const b = findBowlByIdentifier(bowls ?? [], dc?.bowlId);
        if (!dc?.bowlId || !b) return null;
        return (
          <RepeatCustomisationChoiceSheet
            productName={b.name}
            lastSummaryLine={formatBowlCustomizationSummary(dc.customizations, b, dc.presetOptions)}
            onClose={() => setSubRepeatLineIdx(null)}
            onRepeatSame={() => {
              if (bowlsPerWeekCap > 0 && spreadTotal >= bowlsPerWeekCap) {
                setErr(`This plan only includes ${bowlsPerWeekCap} bowls per week.`);
                setSubRepeatLineIdx(null);
                return;
              }
              setDayConfigs((p) => p.map((d, i) => (i === idx ? { ...d, quantity: d.quantity + 1 } : d)));
              setSubRepeatLineIdx(null);
            }}
            onCustomiseDifferently={() => {
              if (bowlsPerWeekCap > 0 && spreadTotal >= bowlsPerWeekCap) {
                setErr(`This plan only includes ${bowlsPerWeekCap} bowls per week.`);
                setSubRepeatLineIdx(null);
                return;
              }
              setDayConfigs((p) => {
                const n = [...p];
                const cur = p[idx]!;
                n.splice(idx + 1, 0, {
                  day: cur.day,
                  bowlId: cur.bowlId,
                  quantity: 1,
                  customizations: [],
                  presetOptions: { ...DEFAULT_BOWL_PRESET },
                  deliveryTimeSlot: cur.deliveryTimeSlot,
                });
                return n;
              });
              setSubRepeatLineIdx(null);
              setSubDayCustomizeIdx(idx + 1);
            }}
          />
        );
      })()}
    </div>
  );
}

// ── Main Modal ────────────────────────────────────────────────────────────────

export default function CreateForCustomerModal({ open, defaultMode, onClose, onSuccess }: Props) {
  const [step, setStep] = useState<Step>(1);
  const [foundUser, setFoundUser] = useState<FoundUser | null>(null);
  const [prefill, setPrefill] = useState<{ email?: string; phone?: string }>({});
  const [showNewForm, setShowNewForm] = useState(false);
  const [targetUserId, setTargetUserId] = useState<string | null>(null);

  function reset() {
    setStep(1); setFoundUser(null); setShowNewForm(false);
    setTargetUserId(null); setPrefill({});
  }

  function handleClose() { reset(); onClose(); }

  function handleFound(user: FoundUser) { setFoundUser(user); setShowNewForm(false); }
  function handleNotFound(p: { email?: string; phone?: string }) { setPrefill(p); setShowNewForm(true); setFoundUser(null); }
  function handleConfirmExisting() { if (foundUser) { setTargetUserId(foundUser.id); setStep(3); } }
  function handleAccountCreated(userId: string, user: FoundUser) { setFoundUser(user); setTargetUserId(userId); setStep(3); }

  if (!open) return null;

  const stepLabels = ['Find Customer', 'Account Details', 'Create Order / Sub'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-black/10">
          <h2 className="font-display text-lg text-ink">Create for Customer</h2>
          <button onClick={handleClose} className="font-body text-xl text-stone hover:text-ink leading-none">&times;</button>
        </div>
        <div className="flex px-6 pt-3 pb-1 gap-1">
          {stepLabels.map((label, i) => {
            const s = (i + 1) as Step;
            const displayStep = step === 1 && showNewForm ? 2 : step;
            const active = displayStep === s;
            const done = displayStep > s;
            return (
              <div key={s} className="flex-1 text-center">
                <div className={`h-1 rounded-full mb-1 ${done ? 'bg-ink' : active ? 'bg-ink/40' : 'bg-black/10'}`} />
                <span className={`font-body text-[10px] uppercase tracking-wider ${active ? 'text-ink font-bold' : 'text-stone'}`}>{label}</span>
              </div>
            );
          })}
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {step === 1 && (
            <div className="space-y-4">
              <Step1Lookup onFound={handleFound} onNotFound={handleNotFound} />
              {foundUser && !showNewForm && <CustomerCard user={foundUser} onContinue={handleConfirmExisting} />}
              {showNewForm && <Step2CreateAccount prefill={prefill} onCreated={handleAccountCreated} />}
            </div>
          )}
          {step === 3 && targetUserId && (
            <Step3Create userId={targetUserId} defaultMode={defaultMode} onSuccess={onSuccess} />
          )}
        </div>
      </div>
    </div>
  );
}
