'use client';

import { useState } from 'react';

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
  const [upiRef, setUpiRef]         = useState('');
  const [noteText, setNoteText]     = useState('');
  const [saving, setSaving]         = useState(false);
  const [toast, setToast]           = useState('');

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }

  async function patchOrder(id: string, body: Record<string, unknown>) {
    const res = await fetch(`/api/admin/orders/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error('Update failed');
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
    } catch {
      showToast('Failed to update. Try again.');
    } finally {
      setSaving(false);
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
    if (!confirm(`Cancel order for ${order.users.full_name}? This cannot be undone.`)) return;
    try {
      await patchOrder(order.id, { status: 'cancelled' });
      onOrderUpdated({ id: order.id, status: 'cancelled' });
      showToast('Order cancelled');
    } catch {
      showToast('Failed to cancel. Try again.');
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
                <Th>Slot</Th>
                <Th>Customer</Th>
                <Th>Items</Th>
                <Th>Amount</Th>
                <Th>Payment</Th>
                <Th>Delivery</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {orders.map(order => (
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
                  <td className="px-4 py-3">
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
                    {order.payment_status === 'paid' ? (
                      <div>
                        <span className="inline-flex items-center gap-1 bg-sage/10 text-sage-dark font-body text-[11px] font-bold px-2 py-0.5 rounded-full">
                          ✓ Paid
                        </span>
                        {order.payment_reference && (
                          <p className="font-body text-[10px] text-stone mt-1">{order.payment_reference}</p>
                        )}
                      </div>
                    ) : (
                      <span className="inline-flex items-center bg-terracotta/10 text-terracotta font-body text-[11px] font-bold px-2 py-0.5 rounded-full">
                        Pending
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {order.status === 'delivered' ? (
                      <span className="inline-flex items-center gap-1 bg-sage/10 text-sage-dark font-body text-[11px] font-bold px-2 py-0.5 rounded-full">
                        ✓ Delivered
                      </span>
                    ) : order.status === 'cancelled' ? (
                      <span className="inline-flex items-center bg-red-50 text-red-600 font-body text-[11px] font-bold px-2 py-0.5 rounded-full">
                        Cancelled
                      </span>
                    ) : (
                      <span className="inline-flex items-center bg-stone/10 text-stone font-body text-[11px] font-bold px-2 py-0.5 rounded-full capitalize">
                        {order.status}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1.5">
                      {order.payment_status !== 'paid' && (
                        <ActionBtn
                          onClick={() => { setPayModal(order); setUpiRef(''); }}
                          color="terracotta"
                        >
                          Mark Paid
                        </ActionBtn>
                      )}
                      {order.status !== 'delivered' && order.status !== 'cancelled' && (
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
    </>
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
