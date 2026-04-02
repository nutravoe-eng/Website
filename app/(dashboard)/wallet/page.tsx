'use client';

import { useCallback, useEffect, useState } from 'react';
import { getWalletWithTransactions } from '@/lib/wallet';
import { formatCurrency } from '@/lib/utils';
import type { WalletLoad, WalletTransaction } from '@/types';

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
    default:
      return 'Wallet credit';
  }
}

export default function WalletPage() {
  const [balancePaise, setBalancePaise] = useState(0);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [activeLoads, setActiveLoads] = useState<WalletLoad[]>([]);
  const [nextExpiryAt, setNextExpiryAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const data = await getWalletWithTransactions();
    setBalancePaise(data.balancePaise);
    setTransactions(data.transactions);
    setActiveLoads(data.activeLoads ?? []);
    setNextExpiryAt(data.nextExpiryAt ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-sage border-t-transparent" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-medium text-ink">Nutravoe Wallet</h2>
          <p className="mt-1 font-body text-[13px] text-stone">
            Funds load only after your subscription payment is approved.
          </p>
        </div>
      </div>

      <div className={`mb-6 rounded-xl border p-6 ${balancePaise > 0 ? 'border-sage/20 bg-sage/5' : 'border-black/8 bg-black/3'}`}>
        <p className="mb-2 font-body text-[11px] font-bold uppercase tracking-wider text-stone">Available balance</p>
        <p className={`mb-2 font-display text-5xl font-medium ${balancePaise > 0 ? 'text-sage-dark' : 'text-terracotta'}`}>
          {formatCurrency(balancePaise / 100)}
        </p>
        <p className="font-body text-[12px] text-stone">
          {balancePaise > 0
            ? nextExpiryAt
              ? getExpiryLabel(nextExpiryAt)
              : 'Wallet funds available'
            : 'No approved subscription funds in wallet yet'}
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
