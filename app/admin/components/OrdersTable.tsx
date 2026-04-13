'use client';

import { useState, useMemo } from 'react';

export interface AdminOrder {
  id: string;
  order_type: 'one_time' | 'subscription';
  status: string;
  payment_status: string;
  payment_method: string;
  payment_reference: string | null;
  delivery_date: string;
  delivery_time_slot: string | null;
  delivery_fee: number;
  subtotal: number;
  total: number;
  notes: string | null;
  admin_notes: string | null;
  created_at: string;
  users: { id: string; full_name: string; phone: string; email: string };
  addresses: { line1: string; line2: string | null; city: string; pincode: string } | null;
  order_items: { id: string; bowl_name: string; quantity: number; unit_price: number; total_price: number; customizations: { removed?: string[]; added?: string[] } | null }[];
}

interface Props {
  orders: AdminOrder[];
  loading: boolean;
  onOrderUpdated: (updated: Partial<AdminOrder> & { id: string }) => void;
  showDate?: boolean;
}

export default function OrdersTable({ orders, loading, onOrderUpdated, showDate = true }: Props) {
  const [payModal, setPayModal]     = useState<AdminOrder | null>(null);
  const [noteModal, setNoteModal]   = useState<AdminOrder | null>(null);
  const [rescheduleModal, setRescheduleModal] = useState<AdminOrder | null>(null);
  const [cancelRefundModal, setCancelRefundModal] = useState<AdminOrder | null>(null);
  const [manageRefundModal, setManageRefundModal] = useState<AdminOrder | null>(null);
  const [refundStatus, setRefundStatus] = useState('pending_refund');
  const [upiRef, setUpiRef]         = useState('');
  const [noteText, setNoteText]     = useState('');
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleSlot, setRescheduleSlot] = useState('');
  const [saving, setSaving]         = useState(false);
  const [toast, setToast]           = useState('');
  const [sortByTime, setSortByTime] = useState(false);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }

  function parseTimeSlotToMinutes(slot: string | null): number {
    if (!slot) return 9999;
    // e.g. "7:00 AM - 8:00 AM" → take first part "7:00 AM"
    const part = slot.split('-')[0].trim();
    const match = part.match(/(\d+):(\d+)\s*(AM|PM)/i);
    if (!match) return 9999;
    let hours = parseInt(match[1]);
    const mins = parseInt(match[2]);
    const meridiem = match[3].toUpperCase();
    if (meridiem === 'PM' && hours !== 12) hours += 12;
    if (meridiem === 'AM' && hours === 12) hours = 0;
    return hours * 60 + mins;
  }

  const sortedOrders = useMemo(() => {
    if (!sortByTime) return orders;
    return [...orders].sort((a, b) => parseTimeSlotToMinutes(a.delivery_time_slot) - parseTimeSlotToMinutes(b.delivery_time_slot));
  }, [orders, sortByTime]);

  async function patchOrder(id: string, body: Record<string, unknown>) {
    const res = await fetch(`/api/admin/orders/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Update failed');
    }
    const data = await res.json();
    return data.order;
  }

  async function handleMarkPaid() {
    if (!payModal) return;
    setSaving(true);
    try {
      await patchOrder(payModal.id, {
        payment_status: 'paid',
        payment_reference: upiRef.trim() || null,
      });
      onOrderUpdated({ id: payModal.id, payment_status: 'paid', payment_reference: upiRef.trim() || null });
      showToast('Payment marked as received');
      setPayModal(null);
      setUpiRef('');
    } catch (err: any) {
      showToast(err instanceof Error ? err.message : 'Failed to update. Try again.');
    } finally {
      setSaving(false);
    }
  }

  async function handleMarkDispatched(order: AdminOrder) {
    try {
      await patchOrder(order.id, { status: 'out_for_delivery' });
      onOrderUpdated({ id: order.id, status: 'out_for_delivery' });
      showToast('Marked as out for delivery');
    } catch {
      showToast('Failed to update. Try again.');
    }
  }

  async function handleMarkDelivered(order: AdminOrder) {
    try {
      await patchOrder(order.id, { status: 'delivered' });
      onOrderUpdated({ id: order.id, status: 'delivered' });
      showToast('Marked as delivered');
    } catch {
      showToast('Failed to update. Try again.');
    }
  }

  async function handleCancelOrder(order: AdminOrder) {
    if (order.payment_status === 'paid') {
      setRefundStatus('pending_refund');
      setCancelRefundModal(order);
      return;
    }
    if (!confirm(`Cancel order for ${order.users.full_name}? This cannot be undone.`)) return;
    try {
      await patchOrder(order.id, { status: 'cancelled' });
      onOrderUpdated({ id: order.id, status: 'cancelled' });
      showToast('Order cancelled');
    } catch {
      showToast('Failed to cancel. Try again.');
    }
  }

  async function handleConfirmCancelWithRefund() {
    if (!cancelRefundModal) return;
    setSaving(true);
    try {
      await patchOrder(cancelRefundModal.id, { status: 'cancelled', payment_status: refundStatus });
      onOrderUpdated({ id: cancelRefundModal.id, status: 'cancelled', payment_status: refundStatus });
      showToast('Order cancelled');
      setCancelRefundModal(null);
    } catch {
      showToast('Failed to cancel. Try again.');
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveRefundStatus() {
    if (!manageRefundModal) return;
    setSaving(true);
    try {
      await patchOrder(manageRefundModal.id, { payment_status: refundStatus });
      onOrderUpdated({ id: manageRefundModal.id, payment_status: refundStatus });
      showToast('Refund status updated');
      setManageRefundModal(null);
    } catch {
      showToast('Failed to update. Try again.');
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveNote() {
    if (!noteModal) return;
    setSaving(true);
    try {
      await patchOrder(noteModal.id, { admin_notes: noteText.trim() });
      onOrderUpdated({ id: noteModal.id, admin_notes: noteText.trim() });
      showToast('Note saved');
      setNoteModal(null);
    } catch {
      showToast('Failed to save note.');
    } finally {
      setSaving(false);
    }
  }

  async function handleRescheduleOrder() {
    if (!rescheduleModal) return;
    setSaving(true);
    try {
      if (!rescheduleDate) throw new Error("Delivery date is required");
      await patchOrder(rescheduleModal.id, { 
        delivery_date: rescheduleDate, 
        delivery_time_slot: rescheduleSlot || null 
      });
      onOrderUpdated({ id: rescheduleModal.id, delivery_date: rescheduleDate, delivery_time_slot: rescheduleSlot || null });
      showToast('Order rescheduled');
      setRescheduleModal(null);
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Failed to reschedule. Try again.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-black/10 p-8 text-center">
        <p className="font-body text-sm text-stone animate-pulse">Loading orders…</p>
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-black/10 p-10 text-center">
        <p className="font-display text-xl italic text-stone">No orders found.</p>
      </div>
    );
  }

  return (
    <>
      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-ink text-white font-body text-sm px-5 py-3 rounded-full shadow-lg z-[200] animate-in fade-in slide-in-from-bottom-2">
          {toast}
        </div>
      )}

      <div className="bg-white rounded-xl border border-black/10 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-black/5 bg-[#F9F8F6]">
                {showDate && <Th>Date</Th>}
                <th className="px-4 py-3 font-body text-[11px] font-bold uppercase tracking-wider text-stone whitespace-nowrap">
                  <button
                    onClick={() => setSortByTime(s => !s)}
                    className={`flex items-center gap-1.5 hover:text-ink transition-colors ${sortByTime ? 'text-sage-dark' : 'text-stone'}`}
                    title="Sort by delivery time"
                  >
                    Slot
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m3 8 4-4 4 4"/><path d="M7 4v16"/>
                      <path d="m21 16-4 4-4-4"/><path d="M17 20V4"/>
                    </svg>
                    {sortByTime && <span className="text-[9px] bg-sage/20 text-sage-dark px-1 py-0.5 rounded">sorted</span>}
                  </button>
                </th>
                <Th>Customer</Th>
                <Th>Location</Th>
                <Th>Items</Th>
                <Th>Amount</Th>
                <Th>Payment</Th>
                <Th>Delivery</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {sortedOrders.map(order => (
                <tr key={order.id} className="hover:bg-[#F9F8F6]/60 transition-colors">
                  {showDate && (
                    <td className="px-4 py-3 font-body text-[12px] text-stone whitespace-nowrap">
                      {new Date(order.delivery_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                    </td>
                  )}
                  <td className="px-4 py-3 font-body text-[12px] text-stone whitespace-nowrap">
                    {order.delivery_time_slot ?? '—'}
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-body text-[13px] font-semibold text-ink">{order.users.full_name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="font-body text-[11px] text-stone">{order.users.phone || order.users.email}</p>
                      {order.users.phone && (
                        <a
                          href={`https://wa.me/${order.users.phone.replace(/\D/g, '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#25D366] hover:opacity-70 transition-opacity"
                          title="Open WhatsApp"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                        </a>
                      )}
                    </div>
                    {order.admin_notes && (
                      <p className="font-body text-[11px] text-stone/70 mt-1 italic">📝 {order.admin_notes}</p>
                    )}
                  </td>
                  {/* Location column */}
                  <td className="px-4 py-3 max-w-[180px]">
                    {order.addresses ? (() => {
                      const addr = `${order.addresses.line1}${order.addresses.line2 ? ', ' + order.addresses.line2 : ''}, ${order.addresses.city} ${order.addresses.pincode}`;
                      const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`;
                      return (
                        <div className="space-y-1">
                          <p className="font-body text-[11px] text-ink leading-snug">{addr}</p>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => { navigator.clipboard.writeText(addr); showToast('Address copied!'); }}
                              className="font-body text-[10px] text-stone hover:text-ink transition-colors flex items-center gap-1"
                              title="Copy address"
                            >
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                              Copy
                            </button>
                            <a
                              href={mapsUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-body text-[10px] text-terracotta hover:opacity-70 transition-opacity flex items-center gap-1"
                              title="Open in Google Maps"
                            >
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
                              Map
                            </a>
                          </div>
                        </div>
                      );
                    })() : (
                      <p className="font-body text-[11px] text-stone/50 italic">No address</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="mb-1.5 flex flex-wrap gap-1">
                      {order.order_type === 'subscription' && order.payment_method === 'wallet' && (
                        <span className="font-body text-[9px] font-bold uppercase tracking-wider bg-terracotta/10 text-terracotta px-1.5 py-0.5 rounded-sm">Flex Wallet Sub</span>
                      )}
                      {order.order_type === 'subscription' && order.payment_method !== 'wallet' && (
                        <span className="font-body text-[9px] font-bold uppercase tracking-wider bg-sage/20 text-sage-dark px-1.5 py-0.5 rounded-sm">Spread Sub</span>
                      )}
                      {order.order_type !== 'subscription' && (
                        <span className="font-body text-[9px] font-bold uppercase tracking-wider bg-black/5 text-stone px-1.5 py-0.5 rounded-sm">One-Off Order</span>
                      )}
                    </div>
                    {order.order_items.map(item => (
                      <div key={item.id}>
                        <p className="font-body text-[12px] text-ink">{item.bowl_name} ×{item.quantity}</p>
                        {item.customizations?.removed && item.customizations.removed.length > 0 && (
                          <p className="font-body text-[10px] text-terracotta">−{item.customizations.removed.join(', ')}</p>
                        )}
                        {item.customizations?.added && item.customizations.added.length > 0 && (
                          <p className="font-body text-[10px] text-sage-dark">+{item.customizations.added.join(', ')}</p>
                        )}
                      </div>
                    ))}
                    {order.notes && (
                      <p className="font-body text-[10px] text-stone/70 mt-1 italic">{order.notes}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 font-body text-[13px] font-semibold text-ink whitespace-nowrap">
                    ₹{Number(order.total).toLocaleString('en-IN')}
                    {Number(order.delivery_fee) > 0 && (
                      <p className="font-body text-[10px] text-stone font-normal">incl. ₹{order.delivery_fee} del.</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <PaymentStatusBadge status={order.payment_status} reference={order.payment_reference} />
                  </td>
                  <td className="px-4 py-3">
                    <DeliveryStatusBadge status={order.status} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1.5">
                      {order.payment_status !== 'paid' && order.status !== 'cancelled' && (
                        <ActionBtn
                          onClick={() => { setPayModal(order); setUpiRef(''); }}
                          color="terracotta"
                        >
                          Mark Paid
                        </ActionBtn>
                      )}
                      {order.status === 'cancelled' && order.payment_status !== 'pending' && (
                        <ActionBtn
                          onClick={() => { setManageRefundModal(order); setRefundStatus(order.payment_status); }}
                          color="terracotta"
                        >
                          Manage Refund
                        </ActionBtn>
                      )}
                      {order.status !== 'delivered' && order.status !== 'cancelled' && order.status !== 'out_for_delivery' && (
                        <ActionBtn onClick={() => handleMarkDispatched(order)} color="sage">
                          Mark Dispatched
                        </ActionBtn>
                      )}
                      {order.status === 'out_for_delivery' && (
                        <ActionBtn onClick={() => handleMarkDelivered(order)} color="sage">
                          Mark Delivered
                        </ActionBtn>
                      )}
                      <ActionBtn
                        onClick={() => { setNoteModal(order); setNoteText(order.admin_notes ?? ''); }}
                        color="stone"
                      >
                        {order.admin_notes ? 'Edit Note' : 'Add Note'}
                      </ActionBtn>
                      {order.status !== 'delivered' && order.status !== 'cancelled' && (
                        <ActionBtn 
                          onClick={() => { 
                            setRescheduleModal(order); 
                            setRescheduleDate(order.delivery_date); 
                            setRescheduleSlot(order.delivery_time_slot ?? ''); 
                          }} 
                          color="stone"
                        >
                          Reschedule
                        </ActionBtn>
                      )}
                      {order.status !== 'delivered' && order.status !== 'cancelled' && (
                        <ActionBtn onClick={() => handleCancelOrder(order)} color="red">
                          Cancel Order
                        </ActionBtn>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mark Paid Modal */}
      {payModal && (
        <Modal onClose={() => setPayModal(null)} title="Mark Payment Received">
          <div className="space-y-4">
            <div className="bg-[#F9F8F6] rounded-lg p-4">
              <p className="font-body text-[12px] text-stone">Customer</p>
              <p className="font-body text-sm font-semibold text-ink">{payModal.users.full_name}</p>
              <p className="font-body text-[12px] text-stone mt-2">Amount</p>
              <p className="font-display text-2xl text-ink">₹{Number(payModal.total).toLocaleString('en-IN')}</p>
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
                placeholder="e.g. UPI ref 123456 or Cash"
              />
            </div>
            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setPayModal(null)}
                className="flex-1 border border-black/10 rounded-lg py-3 font-body text-sm font-bold text-stone hover:bg-black/5 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleMarkPaid}
                disabled={saving}
                className="flex-1 bg-sage hover:bg-sage/80 disabled:bg-sage/30 text-white rounded-lg py-3 font-body text-sm font-bold transition-colors"
              >
                {saving ? 'Saving…' : 'Confirm Paid'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Add/Edit Note Modal */}
      {noteModal && (
        <Modal onClose={() => setNoteModal(null)} title="Admin Note">
          <div className="space-y-4">
            <p className="font-body text-[12px] text-stone">
              For order by <strong className="text-ink">{noteModal.users.full_name}</strong> — ₹{Number(noteModal.total).toLocaleString('en-IN')}
            </p>
            <textarea
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
              rows={3}
              className="w-full border border-black/10 rounded-lg px-4 py-3 font-body text-sm text-ink bg-[#F9F8F6] focus:outline-none focus:ring-2 focus:ring-sage/40 resize-none"
              placeholder="e.g. Customer said will pay by evening"
            />
            <div className="flex gap-3">
              <button
                onClick={() => setNoteModal(null)}
                className="flex-1 border border-black/10 rounded-lg py-3 font-body text-sm font-bold text-stone hover:bg-black/5 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveNote}
                disabled={saving}
                className="flex-1 bg-ink hover:bg-ink/80 disabled:bg-ink/30 text-white rounded-lg py-3 font-body text-sm font-bold transition-colors"
              >
                {saving ? 'Saving…' : 'Save Note'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Cancel with Refund Status Modal */}
      {cancelRefundModal && (
        <Modal onClose={() => setCancelRefundModal(null)} title="Cancel Order">
          <div className="space-y-4">
            <div className="bg-[#F9F8F6] rounded-lg p-4">
              <p className="font-body text-[12px] text-stone">Customer</p>
              <p className="font-body text-sm font-semibold text-ink">{cancelRefundModal.users.full_name}</p>
              <p className="font-body text-[12px] text-stone mt-2">Amount</p>
              <p className="font-display text-2xl text-ink">₹{Number(cancelRefundModal.total).toLocaleString('en-IN')}</p>
            </div>
            <div>
              <label className="block font-body text-[11px] font-bold uppercase tracking-wider text-stone mb-2">
                Refund Status
              </label>
              <select
                value={refundStatus}
                onChange={e => setRefundStatus(e.target.value)}
                className="w-full border border-black/10 rounded-lg px-4 py-3 font-body text-sm text-ink bg-[#F9F8F6] focus:outline-none focus:ring-2 focus:ring-sage/40"
              >
                <option value="pending_refund">Pending Refund</option>
                <option value="refund_initiated">Refund Initiated</option>
                <option value="refund_complete">Refund Complete</option>
                <option value="pending">Revert to Pending Payment</option>
              </select>
            </div>
            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setCancelRefundModal(null)}
                className="flex-1 border border-black/10 rounded-lg py-3 font-body text-sm font-bold text-stone hover:bg-black/5 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmCancelWithRefund}
                disabled={saving}
                className="flex-1 bg-red-500 hover:bg-red-600 disabled:bg-red-300 text-white rounded-lg py-3 font-body text-sm font-bold transition-colors"
              >
                {saving ? 'Cancelling…' : 'Confirm Cancellation'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Manage Refund Modal */}
      {manageRefundModal && (
        <Modal onClose={() => setManageRefundModal(null)} title="Manage Refund">
          <div className="space-y-4">
            <div className="bg-[#F9F8F6] rounded-lg p-4">
              <p className="font-body text-[12px] text-stone">Customer</p>
              <p className="font-body text-sm font-semibold text-ink">{manageRefundModal.users.full_name}</p>
              <p className="font-body text-[12px] text-stone mt-2">Amount</p>
              <p className="font-display text-2xl text-ink">₹{Number(manageRefundModal.total).toLocaleString('en-IN')}</p>
            </div>
            <div>
              <label className="block font-body text-[11px] font-bold uppercase tracking-wider text-stone mb-2">
                Refund Status
              </label>
              <select
                value={refundStatus}
                onChange={e => setRefundStatus(e.target.value)}
                className="w-full border border-black/10 rounded-lg px-4 py-3 font-body text-sm text-ink bg-[#F9F8F6] focus:outline-none focus:ring-2 focus:ring-sage/40"
              >
                <option value="pending_refund">Pending Refund</option>
                <option value="refund_initiated">Refund Initiated</option>
                <option value="refund_complete">Refund Complete</option>
                <option value="pending">Revert to Pending Payment</option>
              </select>
            </div>
            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setManageRefundModal(null)}
                className="flex-1 border border-black/10 rounded-lg py-3 font-body text-sm font-bold text-stone hover:bg-black/5 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveRefundStatus}
                disabled={saving}
                className="flex-1 bg-ink hover:bg-ink/80 disabled:bg-ink/30 text-white rounded-lg py-3 font-body text-sm font-bold transition-colors"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Reschedule Modal */}
      {rescheduleModal && (
        <Modal onClose={() => setRescheduleModal(null)} title="Reschedule Delivery">
          <div className="space-y-4">
            <p className="font-body text-[12px] text-stone">
              Moving order for <strong className="text-ink">{rescheduleModal.users.full_name}</strong>.
            </p>
            <div>
              <label className="block font-body text-[11px] font-bold uppercase tracking-wider text-stone mb-2">New Delivery Date</label>
              <input
                type="date"
                value={rescheduleDate}
                onChange={e => setRescheduleDate(e.target.value)}
                className="w-full border border-black/10 rounded-lg px-4 py-3 font-body text-sm text-ink bg-[#F9F8F6] focus:outline-none focus:ring-2 focus:ring-sage/40"
              />
            </div>
            <div>
              <label className="block font-body text-[11px] font-bold uppercase tracking-wider text-stone mb-2">New Time Slot (optional)</label>
              <select
                value={rescheduleSlot}
                onChange={e => setRescheduleSlot(e.target.value)}
                className="w-full border border-black/10 rounded-lg px-4 py-3 font-body text-sm text-ink bg-[#F9F8F6] focus:outline-none focus:ring-2 focus:ring-sage/40"
              >
                <option value="">— Keep existing —</option>
                {['7:00 AM - 8:00 AM','8:00 AM - 9:00 AM','9:00 AM - 10:00 AM','10:00 AM - 11:00 AM','11:00 AM - 12:00 PM','12:00 PM - 1:00 PM','1:00 PM - 2:00 PM','2:00 PM - 3:00 PM','3:00 PM - 4:00 PM','4:00 PM - 5:00 PM','5:00 PM - 6:00 PM','6:00 PM - 7:00 PM','7:00 PM - 8:00 PM','8:00 PM - 9:00 PM'].map(slot => (
                  <option key={slot} value={slot}>{slot}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setRescheduleModal(null)}
                className="flex-1 border border-black/10 rounded-lg py-3 font-body text-sm font-bold text-stone hover:bg-black/5 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleRescheduleOrder}
                disabled={saving}
                className="flex-1 bg-ink hover:bg-ink/80 disabled:bg-ink/30 text-white rounded-lg py-3 font-body text-sm font-bold transition-colors"
              >
                {saving ? 'Saving…' : 'Confirm New Date'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

function PaymentStatusBadge({ status, reference }: { status: string; reference: string | null }) {
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
    <div>
      <span className={`inline-flex items-center font-body text-[11px] font-bold px-2 py-0.5 rounded-full ${c.className}`}>
        {c.label}
      </span>
      {reference && (
        <p className="font-body text-[10px] text-stone mt-1">{reference}</p>
      )}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-3 font-body text-[11px] font-bold uppercase tracking-wider text-stone whitespace-nowrap">
      {children}
    </th>
  );
}

function ActionBtn({ children, onClick, color }: {
  children: React.ReactNode;
  onClick: () => void;
  color: 'terracotta' | 'sage' | 'stone' | 'red';
}) {
  const styles = {
    terracotta: 'border-terracotta/30 text-terracotta hover:bg-terracotta/5',
    sage:       'border-sage/30 text-sage-dark hover:bg-sage/5',
    stone:      'border-black/10 text-stone hover:bg-black/5',
    red:        'border-red-200 text-red-600 hover:bg-red-50',
  };
  return (
    <button
      onClick={onClick}
      className={`border rounded-md px-2.5 py-1 font-body text-[11px] font-bold whitespace-nowrap transition-colors ${styles[color]}`}
    >
      {children}
    </button>
  );
}

function DeliveryStatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string }> = {
    pending:          { label: 'Pending', className: 'bg-amber-50 text-amber-700' },
    confirmed:        { label: 'To Be Dispatched', className: 'bg-amber-50 text-amber-700' },
    out_for_delivery: { label: 'Out for Delivery', className: 'bg-amber-50 text-amber-700' },
    delivered:        { label: '✓ Delivered',      className: 'bg-sage/10 text-sage-dark' },
    cancelled:        { label: 'Cancelled',        className: 'bg-red-50 text-red-600' },
  };
  const c = config[status] ?? { label: status, className: 'bg-stone/10 text-stone' };
  return (
    <span className={`inline-flex items-center font-body text-[11px] font-bold px-2 py-0.5 rounded-full ${c.className}`}>
      {c.label}
    </span>
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
