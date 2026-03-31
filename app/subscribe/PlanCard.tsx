'use client';

import type { PlanId, DeliveryStyle } from "@/types";

export interface PlanConfig {
  id: PlanId;
  name: string;
  bowlsPerWeek: number;
  weeklyPrice: number;
  perBowl: number;
  savingsBadge: string;
}

export const PLANS: PlanConfig[] = [
  { id: 'three-bowl', name: '3-Bowl / Week', bowlsPerWeek: 3, weeklyPrice: 852, perBowl: 284, savingsBadge: 'Save 5%' },
  { id: 'five-bowl', name: '5-Bowl / Week', bowlsPerWeek: 5, weeklyPrice: 1346, perBowl: 269, savingsBadge: 'Save 10%' },
  { id: 'daily', name: 'Daily Plan', bowlsPerWeek: 7, weeklyPrice: 1800, perBowl: 257, savingsBadge: 'Best Value' },
];

export const BULK_DAY_OPTIONS = [
  { value: 'next-day', label: 'Next Day' },
  { value: 'Mon', label: 'Mon' },
  { value: 'Tue', label: 'Tue' },
  { value: 'Wed', label: 'Wed' },
  { value: 'Thu', label: 'Thu' },
  { value: 'Fri', label: 'Fri' },
  { value: 'Sat', label: 'Sat' },
  { value: 'Sun', label: 'Sun' },
] as const;

interface Props {
  plan: PlanConfig;
  selected: boolean;
  deliveryStyle: DeliveryStyle | null;
  bulkDeliveryDay: string;
  onSelect: () => void;
  onDeliveryStyle: (style: DeliveryStyle) => void;
  onBulkDeliveryDay: (day: string) => void;
}

export default function PlanCard({
  plan, selected, deliveryStyle, bulkDeliveryDay,
  onSelect, onDeliveryStyle, onBulkDeliveryDay,
}: Props) {
  const isDaily = plan.id === 'daily';

  return (
    <div
      className={`rounded-xl border-2 p-6 cursor-pointer transition-all duration-200 ${
        selected ? 'border-terracotta bg-terracotta/5' : 'border-black/10 bg-white hover:border-terracotta/40'
      }`}
      onClick={onSelect}
    >
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="font-display text-xl font-medium text-ink">{plan.name}</h3>
          <p className="font-body text-[13px] text-stone mt-1">{plan.bowlsPerWeek} bowls delivered weekly</p>
        </div>
        <span className="bg-sage/10 text-sage font-body text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full shrink-0 ml-3">
          {plan.savingsBadge}
        </span>
      </div>

      <div className="flex items-baseline gap-1 mb-1">
        <span className="font-display text-3xl font-medium text-ink">₹{plan.weeklyPrice.toLocaleString('en-IN')}</span>
        <span className="font-body text-[13px] text-stone">/week</span>
      </div>
      <p className="font-body text-[12px] text-stone">₹{plan.perBowl} per bowl</p>

      {selected && (
        <div className="flex items-center gap-2 mt-4">
          <div className="w-5 h-5 rounded-full bg-terracotta flex items-center justify-center shrink-0">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <span className="font-body text-[13px] font-bold text-terracotta">Selected</span>
        </div>
      )}

      {selected && !isDaily && (
        <div className="mt-5 pt-5 border-t border-black/5" onClick={e => e.stopPropagation()}>
          <p className="font-body text-[11px] font-bold uppercase tracking-wider text-stone mb-3">Delivery Style</p>
          <div className="flex flex-col gap-2">
            {/* Spread option */}
            <button
              onClick={() => onDeliveryStyle('spread')}
              className={`flex items-center gap-3 p-3 rounded-lg border text-left transition-all ${
                deliveryStyle === 'spread' ? 'border-sage bg-sage/10' : 'border-black/10 bg-white hover:border-sage/50'
              }`}
            >
              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${deliveryStyle === 'spread' ? 'border-sage' : 'border-stone/40'}`}>
                {deliveryStyle === 'spread' && <div className="w-2 h-2 rounded-full bg-sage" />}
              </div>
              <div>
                <p className="font-body text-[13px] font-semibold text-ink">Spread across the week</p>
                <p className="font-body text-[11px] text-stone">Pick specific delivery days</p>
              </div>
            </button>

            {/* Bulk option */}
            <button
              onClick={() => onDeliveryStyle('bulk')}
              className={`flex items-center gap-3 p-3 rounded-lg border text-left transition-all ${
                deliveryStyle === 'bulk' ? 'border-sage bg-sage/10' : 'border-black/10 bg-white hover:border-sage/50'
              }`}
            >
              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${deliveryStyle === 'bulk' ? 'border-sage' : 'border-stone/40'}`}>
                {deliveryStyle === 'bulk' && <div className="w-2 h-2 rounded-full bg-sage" />}
              </div>
              <div>
                <p className="font-body text-[13px] font-semibold text-ink">Bulk delivery</p>
                <p className="font-body text-[11px] text-stone">All bowls on one day</p>
              </div>
            </button>

            {/* Flexible / Wallet option */}
            <button
              onClick={() => onDeliveryStyle('flexible')}
              className={`flex items-center gap-3 p-3 rounded-lg border text-left transition-all ${
                deliveryStyle === 'flexible' ? 'border-terracotta bg-terracotta/5' : 'border-black/10 bg-white hover:border-terracotta/40'
              }`}
            >
              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${deliveryStyle === 'flexible' ? 'border-terracotta' : 'border-stone/40'}`}>
                {deliveryStyle === 'flexible' && <div className="w-2 h-2 rounded-full bg-terracotta" />}
              </div>
              <div>
                <p className="font-body text-[13px] font-semibold text-ink">Flexible — Wallet</p>
                <p className="font-body text-[11px] text-stone">Pay now, schedule freely all week</p>
              </div>
            </button>

            {/* Bulk delivery day picker — shown when bulk is selected */}
            {deliveryStyle === 'bulk' && (
              <div className="mt-1 ml-7 pt-3 border-t border-black/5" onClick={e => e.stopPropagation()}>
                <p className="font-body text-[11px] font-bold uppercase tracking-wider text-stone mb-2">Delivery Day</p>
                <div className="flex flex-wrap gap-1.5">
                  {BULK_DAY_OPTIONS.map(({ value, label }) => (
                    <button
                      key={value}
                      onClick={() => onBulkDeliveryDay(value)}
                      className={`px-3 py-1.5 rounded-full font-body text-[12px] font-medium transition-all border ${
                        bulkDeliveryDay === value
                          ? 'bg-sage text-white border-sage'
                          : 'border-black/15 text-stone hover:border-sage/60'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
