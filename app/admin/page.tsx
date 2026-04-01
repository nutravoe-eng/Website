'use client';

import { useEffect, useState, useCallback } from 'react';
import OrdersTable, { type AdminOrder } from './components/OrdersTable';

export default function AdminTodayPage() {
  const [orders, setOrders]   = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  const today = new Date().toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/orders?date=today');
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setOrders(data.orders ?? []);
    } catch {
      setError('Could not load today\'s deliveries.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  const pending   = orders.filter(o => o.payment_status === 'pending');
  const paid      = orders.filter(o => o.payment_status === 'paid');
  const pendingAmt = pending.reduce((s, o) => s + Number(o.total), 0);
  const paidAmt    = paid.reduce((s, o) => s + Number(o.total), 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl text-ink">Today's Deliveries</h1>
          <p className="font-body text-[13px] text-stone mt-0.5">{today}</p>
        </div>
        <button
          onClick={fetchOrders}
          className="font-body text-[12px] font-bold uppercase tracking-wider text-stone hover:text-ink border border-black/10 rounded-lg px-3 py-2 hover:bg-black/5 transition-colors"
        >
          Refresh
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <StatCard label="Deliveries" value={String(orders.length)} />
        <StatCard label="Pending Payment" value={`₹${pendingAmt.toLocaleString('en-IN')}`} sub={`${pending.length} orders`} alert />
        <StatCard label="Collected" value={`₹${paidAmt.toLocaleString('en-IN')}`} sub={`${paid.length} orders`} />
      </div>

      {error && <p className="font-body text-sm text-terracotta mb-4">{error}</p>}

      <OrdersTable
        orders={orders}
        loading={loading}
        onOrderUpdated={(updated) =>
          setOrders(prev => prev.map(o => o.id === updated.id ? { ...o, ...updated } : o))
        }
        showDate={false}
      />
    </div>
  );
}

function StatCard({ label, value, sub, alert }: {
  label: string; value: string; sub?: string; alert?: boolean;
}) {
  return (
    <div className={`bg-white rounded-xl border p-4 ${alert ? 'border-terracotta/30' : 'border-black/10'}`}>
      <p className="font-body text-[11px] font-bold uppercase tracking-wider text-stone mb-1">{label}</p>
      <p className={`font-display text-2xl ${alert ? 'text-terracotta' : 'text-ink'}`}>{value}</p>
      {sub && <p className="font-body text-[11px] text-stone mt-0.5">{sub}</p>}
    </div>
  );
}
