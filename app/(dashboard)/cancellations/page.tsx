'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { formatCurrency } from '@/lib/utils';

interface Order {
  id: string;
  status: string;
  date: string;
  slot?: string;
  items: string;
  total: number;
  paymentMethod?: string;
  cancellationStatus?: 'cancelled' | 'refund_wallet' | 'refund_original';
  refundMethod?: 'wallet' | 'original';
}

// Delivery slot start is 7:00 AM. Cutoff = 5h before = 2:00 AM same day.
const SLOT_START_HOUR = 7;
const CUTOFF_HOURS_BEFORE = 5;
const CUTOFF_HOUR = SLOT_START_HOUR - CUTOFF_HOURS_BEFORE; // 2 AM

function getNextCutoff(): Date {
  const now = new Date();
  const cutoff = new Date();
  cutoff.setHours(CUTOFF_HOUR, 0, 0, 0);
  if (now >= cutoff) cutoff.setDate(cutoff.getDate() + 1);
  return cutoff;
}

function isCancellable(order: Order): boolean {
  if (order.status === 'cancelled' || order.cancellationStatus) return false;
  if (order.status === 'failed') return false;
  return new Date() < getNextCutoff();
}

function timeUntilCutoff(): string {
  const diff = getNextCutoff().getTime() - Date.now();
  const hours = Math.floor(diff / 3_600_000);
  const mins = Math.floor((diff % 3_600_000) / 60_000);
  if (hours > 0) return `${hours}h ${mins}m remaining to cancel`;
  return `${mins}m remaining to cancel`;
}

export default function CancellationsPage() {
  const supabase = createClient();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancellingOrder, setCancellingOrder] = useState<Order | null>(null);
  const [refundMethod, setRefundMethod] = useState<'wallet' | 'original' | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [successOrder, setSuccessOrder] = useState<{ id: string; method: 'wallet' | 'original' } | null>(null);

  useEffect(() => { loadOrders(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadOrders() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const { data: orderRows } = await supabase
      .from('orders')
      .select('id, status, created_at, delivery_time_slot, total, payment_method')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (!orderRows) { setLoading(false); return; }

    // Fetch item summaries for each order
    const orderIds = orderRows.map(o => o.id);
    const { data: itemRows } = await supabase
      .from('order_items')
      .select('order_id, quantity, bowl_name')
      .in('order_id', orderIds);

    const itemMap: Record<string, string> = {};
    (itemRows ?? []).forEach(item => {
      const summary = `${item.quantity}× ${item.bowl_name}`;
      itemMap[item.order_id] = itemMap[item.order_id]
        ? `${itemMap[item.order_id]}, ${summary}`
        : summary;
    });

    // Fetch cancellations to mark already-cancelled orders
    const { data: cancelRows } = await supabase
      .from('cancellations')
      .select('order_id, refund_destination')
      .in('order_id', orderIds);

    const cancelMap: Record<string, 'wallet' | 'original'> = {};
    (cancelRows ?? []).forEach(c => {
      cancelMap[c.order_id] = c.refund_destination === 'wallet' ? 'wallet' : 'original';
    });

    const mapped: Order[] = orderRows.map(o => ({
      id: o.id,
      status: o.status,
      date: new Date(o.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
      slot: o.delivery_time_slot ?? undefined,
      items: itemMap[o.id] ?? '—',
      total: o.total,
      paymentMethod: o.payment_method,
      cancellationStatus: cancelMap[o.id]
        ? (cancelMap[o.id] === 'wallet' ? 'refund_wallet' : 'refund_original')
        : undefined,
      refundMethod: cancelMap[o.id] ?? undefined,
    }));

    setOrders(mapped);
    setLoading(false);
  }

  async function handleConfirmCancel() {
    if (!cancellingOrder || !refundMethod) return;
    setConfirming(true);
    try {
      const res = await fetch(`/api/orders/${cancellingOrder.id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refundMethod }),
      });

      if (!res.ok) {
        throw new Error('Failed to cancel order');
      }

      setOrders(prev => prev.map(o =>
        o.id !== cancellingOrder.id ? o : {
          ...o,
          status: 'cancelled',
          cancellationStatus: refundMethod === 'wallet' ? 'refund_wallet' : 'refund_original',
          refundMethod,
        }
      ));

      setSuccessOrder({ id: cancellingOrder.id, method: refundMethod });
      setCancellingOrder(null);
      setRefundMethod(null);
    } finally {
      setConfirming(false);
    }
  }

  const cancellable = orders.filter(o => isCancellable(o));
  const cancelled = orders.filter(o => o.cancellationStatus);
  const nonCancellable = orders.filter(o => !isCancellable(o) && !o.cancellationStatus && o.status !== 'failed' && o.status !== 'cancelled');

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="w-6 h-6 rounded-full border-2 border-sage border-t-transparent animate-spin" />
    </div>
  );

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="font-display text-2xl font-medium text-ink">Cancellations & Refunds</h2>
          <p className="font-body text-[13px] text-stone mt-1">Manage order cancellations and track your refunds</p>
        </div>
      </div>

      {/* Success banner */}
      {successOrder && (
        <div className="flex items-start gap-3 p-4 bg-sage/8 border border-sage/20 rounded-xl mb-6 animate-in fade-in duration-300">
          <div className="w-8 h-8 rounded-full bg-sage/15 flex items-center justify-center shrink-0">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4E6B49" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <div>
            <p className="font-body text-[13px] font-bold text-sage-dark">Order #{successOrder.id.slice(-6)} cancelled successfully</p>
            <p className="font-body text-[12px] text-stone mt-0.5">
              {successOrder.method === 'wallet'
                ? 'Refund has been added to your Nutravoe Wallet instantly.'
                : 'Refund will be credited to your original payment method within 5–7 business days.'}
            </p>
          </div>
          <button onClick={() => setSuccessOrder(null)} className="ml-auto text-stone hover:text-ink transition-colors shrink-0">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
        </div>
      )}

      {/* Policy card */}
      <div className="bg-[#F9F8F6] border border-black/6 rounded-xl p-5 mb-8">
        <p className="font-body text-[11px] font-bold uppercase tracking-wider text-stone mb-3">Cancellation Policy</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            {
              icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4E6B49" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
              title: '5-hour cutoff',
              desc: 'Cancel any order up to 5 hours before your 7:00 AM delivery slot (i.e., by 2:00 AM on delivery day)',
            },
            {
              icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4E6B49" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>,
              title: 'Full refund',
              desc: 'You receive 100% of the amount paid — no cancellation fee, no deductions, ever.',
            },
            {
              icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4E6B49" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>,
              title: 'Your choice of refund',
              desc: 'Get refunded instantly to your Nutravoe Wallet, or back to your original payment method in 5–7 business days.',
            },
          ].map((item, i) => (
            <div key={i} className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-sage/10 flex items-center justify-center shrink-0 mt-0.5">{item.icon}</div>
              <div>
                <p className="font-body text-[13px] font-bold text-ink">{item.title}</p>
                <p className="font-body text-[12px] text-stone leading-relaxed mt-0.5">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Cancellable orders */}
      {cancellable.length > 0 && (
        <div className="mb-8">
          <p className="font-body text-[11px] font-bold uppercase tracking-wider text-stone mb-3">Eligible to Cancel</p>
          <div className="space-y-3">
            {cancellable.map(order => (
              <div key={order.id} className="bg-white border border-sage/20 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-body text-[14px] font-bold text-ink">Order #{order.id.slice(-6)}</p>
                    <span className="font-body text-[10px] font-bold bg-sage/10 text-sage-dark px-2 py-0.5 rounded-full uppercase tracking-wide">{order.status}</span>
                  </div>
                  <p className="font-body text-[12px] text-stone">{order.items}</p>
                  <p className="font-body text-[12px] text-stone mt-0.5">Delivery: 7:00 AM – 10:00 AM · {order.slot ?? 'Tomorrow'}</p>
                  <p className="font-body text-[11px] font-bold text-terracotta mt-1 flex items-center gap-1">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                    {timeUntilCutoff()}
                  </p>
                </div>
                <div className="flex items-center gap-4 shrink-0">
                  <p className="font-display text-lg font-medium text-ink">{formatCurrency(order.total)}</p>
                  <button
                    onClick={() => { setCancellingOrder(order); setRefundMethod(null); }}
                    className="bg-terracotta/8 hover:bg-terracotta/15 border border-terracotta/25 text-terracotta font-body text-[12px] font-bold px-4 py-2 rounded-md transition-colors"
                  >
                    Cancel Order
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Past / non-cancellable orders */}
      {nonCancellable.length > 0 && (
        <div className="mb-8">
          <p className="font-body text-[11px] font-bold uppercase tracking-wider text-stone mb-3">Past Orders</p>
          <div className="space-y-2">
            {nonCancellable.map(order => (
              <div key={order.id} className="bg-[#F9F8F6] border border-black/6 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 opacity-75">
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="font-body text-[13px] font-bold text-ink">Order #{order.id.slice(-6)}</p>
                    <span className="font-body text-[10px] font-bold bg-black/6 text-stone px-2 py-0.5 rounded-full uppercase tracking-wide">{order.status}</span>
                  </div>
                  <p className="font-body text-[12px] text-stone">{order.items}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <p className="font-display text-base font-medium text-ink">{formatCurrency(order.total)}</p>
                  <span className="font-body text-[11px] text-stone italic">Past cancellation window</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cancelled / refund history */}
      {cancelled.length > 0 && (
        <div className="mb-8">
          <p className="font-body text-[11px] font-bold uppercase tracking-wider text-stone mb-3">Cancellation History</p>
          <div className="space-y-2">
            {cancelled.map(order => (
              <div key={order.id} className="bg-white border border-black/6 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="font-body text-[13px] font-bold text-ink">Order #{order.id.slice(-6)}</p>
                    <span className="font-body text-[10px] font-bold bg-terracotta/8 text-terracotta px-2 py-0.5 rounded-full uppercase tracking-wide">Cancelled</span>
                  </div>
                  <p className="font-body text-[12px] text-stone">{order.items}</p>
                </div>
                <div className="text-left sm:text-right shrink-0">
                  <p className="font-display text-base font-medium text-ink">{formatCurrency(order.total)}</p>
                  <p className="font-body text-[11px] text-stone mt-0.5">
                    {order.refundMethod === 'wallet'
                      ? '✓ Refunded to Wallet'
                      : '↩ Refund to original method (5–7 days)'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {orders.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 border border-dashed border-black/10 rounded-xl text-center">
          <div className="w-12 h-12 rounded-full bg-[#F9F8F6] flex items-center justify-center mb-4">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#B0A99A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
          </div>
          <p className="font-body text-[14px] font-medium text-ink mb-1">No orders found</p>
          <p className="font-body text-[12px] text-stone mb-5">Once you place an order, you can manage cancellations here.</p>
          <Link href="/menu" className="bg-ink hover:bg-black text-white font-body text-[13px] font-bold px-6 py-2.5 rounded-md transition-colors">
            Browse Menu
          </Link>
        </div>
      )}

      {/* Help prompt */}
      <div className="mt-2 p-4 bg-[#F9F8F6] border border-black/6 rounded-xl flex items-center justify-between">
        <div>
          <p className="font-body text-[13px] font-medium text-ink">Missed the cancellation window?</p>
          <p className="font-body text-[12px] text-stone mt-0.5">Reach out — we'll do our best to help if the order hasn't been dispatched.</p>
        </div>
        <Link href="/help" className="shrink-0 ml-4 font-body text-[12px] font-bold text-sage hover:underline flex items-center gap-1">
          Contact Support
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
        </Link>
      </div>

      {/* Cancel + Refund modal */}
      {cancellingOrder && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-ink/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-6 py-5 border-b border-black/5 flex items-center justify-between">
              <h3 className="font-display text-xl font-medium text-ink">Cancel Order</h3>
              <button onClick={() => setCancellingOrder(null)} className="text-stone hover:text-ink transition-colors">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
              </button>
            </div>
            <div className="p-6">
              <div className="bg-[#F9F8F6] rounded-xl p-4 mb-5">
                <p className="font-body text-[11px] font-bold uppercase tracking-wider text-stone mb-2">Order being cancelled</p>
                <p className="font-body text-[13px] font-medium text-ink">#{cancellingOrder.id.slice(-6)} · {cancellingOrder.items}</p>
                <p className="font-display text-2xl font-medium text-ink mt-1">{formatCurrency(cancellingOrder.total)}</p>
              </div>
              <p className="font-body text-[12px] font-bold uppercase tracking-wider text-stone mb-3">Where should we send the refund?</p>
              <div className="space-y-2 mb-5">
                <button
                  onClick={() => setRefundMethod('wallet')}
                  className={`w-full flex items-start gap-3 p-4 rounded-xl border text-left transition-all ${refundMethod === 'wallet' ? 'border-terracotta bg-terracotta/5' : 'border-black/10 hover:border-terracotta/40'}`}
                >
                  <div className={`w-4 h-4 rounded-full border-2 shrink-0 mt-0.5 flex items-center justify-center ${refundMethod === 'wallet' ? 'border-terracotta' : 'border-stone/40'}`}>
                    {refundMethod === 'wallet' && <div className="w-2 h-2 rounded-full bg-terracotta" />}
                  </div>
                  <div>
                    <p className="font-body text-[13px] font-bold text-ink">Nutravoe Wallet</p>
                    <p className="font-body text-[11px] text-stone mt-0.5">Instant · Use on your next order</p>
                  </div>
                  <span className="ml-auto font-body text-[10px] font-bold bg-sage/10 text-sage-dark px-2 py-0.5 rounded-full shrink-0 self-start">Instant</span>
                </button>
                <button
                  onClick={() => setRefundMethod('original')}
                  className={`w-full flex items-start gap-3 p-4 rounded-xl border text-left transition-all ${refundMethod === 'original' ? 'border-ink bg-ink/5' : 'border-black/10 hover:border-black/30'}`}
                >
                  <div className={`w-4 h-4 rounded-full border-2 shrink-0 mt-0.5 flex items-center justify-center ${refundMethod === 'original' ? 'border-ink' : 'border-stone/40'}`}>
                    {refundMethod === 'original' && <div className="w-2 h-2 rounded-full bg-ink" />}
                  </div>
                  <div>
                    <p className="font-body text-[13px] font-bold text-ink">Original payment method</p>
                    <p className="font-body text-[11px] text-stone mt-0.5">Card / UPI / Netbanking used at checkout</p>
                  </div>
                  <span className="ml-auto font-body text-[10px] font-bold bg-black/6 text-stone px-2 py-0.5 rounded-full shrink-0 self-start">5–7 days</span>
                </button>
              </div>
              <button
                onClick={handleConfirmCancel}
                disabled={!refundMethod || confirming}
                className="w-full bg-terracotta hover:bg-[#D55F43] disabled:bg-black/10 disabled:text-stone text-white font-body text-[13px] font-bold tracking-wide py-3.5 rounded-md transition-colors shadow-sm"
              >
                {confirming ? 'Processing...' : 'Confirm Cancellation'}
              </button>
              <p className="font-body text-[11px] text-stone text-center mt-2">This action cannot be undone</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
