'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getWalletWithTransactions } from '@/lib/wallet';
import { formatCurrency } from '@/lib/utils';
import type { WalletLoad, WalletTransaction, Subscription } from '@/types';
import { createClient } from '@/lib/supabase/client';
import TopupModal from '@/app/(dashboard)/subscriptions/TopupModal';

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function getExpiryLabel(expiresAt: string | null) {
  if (!expiresAt) return 'No expiry';

  const now = Date.now();
  const expiry = new Date(expiresAt).getTime();
  const diffDays = Math.ceil((expiry - now) / 86_400_000);

  if (diffDays <= 0) return 'Expired';
  if (diffDays === 1) return 'Expires in 1 day';
  if (diffDays < 30) return `Expires in ${diffDays} days`;

  const diffMonths = Math.ceil(diffDays / 30);
  return `Expires in ${diffMonths} month${diffMonths === 1 ? '' : 's'}`;
}

function getLoadLabel(load: WalletLoad) {
  switch (load.sourceType) {
    case 'subscription_payment':
      return 'Subscription load';
    case 'refund':
      return 'Refund credit';
    case 'top_up':
      return 'Top-up';
    default:
      return 'Wallet credit';
  }
}

export default function WalletPage() {
  const router = useRouter();
  const [balancePaise, setBalancePaise] = useState(0);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [activeLoads, setActiveLoads] = useState<WalletLoad[]>([]);
  const [nextExpiryAt, setNextExpiryAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [flexibleSub, setFlexibleSub] = useState<Subscription | null>(null);
  const [flexibleCheckDone, setFlexibleCheckDone] = useState(false);
  const [showTopup, setShowTopup] = useState(false);
  const [topupRequests, setTopupRequests] = useState<
    {
      id: string;
      public_ref: string;
      amount_rs: number;
      status: string;
      admin_notes: string | null;
      created_at: string;
      resolved_at: string | null;
    }[]
  >([]);

  const refresh = useCallback(async () => {
    const [data, topupRes] = await Promise.all([
      getWalletWithTransactions(),
      fetch('/api/wallet/topup-requests').then((r) => (r.ok ? r.json() : { requests: [] })),
    ]);
    setBalancePaise(data.balancePaise);
    setTransactions(data.transactions);
    setActiveLoads(data.activeLoads ?? []);
    setNextExpiryAt(data.nextExpiryAt ?? null);
    setTopupRequests(Array.isArray(topupRes?.requests) ? topupRes.requests : []);
    setLoading(false);
  }, []);

  // Fetch active flexible subscription — redirect away if user has no flexible plan
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { setFlexibleCheckDone(true); return; }
      const { data } = await supabase
        .from('subscriptions')
        .select('id, plan_id, style, status, period_end_date, wallet_balance_rs')
        .eq('user_id', user.id)
        .eq('style', 'flexible')
        .eq('status', 'active')
        .maybeSingle();
      if (data) {
        setFlexibleSub({
          id: data.id,
          planId: data.plan_id as Subscription['planId'],
          deliveryStyle: 'flexible',
          status: 'active',
          dayConfigs: [],
          weeklyPrice: 0,
          deliveryAddress: '',
          createdAt: '',
          nextDelivery: '',
          periodEndDate: data.period_end_date ?? undefined,
          walletBalancePaise: data.wallet_balance_rs ? data.wallet_balance_rs * 100 : 0,
        });
      } else {
        // No flexible subscription — wallet doesn't apply, send to subscriptions
        router.replace('/subscriptions');
        return;
      }
      setFlexibleCheckDone(true);
    });
  }, [router]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (loading || !flexibleCheckDone) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-sage border-t-transparent" />
      </div>
    );
  }

  return (
    <div>
      {showTopup && flexibleSub && (
        <TopupModal sub={flexibleSub} onClose={() => setShowTopup(false)} onCreated={refresh} />
      )}

      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-medium text-ink">Nutravoe Wallet</h2>
          <p className="mt-1 font-body text-[13px] text-stone">
            Funds load only after your subscription payment is approved.
          </p>
        </div>
        {flexibleSub && (
          <button
            onClick={() => setShowTopup(true)}
            className="shrink-0 flex items-center gap-2 bg-sage hover:bg-sage-dark text-white font-body text-[13px] font-bold px-4 py-2.5 rounded-lg transition-colors shadow-sm"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14"/><path d="M5 12h14"/>
            </svg>
            Top Up Wallet
          </button>
        )}
      </div>

      <div className={`mb-6 rounded-xl border p-6 ${balancePaise > 0 ? 'border-sage/20 bg-sage/5' : 'border-amber-200 bg-amber-50/50'}`}>
        <p className="mb-2 font-body text-[11px] font-bold uppercase tracking-wider text-stone">Available balance</p>
        <p className={`mb-2 font-display text-5xl font-medium ${balancePaise > 0 ? 'text-sage-dark' : 'text-terracotta'}`}>
          {formatCurrency(balancePaise / 100)}
        </p>
        <p className="font-body text-[12px] text-stone">
          {balancePaise > 0
            ? nextExpiryAt
              ? getExpiryLabel(nextExpiryAt)
              : 'Wallet funds available'
            : nextExpiryAt && new Date(nextExpiryAt) < new Date()
              ? `Your wallet balance expired on ${new Date(nextExpiryAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}. Contact Nutravoe to renew your subscription.`
              : transactions.length > 0
                ? 'Your subscription balance has been fully used. Contact Nutravoe to renew.'
                : 'No funds yet — balance loads after Nutravoe approves your subscription payment.'
          }
        </p>
      </div>

      <div className="mb-8 rounded-xl border border-black/6 bg-[#F9F8F6] p-5">
        <p className="mb-3 font-body text-[11px] font-bold uppercase tracking-wider text-stone">How it works</p>
        <div className="space-y-2">
          {[
            'Your wallet starts at zero and is loaded only after Nutravoe approves the subscription payment.',
            'Weekly subscription funds expire 7 days from approval. Monthly subscription funds expire 1 month from approval.',
            'Each scheduled delivery deducts from the earliest-expiring available balance first.',
          ].map((line, index) => (
            <div key={line} className="flex items-start gap-2.5">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sage/15 font-body text-[10px] font-bold text-sage-dark">
                {index + 1}
              </span>
              <p className="font-body text-[12px] leading-relaxed text-stone">{line}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="mb-8">
        <p className="mb-4 font-body text-[11px] font-bold uppercase tracking-wider text-stone">Top-up requests</p>
        {topupRequests.length === 0 ? (
          <div className="rounded-xl border border-dashed border-black/10 py-8 text-center">
            <p className="font-body text-[13px] italic text-stone">No top-up requests yet.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {topupRequests.map((req) => (
              <div
                key={req.id}
                className="flex flex-col gap-2 rounded-xl border border-black/6 bg-white p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-body text-[13px] font-bold text-ink">{req.public_ref}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 font-body text-[10px] font-bold uppercase tracking-wide ${
                        req.status === 'pending'
                          ? 'bg-amber-100 text-amber-900'
                          : req.status === 'approved'
                            ? 'bg-sage/15 text-sage-dark'
                            : req.status === 'rejected'
                              ? 'bg-terracotta/10 text-terracotta'
                              : 'bg-black/5 text-stone'
                      }`}
                    >
                      {req.status}
                    </span>
                  </div>
                  <p className="mt-1 font-body text-[12px] text-stone">
                    {formatCurrency(req.amount_rs)} · Requested {formatDate(req.created_at)}
                    {req.resolved_at ? ` · Resolved ${formatDate(req.resolved_at)}` : ''}
                  </p>
                  {req.status === 'rejected' && req.admin_notes && (
                    <p className="mt-1 font-body text-[12px] text-terracotta">{req.admin_notes}</p>
                  )}
                </div>
                {req.status === 'pending' && (
                  <button
                    type="button"
                    onClick={async () => {
                      const res = await fetch(`/api/wallet/topup-requests/${req.id}/cancel`, { method: 'PATCH' });
                      if (res.ok) await refresh();
                    }}
                    className="shrink-0 self-start font-body text-[12px] font-medium text-stone underline decoration-black/20 hover:text-terracotta sm:self-center"
                  >
                    Cancel request
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mb-8">
        <p className="mb-4 font-body text-[11px] font-bold uppercase tracking-wider text-stone">Active wallet loads</p>
        {activeLoads.length === 0 ? (
          <div className="rounded-xl border border-dashed border-black/10 py-10 text-center">
            <p className="font-body text-[13px] italic text-stone">No active wallet loads</p>
          </div>
        ) : (
          <div className="space-y-2">
            {activeLoads.map((load) => (
              <div key={load.id} className="flex items-center justify-between rounded-xl border border-black/6 bg-white p-4">
                <div>
                  <p className="font-body text-[13px] font-medium text-ink">{getLoadLabel(load)}</p>
                  <p className="mt-1 font-body text-[11px] text-stone">
                    Loaded {formatDate(load.createdAt)} | {getExpiryLabel(load.expiresAt)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-body text-[12px] text-stone">Remaining</p>
                  <p className="font-body text-[14px] font-bold text-sage-dark">{formatCurrency(load.remainingAmountPaise / 100)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <p className="mb-4 font-body text-[11px] font-bold uppercase tracking-wider text-stone">Transaction history</p>
        {transactions.length === 0 ? (
          <div className="rounded-xl border border-dashed border-black/10 py-10 text-center">
            <p className="font-body text-[13px] italic text-stone">No transactions yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {transactions.map((tx) => (
              <div key={tx.id} className="flex items-center justify-between rounded-xl border border-black/6 bg-white p-4">
                <div className="flex items-center gap-3">
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${tx.type === 'credit' ? 'bg-sage/10' : 'bg-terracotta/10'}`}>
                    {tx.type === 'credit' ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4E6B49" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m5 12 7-7 7 7" />
                        <path d="M12 19V5" />
                      </svg>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#C4714A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m19 12-7 7-7-7" />
                        <path d="M12 5v14" />
                      </svg>
                    )}
                  </div>
                  <div>
                    <p className="font-body text-[13px] font-medium text-ink">{tx.description}</p>
                    <p className="font-body text-[11px] text-stone">{formatDate(tx.createdAt)}</p>
                  </div>
                </div>
                <p className={`font-body text-[14px] font-bold ${tx.type === 'credit' ? 'text-sage-dark' : 'text-terracotta'}`}>
                  {tx.type === 'credit' ? '+' : '-'}{formatCurrency(tx.amountPaise / 100)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
