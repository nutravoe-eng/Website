'use client';

import { useState, useEffect, useCallback } from 'react';
import { getWalletWithTransactions, creditWallet } from '@/lib/wallet';
import { formatCurrency } from '@/lib/utils';
import type { WalletTransaction } from '@/types';

const REFILL_PRESETS = [299, 598, 897, 1196];
const MIN_BOWL_PRICE_RS = 269;

export default function WalletPage() {
  const [balancePaise, setBalancePaise] = useState(0);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRefill, setShowRefill] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState('');
  const [refilling, setRefilling] = useState(false);
  const [refillSuccess, setRefillSuccess] = useState(false);

  const refresh = useCallback(async () => {
    const data = await getWalletWithTransactions();
    setBalancePaise(data.balancePaise);
    setTransactions(data.transactions);
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const balanceRs = balancePaise / 100;
  const isLow = balanceRs < MIN_BOWL_PRICE_RS && balancePaise > 0;
  const isEmpty = balancePaise === 0;
  const refillAmountRs = selectedPreset ?? (customAmount ? Number(customAmount) : 0);

  async function handleRefill() {
    if (!refillAmountRs || refillAmountRs <= 0) return;
    setRefilling(true);
    // In production: open Razorpay here, then credit on success callback
    const updated = await creditWallet(refillAmountRs * 100, `Wallet top-up — ${formatCurrency(refillAmountRs)}`);
    setBalancePaise(updated.balancePaise);
    await refresh(); // reload transactions
    setRefilling(false);
    setRefillSuccess(true);
    setShowRefill(false);
    setSelectedPreset(null);
    setCustomAmount('');
    setTimeout(() => setRefillSuccess(false), 3000);
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="w-6 h-6 rounded-full border-2 border-sage border-t-transparent animate-spin" />
    </div>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="font-display text-2xl font-medium text-ink">Nutravoe Wallet</h2>
          <p className="font-body text-[13px] text-stone mt-1">Used for flexible subscription orders</p>
        </div>
        <button
          onClick={() => { setShowRefill(true); setRefillSuccess(false); }}
          className="bg-terracotta hover:bg-[#D55F43] text-white font-body text-[13px] font-bold tracking-wide px-5 py-2.5 rounded-md transition-colors shadow-sm"
        >
          + Top Up
        </button>
      </div>

      {/* Balance card */}
      <div className={`rounded-xl p-6 mb-6 ${isEmpty ? 'bg-black/3 border border-black/8' : isLow ? 'bg-terracotta/5 border border-terracotta/20' : 'bg-sage/5 border border-sage/20'}`}>
        <p className="font-body text-[11px] font-bold uppercase tracking-wider text-stone mb-2">Current Balance</p>
        <p className={`font-display text-5xl font-medium mb-1 ${isLow || isEmpty ? 'text-terracotta' : 'text-sage-dark'}`}>
          {formatCurrency(balanceRs)}
        </p>
        <p className="font-body text-[12px] text-stone">
          {isEmpty
            ? 'No balance — subscribe to a Flexible plan to load your wallet'
            : isLow
            ? `Low balance — not enough for one bowl (min. ${formatCurrency(MIN_BOWL_PRICE_RS)})`
            : `≈ ${Math.floor(balanceRs / MIN_BOWL_PRICE_RS)} bowl${Math.floor(balanceRs / MIN_BOWL_PRICE_RS) !== 1 ? 's' : ''} remaining`}
        </p>
        {(isLow || isEmpty) && (
          <button
            onClick={() => setShowRefill(true)}
            className="mt-4 inline-flex items-center gap-1.5 font-body text-[12px] font-bold text-terracotta hover:underline"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>
            </svg>
            Top up now
          </button>
        )}
      </div>

      {refillSuccess && (
        <div className="flex items-center gap-2 p-3 bg-sage/10 border border-sage/20 rounded-lg mb-6">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4E6B49" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          <p className="font-body text-[13px] font-medium text-sage-dark">Wallet topped up successfully</p>
        </div>
      )}

      {/* How it works */}
      <div className="bg-[#F9F8F6] rounded-xl border border-black/6 p-5 mb-8">
        <p className="font-body text-[11px] font-bold uppercase tracking-wider text-stone mb-3">How it works</p>
        <div className="space-y-2">
          {[
            'Your wallet is loaded when you pay for a Flexible subscription',
            'Each bowl you schedule deducts the per-bowl price from your balance',
            'Ingredient extras are charged additionally and deducted automatically',
            'Your wallet refills automatically every week while your subscription is active',
          ].map((line, i) => (
            <div key={i} className="flex items-start gap-2.5">
              <span className="w-5 h-5 rounded-full bg-sage/15 text-sage font-body text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
              <p className="font-body text-[12px] text-stone leading-relaxed">{line}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Transaction history */}
      <div>
        <p className="font-body text-[11px] font-bold uppercase tracking-wider text-stone mb-4">Transaction History</p>
        {transactions.length === 0 ? (
          <div className="text-center py-10 border border-dashed border-black/10 rounded-xl">
            <p className="font-body text-[13px] text-stone italic">No transactions yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {transactions.map(tx => (
              <div key={tx.id} className="flex items-center justify-between p-4 bg-white border border-black/6 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${tx.type === 'credit' ? 'bg-sage/10' : 'bg-terracotta/10'}`}>
                    {tx.type === 'credit'
                      ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4E6B49" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 7-7 7 7"/><path d="M12 19V5"/></svg>
                      : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#C4714A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m19 12-7 7-7-7"/><path d="M12 5v14"/></svg>
                    }
                  </div>
                  <div>
                    <p className="font-body text-[13px] font-medium text-ink">{tx.description}</p>
                    <p className="font-body text-[11px] text-stone">{formatDate(tx.createdAt)}</p>
                  </div>
                </div>
                <p className={`font-body text-[14px] font-bold ${tx.type === 'credit' ? 'text-sage-dark' : 'text-terracotta'}`}>
                  {tx.type === 'credit' ? '+' : '−'}{formatCurrency(tx.amountPaise / 100)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Refill modal */}
      {showRefill && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-ink/70 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="px-6 py-5 border-b border-black/5 flex items-center justify-between">
              <h3 className="font-display text-xl font-medium text-ink">Top Up Wallet</h3>
              <button onClick={() => { setShowRefill(false); setSelectedPreset(null); setCustomAmount(''); }} className="text-stone hover:text-ink transition-colors">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
              </button>
            </div>
            <div className="p-6">
              <p className="font-body text-[13px] text-stone mb-4">Choose an amount to add to your wallet</p>
              <div className="grid grid-cols-2 gap-2 mb-4">
                {REFILL_PRESETS.map(amount => (
                  <button
                    key={amount}
                    onClick={() => { setSelectedPreset(amount); setCustomAmount(''); }}
                    className={`p-3 rounded-xl border text-left transition-all ${selectedPreset === amount ? 'border-terracotta bg-terracotta/5' : 'border-black/10 hover:border-terracotta/40'}`}
                  >
                    <p className="font-display text-lg font-medium text-ink">{formatCurrency(amount)}</p>
                    <p className="font-body text-[10px] text-stone">≈ {Math.floor(amount / MIN_BOWL_PRICE_RS)} bowl{Math.floor(amount / MIN_BOWL_PRICE_RS) !== 1 ? 's' : ''}</p>
                  </button>
                ))}
              </div>
              <div className="mb-5">
                <label className="font-body text-[11px] font-bold uppercase tracking-wider text-stone block mb-1.5">Or enter custom amount</label>
                <div className="flex items-center border border-black/15 rounded-lg px-3 focus-within:border-terracotta transition-colors">
                  <span className="font-body text-[14px] text-stone mr-1">₹</span>
                  <input
                    type="number" min="1" value={customAmount}
                    onChange={e => { setCustomAmount(e.target.value); setSelectedPreset(null); }}
                    placeholder="Enter amount"
                    className="flex-1 py-3 font-body text-[14px] text-ink bg-transparent outline-none"
                  />
                </div>
              </div>
              {refillAmountRs > 0 && (
                <div className="flex items-center justify-between p-3 bg-sage/5 border border-sage/20 rounded-lg mb-4">
                  <p className="font-body text-[13px] text-stone">New balance after top-up</p>
                  <p className="font-body text-[14px] font-bold text-sage-dark">{formatCurrency(balanceRs + refillAmountRs)}</p>
                </div>
              )}
              <button
                onClick={handleRefill}
                disabled={refillAmountRs <= 0 || refilling}
                className="w-full bg-terracotta hover:bg-[#D55F43] disabled:bg-black/10 disabled:text-stone text-white font-body text-sm font-bold tracking-wide py-3.5 rounded-md transition-colors shadow-sm"
              >
                {refilling ? 'Processing...' : `Pay ${refillAmountRs > 0 ? formatCurrency(refillAmountRs) : ''} & Top Up`}
              </button>
              <p className="font-body text-[11px] text-stone text-center mt-2">Amount will be added to your wallet instantly on payment</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
