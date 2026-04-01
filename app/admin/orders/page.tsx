'use client';

import { useEffect, useState, useCallback } from 'react';
import OrdersTable, { type AdminOrder } from '../components/OrdersTable';

type Filter = { date: string; payment_status: string; status: string };

export default function AdminOrdersPage() {
  const [orders, setOrders]   = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [filters, setFilters] = useState<Filter>({ date: '', payment_status: '', status: '' });

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (filters.date)           params.set('date', filters.date);
      if (filters.payment_status) params.set('payment_status', filters.payment_status);
      if (filters.status)         params.set('status', filters.status);
      const res = await fetch(`/api/admin/orders?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setOrders(data.orders ?? []);
    } catch {
      setError('Could not load orders.');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-2xl text-ink">All Orders</h1>
        <button
          onClick={fetchOrders}
          className="font-body text-[12px] font-bold uppercase tracking-wider text-stone hover:text-ink border border-black/10 rounded-lg px-3 py-2 hover:bg-black/5 transition-colors"
        >
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-black/10 p-4 mb-6 flex flex-wrap gap-3 items-end">
        <FilterField
          label="Date"
          type="date"
          value={filters.date}
          onChange={v => setFilters(f => ({ ...f, date: v }))}
        />
        <FilterSelect
          label="Payment"
          value={filters.payment_status}
          onChange={v => setFilters(f => ({ ...f, payment_status: v }))}
          options={[
            { value: '', label: 'All' },
            { value: 'pending', label: 'Pending' },
            { value: 'paid', label: 'Paid' },
          ]}
        />
        <FilterSelect
          label="Delivery"
          value={filters.status}
          onChange={v => setFilters(f => ({ ...f, status: v }))}
          options={[
            { value: '', label: 'All' },
            { value: 'pending', label: 'Pending' },
            { value: 'confirmed', label: 'Confirmed' },
            { value: 'out_for_delivery', label: 'Out for delivery' },
            { value: 'delivered', label: 'Delivered' },
            { value: 'cancelled', label: 'Cancelled' },
          ]}
        />
        <button
          onClick={() => setFilters({ date: '', payment_status: '', status: '' })}
          className="font-body text-[11px] text-stone hover:text-terracotta transition-colors self-end mb-0.5"
        >
          Clear filters
        </button>
      </div>

      <p className="font-body text-[12px] text-stone mb-3">
        {loading ? 'Loading…' : `${orders.length} order${orders.length !== 1 ? 's' : ''} found`}
      </p>

      {error && <p className="font-body text-sm text-terracotta mb-4">{error}</p>}

      <OrdersTable
        orders={orders}
        loading={loading}
        onOrderUpdated={(updated) =>
          setOrders(prev => prev.map(o => o.id === updated.id ? { ...o, ...updated } : o))
        }
        showDate={true}
      />
    </div>
  );
}

function FilterField({ label, type, value, onChange }: {
  label: string; type: string; value: string; onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block font-body text-[10px] font-bold uppercase tracking-wider text-stone mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="border border-black/10 rounded-lg px-3 py-2 font-body text-sm text-ink bg-[#F9F8F6] focus:outline-none focus:ring-2 focus:ring-sage/40"
      />
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <label className="block font-body text-[10px] font-bold uppercase tracking-wider text-stone mb-1">{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="border border-black/10 rounded-lg px-3 py-2 font-body text-sm text-ink bg-[#F9F8F6] focus:outline-none focus:ring-2 focus:ring-sage/40"
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}
