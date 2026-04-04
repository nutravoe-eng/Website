"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/utils";

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
        date: new Date(o.created_at).toLocaleDateString('en-IN', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
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
        <div className="flex items-center justify-between mb-8">
          <h2 className="font-display text-2xl font-medium text-ink">Order History</h2>
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
        <div className="flex items-center justify-between mb-8">
          <h2 className="font-display text-2xl font-medium text-ink">Order History</h2>
        </div>
        <div className="p-4 bg-terracotta/5 border border-terracotta/20 rounded-xl">
          <p className="font-body text-[13px] text-terracotta font-medium">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="flex items-center justify-between mb-8">
        <h2 className="font-display text-2xl font-medium text-ink">Order History</h2>
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
        <div className="space-y-4">
          {orders.map(order => (
            <div key={order.id} className="bg-white border text-ink border-black/10 rounded-xl p-6 shadow-sm hover:border-sage/40 transition-colors group">
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 border-b border-black/5 pb-4 mb-4">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className="font-display text-lg font-medium text-ink">Order #{order.id.slice(0, 8).toUpperCase()}</h3>
                    <span className="px-2 py-0.5 bg-sage/10 text-sage-dark font-body text-[10px] uppercase tracking-wider font-bold rounded-sm">
                      {order.status}
                    </span>
                  </div>
                  <p className="font-body text-[12px] text-stone">Placed on {order.date}</p>
                  {order.slot && (
                    <p className="font-body text-[12px] text-stone/80 mt-0.5 flex items-center gap-1.5">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                      {order.slot}
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

                {/* Subscription badge — wallet orders don't have invoices */}
                {order.isSubscriptionOrder && (
                  <Link
                    href="/wallet"
                    className="shrink-0 flex items-center gap-1.5 border border-sage/20 text-sage-dark/70 rounded-lg px-3 py-2 font-body text-[11px]"
                    title="View wallet transactions"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>
                    </svg>
                    Subscription · Wallet
                  </Link>
                )}
                {/* Invoice download — only for standalone delivered + paid orders */}
                {order.status === 'delivered' && order.payment_status === 'paid' && !order.isSubscriptionOrder && (
                  <a
                    href={`/invoice/${order.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 flex items-center gap-1.5 border border-sage/30 text-sage-dark hover:bg-sage/5 transition-colors rounded-lg px-3 py-2 font-body text-[12px] font-bold"
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
          ))}
        </div>
      )}
    </div>
  );
}
