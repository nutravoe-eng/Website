'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import type { Subscription } from '@/types';
import { PLANS } from '../../subscribe/PlanCard';

type Step = 'appeal' | 'reason' | 'confirm' | 'farewell';

const REASONS = [
  { id: 'wallet',     label: "It's putting a strain on my wallet" },
  { id: 'skipping',   label: "I keep skipping breakfast anyway" },
  { id: 'variety',    label: "I wish there were more bowl options" },
  { id: 'travelling', label: "I'm travelling or relocating soon" },
  { id: 'diet',       label: "I'm changing my diet entirely" },
  { id: 'break',      label: "I just need a short break", offerPause: true },
  { id: 'other',      label: "Something else entirely" },
];

const CONFIRM_PHRASE = 'goodbye healthy mornings';

interface Props {
  sub: Subscription;
  onPause: () => void;
  onCancel: () => void;
  onClose: () => void;
}

export default function CancelModal({ sub, onPause, onCancel, onClose }: Props) {
  const [step, setStep] = useState<Step>('appeal');
  const [reasonId, setReasonId] = useState('');
  const [otherText, setOtherText] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [inputError, setInputError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const plan = PLANS.find(p => p.id === sub.planId);
  const bowlsPerWeek = plan?.bowlsPerWeek ?? 1;

  const weeksActive = (() => {
    try {
      const d = new Date(sub.createdAt);
      if (isNaN(d.getTime())) return 1;
      return Math.max(1, Math.round((Date.now() - d.getTime()) / (7 * 86_400_000)));
    } catch { return 1; }
  })();
  const totalBowls = weeksActive * bowlsPerWeek;

  const selectedReason = REASONS.find(r => r.id === reasonId);
  const offerPause = !!(selectedReason && 'offerPause' in selectedReason && selectedReason.offerPause);

  const canProceedReason =
    reasonId !== '' &&
    (reasonId !== 'other' || otherText.trim().length > 0);

  const confirmMatches = confirmText.trim().toLowerCase() === CONFIRM_PHRASE;

  useEffect(() => {
    if (step === 'confirm') setTimeout(() => inputRef.current?.focus(), 150);
  }, [step]);

  // Clear input error when user starts typing correctly
  useEffect(() => {
    if (confirmMatches) setInputError(false);
  }, [confirmMatches]);

  function handleCancelAttempt() {
    if (!confirmMatches) { setInputError(true); inputRef.current?.focus(); return; }
    onCancel();
    setStep('farewell');
  }

  function handlePauseInstead() {
    onPause();
    onClose();
  }

  // ── Shared close button ──────────────────────────────────────────────────────
  const CloseBtn = () => (
    <button onClick={onClose} className="text-stone hover:text-ink transition-colors p-1 rounded-md">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
      </svg>
    </button>
  );

  return (
    <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-ink/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md shadow-2xl flex flex-col overflow-hidden max-h-[95vh] animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-250">

        {/* ── STEP 1: Emotional appeal ─────────────────────────────────────── */}
        {step === 'appeal' && (
          <>
            {/* Close row */}
            <div className="flex justify-end px-5 pt-5 shrink-0">
              <CloseBtn />
            </div>

            {/* Scrollable content */}
            <div className="overflow-y-auto px-6 pb-2 flex-1">
              {/* Heart icon */}
              <div className="w-14 h-14 rounded-full bg-terracotta/10 flex items-center justify-center mb-5">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#C4714A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                </svg>
              </div>

              <h2 className="font-display text-[26px] font-medium text-ink mb-3 leading-tight">
                We hate to see you go.
              </h2>
              <p className="font-body text-[14px] text-stone leading-relaxed mb-6">
                You've kept up{' '}
                <strong className="text-ink">{totalBowls} healthy morning{totalBowls !== 1 ? 's' : ''}</strong>{' '}
                with Nutravoe over {weeksActive} week{weeksActive !== 1 ? 's' : ''}. That's something worth holding on to.
              </p>

              {/* Benefits */}
              <div className="space-y-3.5 mb-2">
                {([
                  ['20g+ protein per bowl', 'More than two eggs. Enough to actually fuel your morning.'],
                  ['Probiotic yogurt base', 'Your gut works harder for you when you feed it right.'],
                  ['Zero prep, every day', 'Nourishment without the 6 AM effort. Your mornings, simplified.'],
                  ['Seasonal, fresh ingredients', 'Hand-prepared daily. Never mass-produced, never sitting in a factory.'],
                ] as [string, string][]).map(([title, desc]) => (
                  <div key={title} className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-full bg-sage/15 flex items-center justify-center shrink-0 mt-0.5">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#7D9B76" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </div>
                    <div>
                      <p className="font-body text-[13px] font-semibold text-ink">{title}</p>
                      <p className="font-body text-[12px] text-stone leading-relaxed">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* CTAs */}
            <div className="px-6 pb-8 pt-5 flex flex-col gap-3 shrink-0">
              <button
                onClick={onClose}
                className="w-full bg-sage hover:bg-sage-dark text-white font-body text-sm font-bold tracking-wide py-3.5 rounded-md transition-colors shadow-sm"
              >
                Keep my plan — I'll stay healthy
              </button>
              <button
                onClick={() => setStep('reason')}
                className="w-full text-stone hover:text-ink font-body text-[13px] font-medium py-2 transition-colors"
              >
                I still want to cancel
              </button>
            </div>
          </>
        )}

        {/* ── STEP 2: Reason ───────────────────────────────────────────────── */}
        {step === 'reason' && (
          <>
            <div className="flex items-center justify-between px-6 py-5 border-b border-black/5 shrink-0">
              <h3 className="font-display text-xl font-medium text-ink">Help us do better.</h3>
              <CloseBtn />
            </div>

            <div className="overflow-y-auto px-6 py-5 flex-1 space-y-4">
              <p className="font-body text-[13px] text-stone">
                Why are you cancelling? Your feedback genuinely helps us improve.
              </p>

              {/* Reason list */}
              <div className="space-y-2">
                {REASONS.map(reason => (
                  <button
                    key={reason.id}
                    onClick={() => { setReasonId(reason.id); setOtherText(''); }}
                    className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border text-left transition-all ${
                      reasonId === reason.id
                        ? 'border-terracotta/40 bg-terracotta/5'
                        : 'border-black/8 hover:border-black/20 bg-white'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors ${
                      reasonId === reason.id ? 'border-terracotta' : 'border-stone/40'
                    }`}>
                      {reasonId === reason.id && <div className="w-2 h-2 rounded-full bg-terracotta" />}
                    </div>
                    <span className="font-body text-[13px] text-ink">{reason.label}</span>
                  </button>
                ))}
              </div>

              {/* "Other" free-text */}
              {reasonId === 'other' && (
                <div className="animate-in slide-in-from-top-2 duration-200">
                  <textarea
                    autoFocus
                    value={otherText}
                    onChange={e => setOtherText(e.target.value)}
                    maxLength={300}
                    rows={3}
                    placeholder="Tell us what's on your mind..."
                    className="w-full border border-black/15 rounded-xl px-4 py-3 font-body text-[13px] text-ink placeholder:text-stone/40 focus:outline-none focus:border-terracotta/40 focus:ring-1 focus:ring-terracotta/20 resize-none"
                  />
                  <p className="font-body text-[11px] text-stone text-right mt-1">{otherText.length} / 300</p>
                </div>
              )}

              {/* Pause offer — shown when "short break" selected */}
              {offerPause && (
                <div className="bg-sage/10 border border-sage/25 rounded-xl p-4 animate-in slide-in-from-top-2 duration-200">
                  <p className="font-body text-[13px] font-semibold text-sage-dark mb-1">
                    You can pause instead of cancelling.
                  </p>
                  <p className="font-body text-[12px] text-stone leading-relaxed mb-3">
                    No charges while paused. Your bowl configuration and delivery schedule stay saved — resume whenever you're ready.
                  </p>
                  <button
                    onClick={handlePauseInstead}
                    className="bg-sage hover:bg-sage-dark text-white font-body text-[12px] font-bold px-5 py-2 rounded-md transition-colors shadow-sm"
                  >
                    Pause my subscription instead
                  </button>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between px-6 py-4 border-t border-black/5 shrink-0">
              <button
                onClick={() => setStep('appeal')}
                className="font-body text-[13px] font-medium text-stone hover:text-ink transition-colors flex items-center gap-1.5"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m15 18-6-6 6-6"/>
                </svg>
                Back
              </button>
              <button
                disabled={!canProceedReason}
                onClick={() => setStep('confirm')}
                className="bg-terracotta hover:bg-[#D55F43] disabled:bg-black/10 disabled:text-stone text-white font-body text-[13px] font-bold px-6 py-2.5 rounded-md transition-colors"
              >
                Continue
              </button>
            </div>
          </>
        )}

        {/* ── STEP 3: Confirm phrase ───────────────────────────────────────── */}
        {step === 'confirm' && (
          <>
            <div className="flex items-center justify-between px-6 py-5 border-b border-black/5 shrink-0">
              <h3 className="font-display text-xl font-medium text-ink">One last thing.</h3>
              <CloseBtn />
            </div>

            <div className="overflow-y-auto px-6 py-5 flex-1 space-y-5">
              {/* What they're giving up */}
              <div>
                <p className="font-body text-[13px] text-stone mb-3">You're about to give up:</p>
                <div className="space-y-2">
                  {[
                    `${bowlsPerWeek} bowl${bowlsPerWeek !== 1 ? 's' : ''} of fresh, hand-prepared goodness each week`,
                    `Your daily dose of protein, fibre, and morning calm`,
                    `${totalBowls} healthy morning${totalBowls !== 1 ? 's' : ''} you already built for yourself`,
                  ].map(line => (
                    <div key={line} className="flex items-start gap-2.5">
                      <span className="text-terracotta mt-0.5 leading-none font-bold shrink-0">·</span>
                      <p className="font-body text-[13px] text-ink leading-relaxed">{line}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Phrase confirmation */}
              <div>
                <p className="font-body text-[13px] text-stone mb-3">
                  If you're sure, type the phrase below to confirm:
                </p>

                {/* Phrase box */}
                <div className="bg-[#F9F8F6] border border-black/8 rounded-lg px-4 py-3 mb-3 text-center select-all cursor-text">
                  <p className="font-body text-[14px] font-bold text-ink tracking-wide">
                    {CONFIRM_PHRASE}
                  </p>
                </div>

                {/* Input */}
                <input
                  ref={inputRef}
                  type="text"
                  value={confirmText}
                  onChange={e => { setConfirmText(e.target.value); setInputError(false); }}
                  onKeyDown={e => { if (e.key === 'Enter') handleCancelAttempt(); }}
                  placeholder="Type the phrase above..."
                  className={`w-full border rounded-xl px-4 py-3 font-body text-[13px] text-ink placeholder:text-stone/40 focus:outline-none transition-all ${
                    inputError
                      ? 'border-terracotta ring-1 ring-terracotta/30'
                      : confirmMatches
                      ? 'border-sage/50 ring-1 ring-sage/20'
                      : 'border-black/15 focus:border-black/30'
                  }`}
                />

                {inputError && (
                  <p className="font-body text-[12px] text-terracotta mt-2 animate-in slide-in-from-top-1 duration-150">
                    That doesn't match. Type <em>exactly</em>: {CONFIRM_PHRASE}
                  </p>
                )}
                {confirmMatches && (
                  <p className="font-body text-[12px] text-sage mt-2 animate-in slide-in-from-top-1 duration-150">
                    Confirmed. You can proceed.
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between px-6 py-4 border-t border-black/5 shrink-0">
              <button
                onClick={() => { setStep('reason'); setConfirmText(''); setInputError(false); }}
                className="font-body text-[13px] font-medium text-stone hover:text-ink transition-colors flex items-center gap-1.5"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m15 18-6-6 6-6"/>
                </svg>
                Back
              </button>
              <button
                onClick={handleCancelAttempt}
                className={`font-body text-[13px] font-bold px-6 py-2.5 rounded-md transition-colors ${
                  confirmMatches
                    ? 'bg-terracotta hover:bg-[#D55F43] text-white'
                    : 'bg-black/8 text-stone cursor-not-allowed'
                }`}
              >
                Cancel My Subscription
              </button>
            </div>
          </>
        )}

        {/* ── STEP 4: Farewell ─────────────────────────────────────────────── */}
        {step === 'farewell' && (
          <div className="p-8 text-center">
            {/* Faded bowl icon */}
            <div className="w-16 h-16 rounded-full bg-stone/10 flex items-center justify-center mx-auto mb-6">
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 12h5l3 8 4-16 3 8h5"/>
              </svg>
            </div>

            <h2 className="font-display text-[26px] font-medium text-ink mb-3 leading-tight">
              We'll miss your mornings.
            </h2>
            <p className="font-body text-[14px] text-stone leading-relaxed mb-2">
              Your subscription has been cancelled. No further charges will be made.
            </p>
            <p className="font-body text-[13px] text-stone/70 leading-relaxed mb-8 max-w-xs mx-auto">
              Whenever life settles and you're ready to rebuild your morning ritual, we'll be here — same bowls, same care.
            </p>

            <div className="flex flex-col gap-3 max-w-xs mx-auto">
              <Link
                href="/subscribe"
                onClick={onClose}
                className="w-full bg-sage hover:bg-sage-dark text-white font-body text-sm font-bold tracking-wide py-3 rounded-md transition-colors shadow-sm text-center inline-block"
              >
                Re-subscribe anytime
              </Link>
              <button
                onClick={onClose}
                className="w-full border border-black/10 hover:bg-[#F9F8F6] text-ink font-body text-[13px] font-medium py-3 rounded-md transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
