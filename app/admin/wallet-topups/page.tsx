'use client';

import { useCallback, useEffect, useState } from 'react';

type StatusFilter = 'pending' | 'all' | 'approved' | 'rejected' | 'cancelled';

interface AdminTopupRequest {
  id: string;
  public_ref: string;
  user_id: string;
  subscription_id: string;
  amount_rs: number;
  status: string;
  payment_reference: string | null;
  user_note: string | null;
  admin_notes: string | null;
  created_at: string;
  resolved_at: string | null;
  users: { id: string; full_name: string; phone: string; email: string } | null;
  subscriptions: {
    id: string;
    period_end_date: string | null;
    plan_id: string | null;
    subscription_plans: { id: string; name: string; slug: string } | null;
  } | null;
}

export default function AdminWalletTopupsPage() {
  const [requests, setRequests] = useState<AdminTopupRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending');
  const [toast, setToast] = useState('');
  const [approveId, setApproveId] = useState<string | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [upiRef, setUpiRef] = useState('');
  const [rejectNote, setRejectNote] = useState('');
  const [saving, setSaving] = useState(false);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 3500);
  }

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/wallet-topups?status=${statusFilter}`);
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      setRequests(data.requests ?? []);
    } catch {
      setError('Could not load wallet top-up requests.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  async function handleApprove() {
    if (!approveId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/wallet-topups/${approveId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payment_reference: upiRef.trim() || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data?.error === 'string' ? data.error : 'Failed');
      showToast('Top-up approved — wallet credited');
      setApproveId(null);
      setUpiRef('');
      await fetchRequests();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Failed to approve');
    } finally {
      setSaving(false);
    }
  }

  async function handleReject() {
    if (!rejectId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/wallet-topups/${rejectId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ admin_notes: rejectNote.trim() || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data?.error === 'string' ? data.error : 'Failed');
      showToast('Request rejected');
      setRejectId(null);
      setRejectNote('');
      await fetchRequests();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Failed to reject');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl text-ink">Wallet top-ups</h1>
          <p className="mt-0.5 font-body text-[13px] text-stone">Approve or reject customer top-up requests after payment.</p>
        </div>
        <button
          type="button"
          onClick={() => fetchRequests()}
          className="font-body text-[12px] font-bold uppercase tracking-wider text-stone hover:text-ink border border-black/10 rounded-lg px-3 py-2 hover:bg-black/5 transition-colors self-start"
        >
          Refresh
        </button>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {(['pending', 'all', 'approved', 'rejected', 'cancelled'] as StatusFilter[]).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatusFilter(s)}
            className={`rounded-full px-3 py-1.5 font-body text-[11px] font-bold uppercase tracking-wider transition-colors ${
              statusFilter === s ? 'bg-ink text-white' : 'bg-black/5 text-stone hover:bg-black/10'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {toast && (
        <div className="mb-4 rounded-lg border border-sage/30 bg-sage/10 px-4 py-2 font-body text-[13px] text-sage-dark">
          {toast}
        </div>
      )}
      {error && <p className="mb-4 font-body text-sm text-terracotta">{error}</p>}

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-sage border-t-transparent" />
        </div>
      ) : requests.length === 0 ? (
        <div className="rounded-xl border border-dashed border-black/10 bg-white py-16 text-center">
          <p className="font-body text-[14px] text-stone">No requests in this view.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-black/10 bg-white">
          <table className="w-full min-w-[720px] text-left">
            <thead>
              <tr className="border-b border-black/10 bg-[#F9F8F6]">
                <th className="px-4 py-3 font-body text-[11px] font-bold uppercase tracking-wider text-stone">Ref</th>
                <th className="px-4 py-3 font-body text-[11px] font-bold uppercase tracking-wider text-stone">Customer</th>
                <th className="px-4 py-3 font-body text-[11px] font-bold uppercase tracking-wider text-stone">Plan</th>
                <th className="px-4 py-3 font-body text-[11px] font-bold uppercase tracking-wider text-stone">Amount</th>
                <th className="px-4 py-3 font-body text-[11px] font-bold uppercase tracking-wider text-stone">Status</th>
                <th className="px-4 py-3 font-body text-[11px] font-bold uppercase tracking-wider text-stone">Requested</th>
                <th className="px-4 py-3 font-body text-[11px] font-bold uppercase tracking-wider text-stone">Actions</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => (
                <tr key={r.id} className="border-b border-black/5 last:border-0">
                  <td className="px-4 py-3 font-body text-[13px] font-medium text-ink">{r.public_ref}</td>
                  <td className="px-4 py-3">
                    <p className="font-body text-[13px] text-ink">{r.users?.full_name ?? '—'}</p>
                    <p className="font-body text-[11px] text-stone">{r.users?.phone ?? r.users?.email ?? ''}</p>
                  </td>
                  <td className="px-4 py-3 font-body text-[12px] text-stone">
                    {r.subscriptions?.subscription_plans?.name ?? '—'}
                  </td>
                  <td className="px-4 py-3 font-body text-[13px] font-bold text-ink">₹{Number(r.amount_rs).toLocaleString('en-IN')}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-black/5 px-2 py-0.5 font-body text-[11px] font-bold uppercase text-stone">
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-body text-[12px] text-stone">
                    {new Date(r.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                  </td>
                  <td className="px-4 py-3">
                    {r.status === 'pending' ? (
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setApproveId(r.id)}
                          className="rounded-md bg-sage px-2.5 py-1.5 font-body text-[11px] font-bold text-white hover:bg-sage-dark"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          onClick={() => setRejectId(r.id)}
                          className="rounded-md border border-black/15 px-2.5 py-1.5 font-body text-[11px] font-medium text-stone hover:bg-black/5"
                        >
                          Reject
                        </button>
                      </div>
                    ) : (
                      <span className="font-body text-[11px] text-stone">
                        {r.payment_reference ? `Ref: ${r.payment_reference}` : '—'}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {approveId && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="font-display text-xl text-ink">Approve top-up</h2>
            <p className="mt-1 font-body text-[13px] text-stone">Credit wallet after you&apos;ve verified payment.</p>
            <label className="mt-4 block font-body text-[11px] font-bold uppercase text-stone" htmlFor="upi-ref">
              UPI / payment reference (optional)
            </label>
            <input
              id="upi-ref"
              value={upiRef}
              onChange={(e) => setUpiRef(e.target.value)}
              className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 font-body text-[13px]"
              placeholder="e.g. UPI transaction ID"
            />
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setApproveId(null);
                  setUpiRef('');
                }}
                className="flex-1 rounded-lg border border-black/10 py-2.5 font-body text-[13px] font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={handleApprove}
                className="flex-1 rounded-lg bg-sage py-2.5 font-body text-[13px] font-bold text-white hover:bg-sage-dark disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Confirm credit'}
              </button>
            </div>
          </div>
        </div>
      )}

      {rejectId && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="font-display text-xl text-ink">Reject request</h2>
            <p className="mt-1 font-body text-[13px] text-stone">Optional note for internal records (shown to customer if you add messaging later).</p>
            <textarea
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              rows={3}
              className="mt-3 w-full rounded-lg border border-black/10 px-3 py-2 font-body text-[13px]"
              placeholder="Reason (optional)"
            />
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setRejectId(null);
                  setRejectNote('');
                }}
                className="flex-1 rounded-lg border border-black/10 py-2.5 font-body text-[13px] font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={handleReject}
                className="flex-1 rounded-lg bg-terracotta py-2.5 font-body text-[13px] font-bold text-white hover:opacity-90 disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
