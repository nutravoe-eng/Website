'use client';

import { useEffect, useState, useCallback } from 'react';
import AdminTopNav from '../components/AdminTopNav';
import CreateForCustomerModal from '../components/CreateForCustomerModal';

interface DayConfig {
  id: string;
  day_of_week: string;
  bowl_slug: string;
  quantity: number;
  delivery_time_slot: string | null;
  customizations: { ingredientId: string; option: "default" | "remove" | "extra" }[];
  customization_cost_rs: number;
}

type CustomizationChoice = { ingredientId: string; option: "default" | "remove" | "extra" };

function flattenCustomizationPayload(customizations: unknown): CustomizationChoice[] {
  if (!Array.isArray(customizations)) return [];
  const first = customizations[0];
  const raw = Array.isArray(first)
    ? (customizations as unknown[]).flatMap((entry) => (Array.isArray(entry) ? entry : []))
    : customizations;
  return raw.filter(
    (item): item is CustomizationChoice =>
      Boolean(item) &&
      typeof item === "object" &&
      typeof (item as { ingredientId?: unknown }).ingredientId === "string" &&
      ["default", "remove", "extra"].includes(String((item as { option?: unknown }).option)),
  );
}

function normalizeCustomizations(
  customizations: unknown,
): CustomizationChoice[] {
  return flattenCustomizationPayload(customizations);
}

function readPresetChoices(customizations: { ingredientId: string; option: "default" | "remove" | "extra" }[]) {
  const baseChoice = customizations.some(c => c.ingredientId === "__preset_base_milk") ? "milk" : "yogurt";
  const oatsChoice = customizations.some(c => c.ingredientId === "__preset_oats_roasted") ? "roasted" : "soaked";
  const noSugar = customizations.some(c => c.ingredientId === "__preset_no_sugar");
  return { baseChoice, oatsChoice, noSugar };
}

function formatIngredientLabel(rawId: string): string {
  return rawId
    .replace(/^ingredient[-_]/i, "")
    .replace(/[-_]+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

interface AdminSubscription {
  id: string;
  style: string;
  status: string;
  start_date: string;
  period_end_date: string | null;
  delivery_time_slot: string | null;
  delivery_fee: number | null;
  total_amount_rs: number | null;
  payment_status: string;
  payment_reference: string | null;
  admin_notes: string | null;
  notes: string | null;
  created_at: string;
  deliveries_completed: number;
  users: { id: string; full_name: string; phone: string; email: string };
  subscription_plans: { name: string; slug: string; price_per_bowl: number; price_per_bowl_premium: number | null } | null;
  addresses: { line1: string; line2: string | null; city: string; pincode: string; lat: number; lng: number } | null;
  subscription_day_configs: DayConfig[];
}

export default function AdminSubscriptionsPage() {
  const [subs, setSubs]       = useState<AdminSubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [payModal, setPayModal]           = useState<AdminSubscription | null>(null);
  const [deliverModal, setDeliverModal]   = useState<AdminSubscription | null>(null);
  const [noteModal, setNoteModal]         = useState<AdminSubscription | null>(null);
  const [rejectModal, setRejectModal]     = useState<AdminSubscription | null>(null);
  const [upiRef, setUpiRef]               = useState('');
  const [noteText, setNoteText]           = useState('');
  const [deliverDate, setDeliverDate]     = useState('');
  const [deliverSlot, setDeliverSlot]     = useState('');
  const [saving, setSaving]               = useState(false);
  const [toast, setToast]                 = useState('');
  const [statusFilter, setStatusFilter]   = useState('pending');
  const [generatingOrders, setGeneratingOrders] = useState<string | null>(null);
  const [editModal, setEditModal]           = useState<AdminSubscription | null>(null);
  const [editConfigs, setEditConfigs]       = useState<{ id: string; bowl_slug: string; bowl_name: string; isPremium: boolean }[]>([]);
  const [availableBowls, setAvailableBowls] = useState<{ slug: string; name: string; isPremium: boolean }[]>([]);
  const [bowlsLoading, setBowlsLoading]     = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);

  function estimateDeliveryDebit(sub: AdminSubscription): {
    baseRs: number;
    extrasRs: number;
    deliveryRs: number;
    totalRs: number;
  } {
    const qty = sub.subscription_day_configs.reduce((sum, d) => sum + (d.quantity || 0), 0);
    const baseUnit = sub.subscription_plans?.price_per_bowl ?? 0;
    const baseRs = baseUnit * qty;
    const extrasRs = sub.subscription_day_configs.reduce((sum, d) => sum + (d.customization_cost_rs ?? 0), 0);
    const deliveryRs = sub.delivery_fee ?? 0;
    return { baseRs, extrasRs, deliveryRs, totalRs: baseRs + extrasRs + deliveryRs };
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }

  const fetchSubs = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ status: statusFilter });
      const res = await fetch(`/api/admin/subscriptions?${params}`);
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      const normalized: AdminSubscription[] = (data.subscriptions ?? []).map((sub: AdminSubscription) => ({
        ...sub,
        subscription_day_configs: (sub.subscription_day_configs ?? []).map((dc) => ({
          ...dc,
          customizations: normalizeCustomizations(dc.customizations),
        })),
      }));
      setSubs(normalized);
    } catch {
      setError('Could not load subscriptions.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { fetchSubs(); }, [fetchSubs]);

  async function handleMarkPaid() {
    if (!payModal) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/subscriptions/${payModal.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payment_status: 'paid',
          status: 'active',
          payment_reference: upiRef.trim() || null
        }),
      });
      if (!res.ok) throw new Error('Failed');
      if (statusFilter === 'pending') {
        // Approval activates the subscription — remove it from the pending list
        setSubs(prev => prev.filter(s => s.id !== payModal.id));
      } else {
        setSubs(prev => prev.map(s => s.id === payModal.id
          ? { ...s, payment_status: 'paid', payment_reference: upiRef.trim() || null }
          : s
        ));
      }
      showToast('Subscription payment confirmed and wallet loaded');
      setPayModal(null);
      setUpiRef('');
    } catch (err: any) {
      showToast(err instanceof Error ? err.message : 'Failed to update. Try again.');
    } finally {
      setSaving(false);
    }
  }

  async function handleRecordDelivery() {
    if (!deliverModal) return;
    setSaving(true);

    // Build bowls from day configs for selected date, or use all day configs
    // Determine base price based on database field
    const basePrice = deliverModal.subscription_plans?.price_per_bowl ?? 0;

    const bowls = deliverModal.subscription_day_configs.map(dc => ({
      bowl_slug:  dc.bowl_slug,
      bowl_name:  dc.bowl_slug,  // slug used as fallback name
      quantity:   dc.quantity,
      unit_price: basePrice,
      customization_unit_price: dc.customization_cost_rs ?? 0,
      customizations: dc.customizations ?? [],
    }));

    if (bowls.length === 0) {
      showToast('No bowl configuration found for this subscription.');
      setSaving(false);
      return;
    }

    try {
      const res = await fetch(`/api/admin/subscriptions/${deliverModal.id}/deliver`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          delivery_date: deliverDate || new Date().toISOString().split('T')[0],
          delivery_time_slot: deliverSlot || deliverModal.delivery_time_slot,
          bowls,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? 'Failed');
      }
      setSubs(prev => prev.map(s => s.id === deliverModal.id
        ? { ...s, deliveries_completed: s.deliveries_completed + 1 }
        : s
      ));
      showToast('Delivery recorded — wallet debited');
      setDeliverModal(null);
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Failed to record delivery.');
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveNote() {
    if (!noteModal) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/subscriptions/${noteModal.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ admin_notes: noteText.trim() }),
      });
      if (!res.ok) throw new Error('Failed');
      setSubs(prev => prev.map(s => s.id === noteModal.id ? { ...s, admin_notes: noteText.trim() } : s));
      showToast('Note saved');
      setNoteModal(null);
    } catch {
      showToast('Failed to save note.');
    } finally {
      setSaving(false);
    }
  }

  async function handleGenerateOrders(sub: AdminSubscription) {
    setGeneratingOrders(sub.id);
    try {
      const res = await fetch(`/api/admin/subscriptions/${sub.id}/generate-orders`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');

      const results: { day: string; date: string; success: boolean; error?: string }[] = data.results ?? [];
      const created = results.filter(r => r.success);
      const skipped = results.filter(r => !r.success && r.error?.includes('already recorded'));
      const failed  = results.filter(r => !r.success && !r.error?.includes('already recorded'));

      if (created.length > 0) {
        const dateList = created.map(r => `${r.day} ${r.date}`).join(', ');
        showToast(`Created ${created.length} order${created.length !== 1 ? 's' : ''}: ${dateList}`);
      } else if (skipped.length > 0) {
        const dateList = skipped.map(r => `${r.day.charAt(0).toUpperCase() + r.day.slice(1)} ${r.date}`).join(', ');
        showToast(`Orders already exist for: ${dateList} — find them in the Orders dashboard`);
      } else if (failed.length > 0) {
        showToast(`Failed: ${failed[0].error ?? 'Unknown error'}`);
      } else {
        showToast('No orders to generate');
      }
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Failed to generate orders.');
    } finally {
      setGeneratingOrders(null);
    }
  }

  async function handleReject() {
    if (!rejectModal) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/subscriptions/${rejectModal.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled' }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(typeof data?.error === 'string' ? data.error : 'Failed');
      }
      setSubs(prev => prev.filter(s => s.id !== rejectModal.id));
      const wr = data?.wallet_reversal as { reversed_rs?: number } | undefined;
      if (wr && typeof wr.reversed_rs === 'number') {
        if (wr.reversed_rs <= 0) {
          showToast('Subscription cancelled. No subscription wallet credit left to reverse (already spent).');
        } else {
          showToast(`Subscription cancelled. ₹${wr.reversed_rs.toLocaleString('en-IN')} reversed from wallet.`);
        }
      } else {
        showToast('Subscription rejected and cancelled');
      }
      setRejectModal(null);
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Failed to reject. Try again.');
    } finally {
      setSaving(false);
    }
  }

  async function openEditModal(sub: AdminSubscription) {
    setAvailableBowls([]);
    setEditModal(sub);
    setEditConfigs(
      sub.subscription_day_configs.map(dc => ({
        id: dc.id,
        bowl_slug: dc.bowl_slug,
        bowl_name: dc.bowl_slug,
        isPremium: false,
      }))
    );
    setBowlsLoading(true);
    try {
      const res = await fetch('/api/admin/bowls');
      if (res.ok) {
        const data = await res.json();
        const bowls: { slug: string; name: string; isPremium: boolean }[] = data.bowls ?? [];
        setAvailableBowls(bowls);
        // Update bowl_name and isPremium for each config using the resolved bowl data
        setEditConfigs(prev => prev.map(ec => {
          const match = bowls.find(b => b.slug === ec.bowl_slug);
          return match ? { ...ec, bowl_name: match.name, isPremium: match.isPremium } : ec;
        }));
      }
    } catch {
      // If fetch fails, dropdowns show current bowl slug as fallback
    } finally {
      setBowlsLoading(false);
    }
  }

  async function handleSaveBowls() {
    if (!editModal) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/subscriptions/${editModal.id}/bowls`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dayConfigs: editConfigs }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');

      // Merge updated subscription back into list
      setSubs(prev => prev.map(s => {
        if (s.id !== editModal.id) return s;
        const updatedSub = data.subscription;
        const updatedDayConfigs = (updatedSub.subscription_day_configs ?? []).map((dc: any) => ({
          ...dc,
          customizations: normalizeCustomizations(dc.customizations),
        }));
        return { ...s, ...updatedSub, subscription_day_configs: updatedDayConfigs };
      }));

      showToast('Bowls updated and subscription repriced');
      setEditModal(null);
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Failed to update bowls.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-ink text-white font-body text-sm px-5 py-3 rounded-full shadow-lg z-[200] animate-in fade-in slide-in-from-bottom-2">
          {toast}
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-2xl text-ink">Subscriptions</h1>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowCreateModal(true)}
            className="font-body text-[12px] font-bold uppercase tracking-wider text-white bg-ink border border-ink rounded-lg px-3 py-2 hover:bg-black transition-colors"
          >
            + Create for Customer
          </button>
          <AdminTopNav current="subscriptions" onRefresh={fetchSubs} />
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-6">
        {['pending', 'active', 'paused', 'cancelled', 'expired'].map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-4 py-2 rounded-full font-body text-[12px] font-bold uppercase tracking-wider transition-colors ${
              statusFilter === s
                ? 'bg-ink text-white'
                : 'bg-white border border-black/10 text-stone hover:text-ink'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {error && <p className="font-body text-sm text-terracotta mb-4">{error}</p>}

      {loading ? (
        <div className="bg-white rounded-xl border border-black/10 p-8 text-center">
          <p className="font-body text-sm text-stone animate-pulse">Loading subscriptions…</p>
        </div>
      ) : subs.length === 0 ? (
        <div className="bg-white rounded-xl border border-black/10 p-10 text-center">
          <p className="font-display text-xl italic text-stone">No {statusFilter} subscriptions.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {subs.map(sub => (
            <div key={sub.id} className="bg-white rounded-xl border border-black/10 p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                {/* Customer info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-body text-[13px] font-semibold text-ink">{sub.users.full_name}</p>
                    {sub.users.phone && (
                      <a
                        href={`https://wa.me/${sub.users.phone.replace(/\D/g, '')}`}
                        target="_blank" rel="noopener noreferrer"
                        className="text-[#25D366] hover:opacity-70 transition-opacity"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                      </a>
                    )}
                  </div>
                  <p className="font-body text-[11px] text-stone">{sub.users.phone || sub.users.email}</p>
                  {sub.addresses && (() => {
                    const addr = `${sub.addresses.line1}${sub.addresses.line2 ? ', ' + sub.addresses.line2 : ''}, ${sub.addresses.city} ${sub.addresses.pincode}`;
                    const mapsQuery =
                      typeof sub.addresses.lat === "number" && typeof sub.addresses.lng === "number"
                        ? `${sub.addresses.lat},${sub.addresses.lng}`
                        : addr;
                    const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsQuery)}`;
                    return (
                      <div className="mt-1 space-y-0.5">
                        <p className="font-body text-[11px] text-stone">{addr}</p>
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => { navigator.clipboard.writeText(addr); showToast('Address copied!'); }}
                            className="font-body text-[10px] text-stone hover:text-ink transition-colors flex items-center gap-1"
                          >
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                            Copy
                          </button>
                          <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
                            className="font-body text-[10px] text-terracotta hover:opacity-70 transition-opacity flex items-center gap-1"
                          >
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
                            Map
                          </a>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Plan info */}
                <div className="text-right shrink-0">
                  <div className="flex items-center gap-2 justify-end mb-1">
                    <p className="font-body text-[12px] font-semibold text-ink">
                      {sub.subscription_plans?.name ?? (sub.subscription_plans?.slug === 'daily' ? 'Daily' : sub.subscription_plans?.slug ?? 'Manual')}
                    </p>
                    {new Date(sub.start_date) > new Date(Date.now() + 86400000) && (
                      <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 font-body text-[9px] font-bold uppercase tracking-wider border border-blue-100">
                        Future Plan
                      </span>
                    )}
                  </div>
                  <p className="font-body text-[11px] text-stone capitalize">{sub.style} delivery</p>
                  {sub.delivery_time_slot && (
                    <p className="font-body text-[11px] text-stone">{sub.delivery_time_slot}</p>
                  )}
                </div>
              </div>

              {/* Stats row */}
              <div className="flex flex-wrap gap-4 mt-4 pt-4 border-t border-black/5">
                <Stat label="Amount" value={sub.total_amount_rs ? `₹${Number(sub.total_amount_rs).toLocaleString('en-IN')}` : '—'} />
                <Stat label="Deliveries" value={String(sub.deliveries_completed)} />
                <Stat 
                  label="Start Date" 
                  value={new Date(sub.start_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} 
                  highlight={new Date(sub.start_date) > new Date(Date.now() + 86400000)}
                />
                {sub.period_end_date && sub.status === 'active' && (() => {
                  const daysLeft = Math.ceil((new Date(sub.period_end_date).getTime() - Date.now()) / 86_400_000);
                  const color = daysLeft <= 0 ? 'text-terracotta bg-terracotta/10' : daysLeft <= 2 ? 'text-amber-700 bg-amber-50' : 'text-sage-dark bg-sage/10';
                  const label = daysLeft <= 0 ? 'Cycle Ended' : daysLeft === 1 ? 'Ends tomorrow' : `Ends in ${daysLeft}d`;
                  return (
                    <div>
                      <p className="font-body text-[10px] font-bold uppercase tracking-wider text-stone mb-1">Current Cycle</p>
                      <span className={`inline-flex items-center font-body text-[11px] font-bold px-2 py-0.5 rounded-full ${color}`}>
                        {label}
                      </span>
                    </div>
                  );
                })()}
                <div>
                  <p className="font-body text-[10px] font-bold uppercase tracking-wider text-stone mb-1">Delivery</p>
                  <SubscriptionStatusBadge status={sub.status} />
                </div>
                <div>
                  <p className="font-body text-[10px] font-bold uppercase tracking-wider text-stone mb-1">Payment</p>
                  <SubscriptionPaymentBadge status={sub.payment_status} />
                  {sub.payment_reference && (
                    <p className="font-body text-[10px] text-stone mt-0.5">{sub.payment_reference}</p>
                  )}
                </div>
              </div>

              {/* Day configs */}
              {sub.subscription_day_configs.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {sub.subscription_day_configs.map(dc => (
                    <span key={dc.id} className="bg-[#F9F8F6] border border-black/5 rounded-md px-2 py-1 font-body text-[11px] text-stone capitalize flex flex-col leading-tight">
                      <span className="font-semibold text-ink">{dc.day_of_week} — {dc.bowl_slug} ×{dc.quantity}</span>
                      {dc.customizations && (() => {
                        const choices = readPresetChoices(dc.customizations);
                        const removedIngredients = dc.customizations
                          .filter(c =>
                            c.option === 'remove' &&
                            typeof c.ingredientId === 'string' &&
                            !c.ingredientId.startsWith("__preset_")
                          )
                          .map(c => formatIngredientLabel(c.ingredientId));
                        const addedIngredients = dc.customizations
                          .filter(c =>
                            c.option === 'extra' &&
                            typeof c.ingredientId === 'string' &&
                            !c.ingredientId.startsWith("__preset_")
                          )
                          .map(c => formatIngredientLabel(c.ingredientId));
                        return (
                          <>
                            <span className="text-[10px] text-stone/80 font-medium">
                              Base: {choices.baseChoice === "milk" ? "Milk" : "Yogurt"}
                            </span>
                            <span className="text-[10px] text-stone/80 font-medium">
                              Oats: {choices.oatsChoice === "roasted" ? "Roasted" : "Soaked"}
                            </span>
                            <span className={`text-[10px] font-medium ${choices.noSugar ? "text-terracotta/80" : "text-stone/80"}`}>
                              {choices.noSugar ? "No sugar" : "Regular sugar"}
                            </span>
                            {removedIngredients.length > 0 && (
                              <span className="text-[10px] text-terracotta/80 font-medium">
                                Removed: {removedIngredients.join(', ')}
                              </span>
                            )}
                            {addedIngredients.length > 0 && (
                              <span className="text-[10px] text-sage-dark font-medium">
                                Added: {addedIngredients.join(', ')}
                              </span>
                            )}
                          </>
                        );
                      })()}
                      {dc.delivery_time_slot && (
                        <span className="text-stone/70 text-[10px]">{dc.delivery_time_slot}</span>
                      )}
                    </span>
                  ))}
                </div>
              )}

              {/* Customer note */}
              {sub.notes && (
                <p className="font-body text-[11px] text-terracotta/80 mt-3 italic">💬 Customer: {sub.notes}</p>
              )}

              {/* Admin note */}
              {sub.admin_notes && (
                <p className="font-body text-[11px] text-stone/70 mt-1 italic">📝 {sub.admin_notes}</p>
              )}

              {/* Actions */}
              <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-black/5">
                {sub.payment_status !== 'paid' && sub.status === 'pending' && (
                  <Btn color="terracotta" onClick={() => { setPayModal(sub); setUpiRef(''); }}>
                    Approve & Mark Paid
                  </Btn>
                )}
                {sub.payment_status !== 'paid' && sub.status === 'active' && (
                  <Btn color="terracotta" onClick={() => { setPayModal(sub); setUpiRef(''); }}>
                    Mark Paid
                  </Btn>
                )}
                {sub.payment_status === 'paid' && sub.status === 'active' && (
                  <Btn color="sage" onClick={() => {
                    setDeliverModal(sub);
                    setDeliverDate(new Date().toISOString().split('T')[0]);
                    setDeliverSlot(sub.delivery_time_slot ?? '');
                  }}>
                    Record Delivery
                  </Btn>
                )}
                {sub.style === 'spread' && sub.status === 'active' && sub.payment_status === 'paid' && (
                  <button
                    onClick={() => handleGenerateOrders(sub)}
                    disabled={generatingOrders === sub.id}
                    className="border border-blue-200 text-blue-600 hover:bg-blue-50 disabled:opacity-40 rounded-lg px-4 py-2 font-body text-[12px] font-bold transition-colors"
                  >
                    {generatingOrders === sub.id ? 'Generating…' : 'Generate Orders'}
                  </button>
                )}
                <Btn color="stone" onClick={() => { setNoteModal(sub); setNoteText(sub.admin_notes ?? ''); }}>
                  {sub.admin_notes ? 'Edit Note' : 'Add Note'}
                </Btn>
                <Btn color="stone" onClick={() => openEditModal(sub)}>
                  Edit Bowls
                </Btn>
                {(sub.status === 'pending' || sub.status === 'active') && (
                  <Btn color="red" onClick={() => setRejectModal(sub)}>
                    Reject
                  </Btn>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Mark Paid Modal */}
      {payModal && (
        <Modal onClose={() => setPayModal(null)} title="Confirm Subscription Payment">
          <div className="space-y-4">
            <div className="bg-[#F9F8F6] rounded-lg p-4">
              <p className="font-body text-[12px] text-stone">Customer</p>
              <p className="font-body text-sm font-semibold text-ink">{payModal.users.full_name}</p>
              <p className="font-body text-[12px] text-stone mt-2">Plan Amount</p>
              <p className="font-display text-2xl text-ink">
                {payModal.total_amount_rs ? `₹${Number(payModal.total_amount_rs).toLocaleString('en-IN')}` : '—'}
              </p>
              <p className="font-body text-[11px] text-stone mt-1">This amount will be loaded to their wallet for the active billing cycle.</p>
            </div>
            <div>
              <label className="block font-body text-[11px] font-bold uppercase tracking-wider text-stone mb-2">
                UPI Reference / Note (optional)
              </label>
              <input
                type="text"
                value={upiRef}
                onChange={e => setUpiRef(e.target.value)}
                className="w-full border border-black/10 rounded-lg px-4 py-3 font-body text-sm text-ink bg-[#F9F8F6] focus:outline-none focus:ring-2 focus:ring-sage/40"
                placeholder="e.g. UPI ref 123456"
              />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setPayModal(null)} className="flex-1 border border-black/10 rounded-lg py-3 font-body text-sm font-bold text-stone hover:bg-black/5 transition-colors">
                Cancel
              </button>
              <button onClick={handleMarkPaid} disabled={saving} className="flex-1 bg-sage hover:bg-sage/80 disabled:bg-sage/30 text-white rounded-lg py-3 font-body text-sm font-bold transition-colors">
                {saving ? 'Saving…' : 'Confirm & Load Wallet'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Record Delivery Modal */}
      {deliverModal && (
        <Modal onClose={() => setDeliverModal(null)} title="Record Delivery">
          <div className="space-y-4">
            <p className="font-body text-[12px] text-stone">
              {(() => {
                const estimate = estimateDeliveryDebit(deliverModal);
                return (
                  <>
                    Recording delivery for <strong className="text-ink">{deliverModal.users.full_name}</strong>.
                    Estimated wallet debit: <strong className="text-ink">₹{estimate.totalRs.toLocaleString('en-IN')}</strong>
                    {' '}(
                    base ₹{estimate.baseRs.toLocaleString('en-IN')}
                    {estimate.extrasRs > 0 ? ` + extras ₹${estimate.extrasRs.toLocaleString('en-IN')}` : ''}
                    {estimate.deliveryRs > 0 ? ` + delivery ₹${estimate.deliveryRs.toLocaleString('en-IN')}` : ''}
                    ).
                  </>
                );
              })()}
            </p>
            <div>
              <label className="block font-body text-[11px] font-bold uppercase tracking-wider text-stone mb-2">Delivery Date</label>
              <input
                type="date"
                value={deliverDate}
                onChange={e => setDeliverDate(e.target.value)}
                className="w-full border border-black/10 rounded-lg px-4 py-3 font-body text-sm text-ink bg-[#F9F8F6] focus:outline-none focus:ring-2 focus:ring-sage/40"
              />
            </div>
            <div>
              <label className="block font-body text-[11px] font-bold uppercase tracking-wider text-stone mb-2">Time Slot (optional)</label>
              <input
                type="text"
                value={deliverSlot}
                onChange={e => setDeliverSlot(e.target.value)}
                className="w-full border border-black/10 rounded-lg px-4 py-3 font-body text-sm text-ink bg-[#F9F8F6] focus:outline-none focus:ring-2 focus:ring-sage/40"
                placeholder="e.g. 8:00 AM – 9:00 AM"
              />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setDeliverModal(null)} className="flex-1 border border-black/10 rounded-lg py-3 font-body text-sm font-bold text-stone hover:bg-black/5 transition-colors">
                Cancel
              </button>
              <button onClick={handleRecordDelivery} disabled={saving} className="flex-1 bg-terracotta hover:bg-[#D55F43] disabled:bg-terracotta/30 text-white rounded-lg py-3 font-body text-sm font-bold transition-colors">
                {saving ? 'Recording…' : 'Record Delivery'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Reject Modal */}
      {rejectModal && (
        <Modal onClose={() => setRejectModal(null)} title="Reject Subscription">
          <div className="space-y-4">
            <div className="bg-terracotta/5 border border-terracotta/20 rounded-lg p-4">
              <p className="font-body text-[13px] text-ink font-semibold">{rejectModal.users.full_name}</p>
              <p className="font-body text-[12px] text-stone">{rejectModal.subscription_plans?.name ?? rejectModal.style} · {rejectModal.status}</p>
            </div>
            <p className="font-body text-[13px] text-stone leading-relaxed">
              This will cancel the subscription. The customer will see it as cancelled on their account. This cannot be undone from here.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setRejectModal(null)} className="flex-1 border border-black/10 rounded-lg py-3 font-body text-sm font-bold text-stone hover:bg-black/5 transition-colors">
                Go Back
              </button>
              <button onClick={handleReject} disabled={saving} className="flex-1 bg-terracotta hover:bg-[#D55F43] disabled:bg-terracotta/30 text-white rounded-lg py-3 font-body text-sm font-bold transition-colors">
                {saving ? 'Rejecting…' : 'Reject & Cancel'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Note Modal */}
      {noteModal && (
        <Modal onClose={() => setNoteModal(null)} title="Admin Note">
          <div className="space-y-4">
            <p className="font-body text-[12px] text-stone">
              Note for <strong className="text-ink">{noteModal.users.full_name}</strong>
            </p>
            <textarea
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
              rows={3}
              className="w-full border border-black/10 rounded-lg px-4 py-3 font-body text-sm text-ink bg-[#F9F8F6] focus:outline-none focus:ring-2 focus:ring-sage/40 resize-none"
              placeholder="Internal note…"
            />
            <div className="flex gap-3">
              <button onClick={() => setNoteModal(null)} className="flex-1 border border-black/10 rounded-lg py-3 font-body text-sm font-bold text-stone hover:bg-black/5 transition-colors">
                Cancel
              </button>
              <button onClick={handleSaveNote} disabled={saving} className="flex-1 bg-ink hover:bg-ink/80 disabled:bg-ink/30 text-white rounded-lg py-3 font-body text-sm font-bold transition-colors">
                {saving ? 'Saving…' : 'Save Note'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Edit Bowls Modal */}
      {editModal && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-ink/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-display text-xl text-ink">Edit Bowls</h3>
              <button onClick={() => setEditModal(null)} className="w-8 h-8 flex items-center justify-center rounded-full bg-black/5 hover:bg-black/10 text-stone transition-colors">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
              </button>
            </div>

            <div className="space-y-4">
              <p className="font-body text-[12px] text-stone">
                Editing bowls for <strong className="text-ink">{editModal.users.full_name}</strong>.
                {editModal.payment_status === 'paid' && ' Wallet balance will be adjusted automatically.'}
              </p>

              {bowlsLoading ? (
                <p className="font-body text-sm text-stone animate-pulse">Loading bowls…</p>
              ) : (
                <div className="space-y-3">
                  {editConfigs.map((ec, idx) => {
                    const originalConfig = editModal.subscription_day_configs[idx];
                    return (
                      <div key={ec.id} className="flex items-center gap-3">
                        <span className="font-body text-[11px] font-bold uppercase tracking-wider text-stone w-8 shrink-0 capitalize">
                          {originalConfig?.day_of_week ?? '—'}
                        </span>
                        <span className="font-body text-[11px] text-stone shrink-0">
                          ×{originalConfig?.quantity ?? 1}
                        </span>
                        <select
                          value={ec.bowl_slug}
                          onChange={e => {
                            const chosen = availableBowls.find(b => b.slug === e.target.value);
                            setEditConfigs(prev => prev.map((c, i) =>
                              i === idx
                                ? { ...c, bowl_slug: e.target.value, bowl_name: chosen?.name ?? e.target.value, isPremium: chosen?.isPremium ?? false }
                                : c
                            ));
                          }}
                          className="flex-1 border border-black/10 rounded-lg px-3 py-2 font-body text-sm text-ink bg-[#F9F8F6] focus:outline-none focus:ring-2 focus:ring-sage/40"
                        >
                          {availableBowls.length === 0 && (
                            <option value={ec.bowl_slug}>{ec.bowl_slug}</option>
                          )}
                          {availableBowls.map(b => (
                            <option key={b.slug} value={b.slug}>{b.name}</option>
                          ))}
                        </select>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Price preview */}
              {(() => {
                const currentTotal = editModal.total_amount_rs ?? 0;
                const standardPrice = editModal.subscription_plans?.price_per_bowl ?? 0;
                const premiumPrice = editModal.subscription_plans?.price_per_bowl_premium ?? standardPrice;

                // Original bowl amounts from the saved subscription state
                const originalBowlsAmount = editModal.subscription_day_configs.reduce((sum, dc) => {
                  const b = availableBowls.find(bowl => bowl.slug === dc.bowl_slug);
                  return sum + (b?.isPremium ? premiumPrice : standardPrice) * (dc.quantity ?? 1);
                }, 0);

                // New bowl amounts from editConfigs (isPremium set when admin selects a bowl)
                const newBowlsAmount = editConfigs.reduce((sum, ec, idx) => {
                  const qty = editModal.subscription_day_configs[idx]?.quantity ?? 1;
                  return sum + (ec.isPremium ? premiumPrice : standardPrice) * qty;
                }, 0);

                // Only bowl prices change — delivery and extras are unchanged
                const delta = newBowlsAmount - originalBowlsAmount;
                const estimatedNewTotal = currentTotal + delta;
                return (
                  <div className="bg-[#F9F8F6] rounded-lg p-3 font-body text-[12px]">
                    <div className="flex justify-between text-stone">
                      <span>Current total</span>
                      <span>₹{Number(currentTotal).toLocaleString('en-IN')}</span>
                    </div>
                    <div className="flex justify-between text-ink font-semibold mt-1">
                      <span>Estimated new total</span>
                      <span>₹{estimatedNewTotal.toLocaleString('en-IN')}</span>
                    </div>
                    {editModal.payment_status === 'paid' && delta !== 0 && (
                      <p className={`mt-2 text-[11px] font-medium ${delta > 0 ? 'text-sage-dark' : 'text-terracotta'}`}>
                        {delta > 0
                          ? `₹${Math.abs(delta).toLocaleString('en-IN')} will be credited to wallet`
                          : `₹${Math.abs(delta).toLocaleString('en-IN')} will be debited from wallet`}
                      </p>
                    )}
                  </div>
                );
              })()}

              <div className="flex gap-3">
                <button
                  onClick={() => setEditModal(null)}
                  className="flex-1 border border-black/10 rounded-lg py-3 font-body text-sm font-bold text-stone hover:bg-black/5 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveBowls}
                  disabled={saving || bowlsLoading}
                  className="flex-1 bg-ink hover:bg-ink/80 disabled:bg-ink/30 text-white rounded-lg py-3 font-body text-sm font-bold transition-colors"
                >
                  {saving ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <CreateForCustomerModal
        open={showCreateModal}
        defaultMode="subscription"
        onClose={() => setShowCreateModal(false)}
        onSuccess={() => { setShowCreateModal(false); fetchSubs(); }}
      />
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <p className="font-body text-[10px] font-bold uppercase tracking-wider text-stone mb-0.5">{label}</p>
      <p className={`font-body text-sm font-semibold transition-colors ${highlight ? 'text-blue-600' : 'text-ink'}`}>{value}</p>
    </div>
  );
}

function SubscriptionPaymentBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string }> = {
    pending: { label: 'Pending', className: 'bg-amber-50 text-amber-700' },
    paid: { label: 'Paid', className: 'bg-sage/10 text-sage-dark' },
    failed: { label: 'Failed', className: 'bg-red-50 text-red-600' },
    refunded: { label: 'Refunded', className: 'bg-sage/10 text-sage-dark' },
    pending_refund: { label: 'Refund Pending', className: 'bg-amber-50 text-amber-700' },
    refund_initiated: { label: 'Refund Initiated', className: 'bg-amber-50 text-amber-700' },
    refund_complete: { label: 'Refund Complete', className: 'bg-sage/10 text-sage-dark' },
  };
  const c = config[status] ?? { label: status, className: 'bg-stone/10 text-stone' };
  return (
    <span className={`inline-flex items-center font-body text-[11px] font-bold px-2 py-0.5 rounded-full ${c.className}`}>
      {c.label}
    </span>
  );
}

function SubscriptionStatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string }> = {
    pending: { label: 'Pending', className: 'bg-amber-50 text-amber-700' },
    active: { label: 'Active', className: 'bg-sage/10 text-sage-dark' },
    paused: { label: 'Paused', className: 'bg-amber-50 text-amber-700' },
    cancelled: { label: 'Cancelled', className: 'bg-red-50 text-red-600' },
    expired: { label: 'Expired', className: 'bg-red-50 text-red-600' },
    completed: { label: 'Completed', className: 'bg-sage/10 text-sage-dark' },
  };
  const c = config[status] ?? { label: status, className: 'bg-stone/10 text-stone' };
  return (
    <span className={`inline-flex items-center font-body text-[11px] font-bold px-2 py-0.5 rounded-full ${c.className}`}>
      {c.label}
    </span>
  );
}

function Btn({ children, onClick, color }: {
  children: React.ReactNode; onClick: () => void;
  color: 'terracotta' | 'sage' | 'stone' | 'red';
}) {
  const styles = {
    terracotta: 'border-terracotta/30 text-terracotta hover:bg-terracotta/5',
    sage:       'border-sage/30 text-sage-dark hover:bg-sage/5',
    stone:      'border-black/10 text-stone hover:bg-black/5',
    red:        'border-red-200 text-red-600 hover:bg-red-50',
  };
  return (
    <button onClick={onClick} className={`border rounded-lg px-4 py-2 font-body text-[12px] font-bold transition-colors ${styles[color]}`}>
      {children}
    </button>
  );
}

function Modal({ children, onClose, title }: { children: React.ReactNode; onClose: () => void; title: string }) {
  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-ink/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-display text-xl text-ink">{title}</h3>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-black/5 hover:bg-black/10 text-stone transition-colors">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
