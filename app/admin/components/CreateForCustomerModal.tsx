'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { DELIVERY_TIME_SLOTS } from '@/lib/delivery-slots';
import type { Bowl, SubscriptionPlan, IngredientCustomization, BowlPresetOptions } from '@/types';

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
  deliveryTimeSlot: string;
}

type Step = 1 | 2 | 3;
type Mode = 'order' | 'subscription';

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
          {pincode.length === 6 && !pincodeLookupLoading && isIndianPincode !== false && (
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
    { bowlSlug: '', quantity: 1, customizations: [], presetOptions: { baseChoice: 'yogurt', oatsChoice: 'soaked', noSugar: false } },
  ]);
  const [deliveryDate, setDeliveryDate] = useState('');
  const [deliverySlot, setDeliverySlot] = useState('');

  // Subscription state
  const [planId, setPlanId] = useState('');
  const [style, setStyle] = useState<'spread' | 'flexible'>('spread');
  const [subSlot, setSubSlot] = useState('');
  const [startDate, setStartDate] = useState('');
  const [dayConfigs, setDayConfigs] = useState<DayConfig[]>([
    { day: 'Mon', bowlId: '', quantity: 1, customizations: [], deliveryTimeSlot: '' },
  ]);

  useEffect(() => {
    Promise.all([
      fetch('/api/admin/catalog/bowls').then(r => r.json()),
      fetch('/api/admin/catalog/plans').then(r => r.json()),
    ]).then(([bd, pd]) => {
      setBowls(bd.bowls ?? []);
      setPlans(pd.plans ?? []);
    }).catch(() => setErr('Failed to load catalog')).finally(() => setCatalogLoading(false));
  }, []);

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
          dayConfigs: style === 'spread' ? dayConfigs.map(d => ({
            day: d.day, bowlId: d.bowlId, quantity: d.quantity,
            customizations: d.customizations,
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

  if (catalogLoading) return <p className="font-body text-[13px] text-stone text-center py-8">Loading catalog\u2026</p>;
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
          {orderItems.map((item, idx) => (
            <div key={idx} className="border border-black/10 rounded-xl p-3 space-y-2">
              <div className="flex gap-2">
                <div className="flex-1">
                  <Lbl>Bowl</Lbl>
                  <select className={inputCls()} value={item.bowlSlug}
                    onChange={e => setOrderItems(p => p.map((it, i) => i === idx ? { ...it, bowlSlug: e.target.value } : it))}>
                    <option value="">Select bowl</option>
                    {(bowls ?? []).map(b => <option key={b.slug} value={b.slug}>{b.name}</option>)}
                  </select>
                </div>
                <div className="w-24">
                  <Lbl>Qty</Lbl>
                  <input type="number" min={1} className={inputCls()} value={item.quantity}
                    onChange={e => setOrderItems(p => p.map((it, i) => i === idx ? { ...it, quantity: Math.max(1, Number(e.target.value)) } : it))} />
                </div>
              </div>
              <div className="flex flex-wrap gap-3 text-[11px] font-body text-stone items-center">
                <span className="font-medium">Base:</span>
                <select className="border border-black/10 rounded px-1 py-0.5 text-[11px]"
                  value={item.presetOptions.baseChoice}
                  onChange={e => setOrderItems(p => p.map((it, i) => i === idx ? { ...it, presetOptions: { ...it.presetOptions, baseChoice: e.target.value as 'yogurt' | 'milk' } } : it))}>
                  <option value="yogurt">Yogurt</option><option value="milk">Milk</option>
                </select>
                <span className="font-medium">Oats:</span>
                <select className="border border-black/10 rounded px-1 py-0.5 text-[11px]"
                  value={item.presetOptions.oatsChoice}
                  onChange={e => setOrderItems(p => p.map((it, i) => i === idx ? { ...it, presetOptions: { ...it.presetOptions, oatsChoice: e.target.value as 'soaked' | 'roasted' } } : it))}>
                  <option value="soaked">Soaked</option><option value="roasted">Roasted</option>
                </select>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={item.presetOptions.noSugar}
                    onChange={e => setOrderItems(p => p.map((it, i) => i === idx ? { ...it, presetOptions: { ...it.presetOptions, noSugar: e.target.checked } } : it))} />
                  <span>No Sugar</span>
                </label>
              </div>
              {idx > 0 && (
                <button onClick={() => setOrderItems(p => p.filter((_, i) => i !== idx))}
                  className="font-body text-[11px] text-red-500 hover:underline">Remove</button>
              )}
            </div>
          ))}
          <button onClick={() => setOrderItems(p => [...p, { bowlSlug: '', quantity: 1, customizations: [], presetOptions: { baseChoice: 'yogurt', oatsChoice: 'soaked', noSugar: false } }])}
            className="font-body text-[12px] text-stone hover:text-ink underline">+ Add Bowl</button>
          <div><Lbl>Delivery Date</Lbl><input type="date" className={inputCls()} value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} /></div>
          <div>
            <Lbl>Delivery Time Slot</Lbl>
            <select className={inputCls()} value={deliverySlot} onChange={e => setDeliverySlot(e.target.value)}>
              <option value="">Select slot</option>
              {DELIVERY_TIME_SLOTS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
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
            <select className={inputCls()} value={planId} onChange={e => setPlanId(e.target.value)}>
              <option value="">Select plan</option>
              {(plans ?? []).map(p => <option key={p.slug} value={p.slug}>{p.name} \u2014 \u20b9{p.pricePerBowl}/bowl</option>)}
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
              <Lbl>Delivery Days &amp; Bowls</Lbl>
              {dayConfigs.map((dc, idx) => (
                <div key={idx} className="border border-black/10 rounded-xl p-3 space-y-2">
                  <div className="flex gap-2">
                    <div className="w-24">
                      <Lbl>Day</Lbl>
                      <select className={inputCls()} value={dc.day}
                        onChange={e => setDayConfigs(p => p.map((d, i) => i === idx ? { ...d, day: e.target.value } : d))}>
                        {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </div>
                    <div className="flex-1">
                      <Lbl>Bowl</Lbl>
                      <select className={inputCls()} value={dc.bowlId}
                        onChange={e => setDayConfigs(p => p.map((d, i) => i === idx ? { ...d, bowlId: e.target.value } : d))}>
                        <option value="">Select bowl</option>
                        {(bowls ?? []).map(b => <option key={b.slug} value={b.slug}>{b.name}</option>)}
                      </select>
                    </div>
                    <div className="w-20">
                      <Lbl>Qty</Lbl>
                      <input type="number" min={1} className={inputCls()} value={dc.quantity}
                        onChange={e => setDayConfigs(p => p.map((d, i) => i === idx ? { ...d, quantity: Math.max(1, Number(e.target.value)) } : d))} />
                    </div>
                  </div>
                  <div>
                    <Lbl>Per-Day Slot <span className="font-normal text-stone/60">(optional, overrides global)</span></Lbl>
                    <select className={inputCls()} value={dc.deliveryTimeSlot}
                      onChange={e => setDayConfigs(p => p.map((d, i) => i === idx ? { ...d, deliveryTimeSlot: e.target.value } : d))}>
                      <option value="">Use global slot</option>
                      {DELIVERY_TIME_SLOTS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  {idx > 0 && (
                    <button onClick={() => setDayConfigs(p => p.filter((_, i) => i !== idx))}
                      className="font-body text-[11px] text-red-500 hover:underline">Remove day</button>
                  )}
                </div>
              ))}
              <button onClick={() => setDayConfigs(p => [...p, { day: 'Mon', bowlId: '', quantity: 1, customizations: [], deliveryTimeSlot: '' }])}
                className="font-body text-[12px] text-stone hover:text-ink underline">+ Add Day</button>
            </div>
          )}
          <button onClick={submitSubscription} disabled={submitting}
            className="w-full bg-ink text-white font-body text-[13px] font-bold rounded-lg py-2.5 hover:bg-black transition-colors disabled:opacity-50">
            {submitting ? 'Creating subscription\u2026' : 'Create Subscription'}
          </button>
        </div>
      )}
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
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
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
