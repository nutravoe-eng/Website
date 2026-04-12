'use client';

import { useEffect, useState, useCallback } from 'react';

interface DayConfig {
  id: string;
  day_of_week: string;
  bowl_slug: string;
  quantity: number;
  delivery_time_slot: string | null;
  customizations: { ingredientId: string; option: "default" | "remove" | "extra" }[];
  customization_cost_rs: number;
}

interface AdminSubscription {
  id: string;
  style: string;
  status: string;
  start_date: string;
  period_end_date: string | null;
  delivery_time_slot: string | null;
  total_amount_rs: number | null;
  payment_status: string;
  payment_reference: string | null;
  admin_notes: string | null;
  notes: string | null;
  created_at: string;
  deliveries_completed: number;
  users: { id: string; full_name: string; phone: string; email: string };
  subscription_plans: { name: string; slug: string; price_per_bowl: number } | null;
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
      setSubs(data.subscriptions ?? []);
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
        <button
          onClick={fetchSubs}
          className="font-body text-[12px] font-bold uppercase tracking-wider text-stone hover:text-ink border border-black/10 rounded-lg px-3 py-2 hover:bg-black/5 transition-colors"
        >
          Refresh
        </button>
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
                    const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`;
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
                  <p className="font-body text-[10px] font-bold uppercase tracking-wider text-stone mb-1">Payment</p>
                  {sub.payment_status === 'paid' ? (
                    <span className="inline-flex items-center gap-1 bg-sage/10 text-sage-dark font-body text-[11px] font-bold px-2 py-0.5 rounded-full">
                      ✓ Paid
                    </span>
                  ) : (
                    <span className="inline-flex items-center bg-terracotta/10 text-terracotta font-body text-[11px] font-bold px-2 py-0.5 rounded-full">
                      Pending
                    </span>
                  )}
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
                      {dc.customizations && dc.customizations.length > 0 && (
                        <span className="text-[10px] text-terracotta/80 font-medium">
                          {dc.customizations.filter(c => c.option !== 'default').map(c => `${c.option === 'remove' ? '-' : '+'}${c.ingredientId}`).join(', ')}
                        </span>
                      )}
                      {dc.delivery_time_slot && (
                        <span className="text-stone/70 text-[10px]">{dc.delivery_time_slot}</span>
                      )}
                    </span>
                  ))}
                </div>
              )}

              {/* Admin note */}
              {sub.admin_notes && (
                <p className="font-body text-[11px] text-stone/70 mt-3 italic">📝 {sub.admin_notes}</p>
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
              Recording delivery for <strong className="text-ink">{deliverModal.users.full_name}</strong>.
              Wallet will be debited for ₹{deliverModal.subscription_plans
                ? (deliverModal.subscription_plans.price_per_bowl
                   * deliverModal.subscription_day_configs.reduce((s, d) => s + d.quantity, 0)
                   + deliverModal.subscription_day_configs.reduce((s, d) => s + (d.customization_cost_rs ?? 0), 0)
                  ).toLocaleString('en-IN')
                : '—'}.
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
