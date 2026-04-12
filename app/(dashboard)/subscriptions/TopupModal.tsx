'use client';

import { useRef, useState } from 'react';
import type { Subscription } from '@/types';
import { buildTopupWhatsAppMessage } from '@/lib/utils';
import { useDialogAccessibility } from '@/lib/use-dialog-accessibility';
import { getWhatsAppHref } from '@/lib/contact';
import { STUB_PLANS } from '@/app/subscribe/PlanCard';

interface Props {
  sub: Subscription;
  onClose: () => void;
  onCreated?: () => void;
}

export default function TopupModal({ sub, onClose, onCreated }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [amount, setAmount] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  useDialogAccessibility(dialogRef, onClose);

  const numericAmount = parseFloat(amount) || 0;
  const isValid = numericAmount > 0;

  const expiryDate = sub.periodEndDate
    ? new Date(sub.periodEndDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    : 'the end of your cycle';

  const planLabel = STUB_PLANS.find((p) => p.id === sub.planId)?.name ?? sub.planId;

  async function handleSendRequest() {
    if (!isValid) return;
    setSubmitting(true);
    setError('');

    try {
      const res = await fetch('/api/wallet/topup-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscription_id: sub.id,
          amount_rs: numericAmount,
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(typeof data?.error === 'string' ? data.error : 'Could not submit request. Try again.');
        return;
      }

      const publicRef = typeof data?.public_ref === 'string' ? data.public_ref : '';
      if (!publicRef) {
        setError('Unexpected response from server.');
        return;
      }

      const message = buildTopupWhatsAppMessage({
        subscriptionId: sub.id,
        planName: planLabel,
        amount: numericAmount,
        expiryDate,
        publicRef,
      });

      window.open(getWhatsAppHref(message), '_blank', 'noopener,noreferrer');
      onCreated?.();
      onClose();
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-ink/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="topup-title"
        tabIndex={-1}
        className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200 flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-black/5">
          <h3 id="topup-title" className="font-display text-xl font-medium text-ink">Top up Wallet</h3>
          <button onClick={onClose} className="text-stone hover:text-ink transition-colors p-1 rounded-md">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-6">
          {error && (
            <div className="rounded-xl border border-terracotta/30 bg-terracotta/5 px-4 py-3">
              <p className="font-body text-[13px] text-terracotta">{error}</p>
            </div>
          )}
          <div>
            <label htmlFor="topup-amount" className="block font-body text-[11px] font-bold uppercase tracking-wider text-stone mb-2">
              Enter Amount (₹)
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-stone font-body font-bold">₹</span>
              <input
                id="topup-amount"
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                min={100}
                max={50000}
                className="w-full pl-8 pr-4 py-3 bg-[#F9F8F6] border border-black/10 rounded-xl font-body text-lg font-bold text-ink focus:outline-none focus:ring-2 focus:ring-sage/40"
                autoFocus
              />
            </div>
            <p className="font-body text-[11px] text-stone mt-2">
              ₹100 – ₹50,000. Covers bowl customizations or extra orders after Nutravoe confirms payment.
            </p>
          </div>

          <div className="bg-terracotta/5 border border-terracotta/20 rounded-xl p-4">
            <div className="flex gap-3">
              <div className="w-5 h-5 rounded-full bg-terracotta/10 flex items-center justify-center shrink-0 mt-0.5">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#E67E22" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12" y2="17.01"/>
                </svg>
              </div>
              <div>
                <p className="font-body text-[12px] font-bold text-terracotta mb-1">Expiration Warning</p>
                <p className="font-body text-[12px] text-stone leading-relaxed">
                  This amount will expire on <span className="font-bold text-ink">{expiryDate}</span> at the end of your current subscription cycle.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-black/5 flex gap-3">
          <button
            onClick={onClose}
            disabled={submitting}
            className="flex-1 border border-black/10 hover:bg-[#F9F8F6] text-ink font-body text-[13px] font-medium py-3 rounded-md transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSendRequest}
            disabled={!isValid || submitting}
            className="flex-1 bg-sage hover:bg-sage-dark disabled:bg-black/10 disabled:text-stone text-white font-body text-[13px] font-bold py-3 rounded-md transition-colors shadow-sm flex items-center justify-center gap-2"
          >
            {submitting ? 'Submitting…' : 'Send Request'}
            {!submitting && (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 2L11 13"/><path d="m22 2-7 20-4-9-9-4Z"/>
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
