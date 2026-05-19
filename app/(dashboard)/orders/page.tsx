"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/utils";
import { formatInstantIst } from "@/lib/datetime-ist";

interface DisplayOrder {
  id: string;
  status: string;
  payment_status: string;
  date: string;
  slot: string | null;
  items: string;
  total: number;
  isSubscriptionOrder: boolean;
}

const STATUS_STEPS = ['confirmed', 'out_for_delivery', 'delivered'] as const;

const PAYMENT_LABEL: Record<string, { label: string; color: string }> = {
  pending: { label: 'Awaiting Payment', color: 'text-amber-600 bg-amber-50' },
  paid:    { label: 'Paid',             color: 'text-sage-dark bg-sage/10' },
  failed:  { label: 'Payment Failed',   color: 'text-red-600 bg-red-50' },
};

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  pending:          { label: 'Pending',          color: 'text-stone bg-stone/10' },
  confirmed:        { label: 'To Be Dispatched', color: 'text-blue-700 bg-blue-50' },
  out_for_delivery: { label: 'Out for Delivery', color: 'text-terracotta bg-terracotta/10' },
  delivered:        { label: 'Delivered',        color: 'text-sage-dark bg-sage/10' },
  cancelled:        { label: 'Cancelled',        color: 'text-red-600 bg-red-50' },
};

function OrderProgressStepper({ status }: { status: string }) {
  if (status === 'cancelled' || status === 'pending') return null;
  const currentIdx = STATUS_STEPS.indexOf(status as typeof STATUS_STEPS[number]);

  const stepLabels = ['To Be Dispatched', 'Out for Delivery', 'Delivered'];

  return (
    <div className="flex items-center gap-0 mt-4 pt-4 border-t border-black/5">
      {STATUS_STEPS.map((step, idx) => {
        const done = currentIdx >= idx;
        const active = currentIdx === idx;
        return (
          <div key={step} className="flex items-center flex-1 min-w-0">
            <div className="flex flex-col items-center flex-shrink-0">
              <div className={`w-5 h-5 rounded-full flex items-center justify-center transition-colors ${
                done ? 'bg-sage' : 'bg-black/10'
              }`}>
                {done ? (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  <div className="w-1.5 h-1.5 rounded-full bg-black/20" />
                )}
              </div>
              <span className={`font-body text-[10px] mt-1 text-center leading-tight ${
                active ? 'text-ink font-bold' : done ? 'text-sage-dark' : 'text-stone/50'
              }`} style={{ maxWidth: '64px' }}>
                {stepLabels[idx]}
              </span>
            </div>
            {idx < STATUS_STEPS.length - 1 && (
              <div className={`h-0.5 flex-1 mx-1 mb-3.5 rounded transition-colors ${
                currentIdx > idx ? 'bg-sage' : 'bg-black/10'
              }`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<DisplayOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();

    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) {
        setLoading(false);
        return;
      }

      const { data: orderRows, error: ordersError } = await supabase
        .from('orders')
        .select('id, status, payment_status, created_at, delivery_time_slot, total, subscription_id, order_type')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (ordersError) {
        setError('Failed to load orders. Please refresh the page.');
        setLoading(false);
        return;
      }

      if (!orderRows || orderRows.length === 0) {
        setLoading(false);
        return;
      }

      const orderIds = orderRows.map(o => o.id);
      const { data: itemRows } = await supabase
        .from('order_items')
        .select('order_id, bowl_name, quantity')
        .in('order_id', orderIds);

      const itemsByOrder: Record<string, string[]> = {};
      for (const item of (itemRows ?? [])) {
        if (!itemsByOrder[item.order_id]) itemsByOrder[item.order_id] = [];
        itemsByOrder[item.order_id].push(`${item.quantity}x ${item.bowl_name}`);
      }

      const mapped: DisplayOrder[] = orderRows.map(o => ({
        id: o.id,
        status: o.status ?? 'pending',
        payment_status: o.payment_status ?? 'pending',
        date: formatInstantIst(o.created_at, {
          day: "numeric",
          month: "short",
          year: "numeric",
        }),
        slot: o.delivery_time_slot ?? null,
        items: (itemsByOrder[o.id] ?? []).join(', ') || '—',
        total: o.total ?? 0,
        isSubscriptionOrder: !!(o.subscription_id || o.order_type === 'subscription'),
      }));

      setOrders(mapped);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="font-display text-[24px] font-medium text-ink">Order History</h2>
        </div>
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white border border-black/10 rounded-xl p-6 animate-pulse">
              <div className="h-5 w-40 bg-black/8 rounded mb-3" />
              <div className="h-3 w-24 bg-black/5 rounded mb-6" />
              <div className="h-3 w-full bg-black/5 rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="font-display text-[24px] font-medium text-ink">Order History</h2>
        </div>
        <div className="p-4 bg-terracotta/5 border border-terracotta/20 rounded-xl">
          <p className="font-body text-[13px] text-terracotta font-medium">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="font-display text-[24px] font-medium text-ink">Order History</h2>
      </div>

      {orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-4 text-center bg-[#F9F8F6] rounded-xl border border-black/5 border-dashed">
          <div className="relative w-20 h-20 mb-6 grayscale opacity-40 mix-blend-multiply">
            <Image src="/hero-image.png" alt="No Orders" fill className="object-cover rounded-full" />
          </div>
          <h3 className="font-display text-xl font-medium text-ink mb-2">No orders yet</h3>
          <p className="font-body text-[13.5px] text-stone max-w-sm mb-6 leading-relaxed">
            Looks like you haven't placed an order yet. Explore our menu to find your perfect bowl.
          </p>
          <Link
            href="/menu"
            className="bg-terracotta hover:bg-terracotta/90 text-white font-body text-[13px] font-bold tracking-wide px-8 py-3 rounded-md transition-all shadow-sm"
          >
            Explore Menu
          </Link>
        </div>
      ) : (
        <div className="space-y-3.5">
          {orders.map(order => {
            const displayStatus =
              order.payment_status === 'paid' && order.status === 'pending'
                ? 'confirmed'
                : order.status;
            const paymentInfo = PAYMENT_LABEL[order.payment_status] ?? PAYMENT_LABEL.pending;
            const statusInfo = STATUS_LABEL[displayStatus] ?? { label: displayStatus, color: 'text-stone bg-stone/10' };
            const isCancelled = displayStatus === 'cancelled';
            const isPending = !isCancelled && order.payment_status !== 'paid';
            const isDelivered = displayStatus === 'delivered' && order.payment_status === 'paid';

            return (
              <div key={order.id} className="group rounded-xl border border-black/10 bg-white p-4 text-ink shadow-sm transition-colors hover:border-sage/40 md:p-6">
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 border-b border-black/5 pb-4 mb-4">
                  <div>
                    <div className="flex items-center gap-3 mb-1 flex-wrap">
                      <h3 className="font-display text-lg font-medium text-ink">Order #{order.id.slice(0, 8).toUpperCase()}</h3>
                      {/* Payment status badge — primary when unpaid */}
                      {isPending && (
                        <span className={`px-2 py-0.5 font-body text-[10px] uppercase tracking-wider font-bold rounded-sm ${paymentInfo.color}`}>
                          {paymentInfo.label}
                        </span>
                      )}
                      {/* Delivery status badge — always shown for cancelled, otherwise shown when paid */}
                      {(isCancelled || !isPending) && (
                        <span className={`px-2 py-0.5 font-body text-[10px] uppercase tracking-wider font-bold rounded-sm ${statusInfo.color}`}>
                          {statusInfo.label}
                        </span>
                      )}
                    </div>
                    <p className="font-body text-[12px] text-stone">Placed on {order.date}</p>
                    {order.slot && (
                      <p className="font-body text-[12px] text-stone/80 mt-0.5 flex items-center gap-1.5">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                        {order.slot}
                      </p>
                    )}
                    {isPending && (
                      <p className="font-body text-[12px] text-amber-600 mt-1.5">
                        Waiting for payment confirmation from Nutravoe.
                      </p>
                    )}
                  </div>
                  <div className="text-left md:text-right">
                    <p className="font-display text-xl font-medium text-sage-dark">{formatCurrency(order.total)}</p>
                  </div>
                </div>

                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-4 flex-1 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-[#F9F8F6] shrink-0 flex items-center justify-center text-stone">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
                    </div>
                    <div>
                      <h4 className="font-body text-[13px] font-medium text-ink mb-1 group-hover:text-sage-dark transition-colors">Items</h4>
                      <p className="font-body text-[13px] text-stone/90 leading-relaxed">
                        {order.items}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 shrink-0">
                    {/* Subscription delivery receipt */}
                    {order.isSubscriptionOrder && isDelivered && (
                      <a
                        href={`/receipt/delivery/${order.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 border border-sage/30 text-sage-dark hover:bg-sage/5 transition-colors rounded-lg px-3 py-2 font-body text-[12px] font-bold"
                        title="Download Delivery Receipt"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                          <polyline points="7 10 12 15 17 10"/>
                          <line x1="12" y1="15" x2="12" y2="3"/>
                        </svg>
                        Receipt
                      </a>
                    )}
                    {/* Subscription not yet delivered — show wallet link */}
                    {order.isSubscriptionOrder && !isDelivered && (
                      <Link
                        href="/wallet"
                        className="flex items-center gap-1.5 border border-sage/20 text-sage-dark/70 rounded-lg px-3 py-2 font-body text-[11px]"
                        title="View wallet transactions"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>
                        </svg>
                        Subscription · Wallet
                      </Link>
                    )}
                    {/* Cart order invoice — only when delivered + paid */}
                    {!order.isSubscriptionOrder && isDelivered && (
                      <a
                        href={`/invoice/${order.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 border border-sage/30 text-sage-dark hover:bg-sage/5 transition-colors rounded-lg px-3 py-2 font-body text-[12px] font-bold"
                        title="Download Invoice"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                          <polyline points="7 10 12 15 17 10"/>
                          <line x1="12" y1="15" x2="12" y2="3"/>
                        </svg>
                        Invoice
                      </a>
                    )}
                  </div>
                </div>

                {/* Progress stepper — only for non-subscription, non-cancelled paid orders */}
                {!order.isSubscriptionOrder && !isPending && displayStatus !== 'cancelled' && (
                  <OrderProgressStepper status={displayStatus} />
                )}
                {/* Subscription delivery stepper */}
                {order.isSubscriptionOrder && !isPending && displayStatus !== 'cancelled' && (
                  <OrderProgressStepper status={displayStatus} />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
