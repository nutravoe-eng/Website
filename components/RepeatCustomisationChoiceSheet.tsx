"use client";

import { useRef } from "react";
import { useDialogAccessibility } from "@/lib/use-dialog-accessibility";

interface Props {
  productName: string;
  lastSummaryLine?: string;
  onRepeatSame: () => void;
  onCustomiseDifferently: () => void;
  onClose: () => void;
}

/**
 * Shared with menu cart + subscribe: when adding another of the same bowl, choose whether
 * customisations should match the last one or be edited separately.
 */
export default function RepeatCustomisationChoiceSheet({
  productName,
  lastSummaryLine,
  onRepeatSame,
  onCustomiseDifferently,
  onClose,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useDialogAccessibility(ref, onClose);

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end md:items-center justify-center p-0 md:p-4 bg-ink/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="repeat-customisation-title"
        tabIndex={-1}
        className="bg-white rounded-t-2xl md:rounded-2xl w-full md:max-w-sm shadow-2xl animate-in slide-in-from-bottom-4 md:zoom-in-95 duration-200"
      >
        <div className="flex items-center justify-between px-6 py-5 border-b border-black/5">
          <div>
            <h3 id="repeat-customisation-title" className="font-display text-xl font-medium text-ink">
              Add another {productName}?
            </h3>
            <p className="font-body text-[12px] text-stone mt-0.5">Choose how you&apos;d like it</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 flex items-center justify-center rounded-full bg-black/5 hover:bg-black/10 text-stone hover:text-ink transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>
        <div className="p-4 flex flex-col gap-3 pb-8 md:pb-4">
          <button
            type="button"
            onClick={onRepeatSame}
            className="flex items-center gap-4 p-4 border border-black/10 hover:border-sage/40 rounded-xl hover:bg-sage/5 transition-all text-left group"
          >
            <div className="w-10 h-10 rounded-full bg-sage/10 text-sage-dark flex items-center justify-center shrink-0">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-body text-[14px] font-bold text-ink group-hover:text-sage-dark transition-colors">
                Repeat same customisation
              </p>
              {lastSummaryLine ? (
                <p className="font-body text-[11px] text-stone mt-0.5 line-clamp-2">{lastSummaryLine}</p>
              ) : null}
            </div>
          </button>
          <button
            type="button"
            onClick={onCustomiseDifferently}
            className="flex items-center gap-4 p-4 border border-black/10 hover:border-terracotta/40 rounded-xl hover:bg-terracotta/5 transition-all text-left group"
          >
            <div className="w-10 h-10 rounded-full bg-terracotta/10 text-terracotta flex items-center justify-center shrink-0">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                <path d="m15 5 4 4" />
              </svg>
            </div>
            <div>
              <p className="font-body text-[14px] font-bold text-ink group-hover:text-terracotta transition-colors">
                Customise differently
              </p>
              <p className="font-body text-[11px] text-stone mt-0.5">Opens ingredient options for this bowl</p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
