'use client';

import type { PlanId, DeliveryStyle } from "@/types";

export interface PlanConfig {
  id: PlanId;
  name: string;
  bowlsPerWeek: number;
  /** Standard (299-class) near-zone weekly total - used for flexible wallet load. */
  weeklyPrice: number;
  /** Standard (299-class) near zone - display "starts from" + cart zone helper. */
  perBowl: number;
  /** Premium per bowl, global; omit if unused. */
  ratePremium?: number;
  billingCycle?: 'weekly' | 'monthly';
  savingsBadge: string;
  customisationChargePerBowl?: number;
  deliveryStyles?: import("@/types").DeliveryStyle[];
}

export const STUB_PLANS: PlanConfig[] = [
  { id: 'three-bowl', name: '3-Bowl / Week', bowlsPerWeek: 3, weeklyPrice: 852, perBowl: 284, ratePremium: 370, billingCycle: 'weekly', savingsBadge: 'Save 5%', customisationChargePerBowl: 30, deliveryStyles: ['spread', 'flexible'] },
  { id: 'five-bowl', name: '5-Bowl / Week', bowlsPerWeek: 5, weeklyPrice: 1350, perBowl: 270, ratePremium: 370, billingCycle: 'weekly', savingsBadge: 'Save 10%', customisationChargePerBowl: 30, deliveryStyles: ['spread', 'flexible'] },
  { id: 'daily', name: 'Daily Plan', bowlsPerWeek: 7, weeklyPrice: 1820, perBowl: 260, ratePremium: 360, billingCycle: 'weekly', savingsBadge: 'Best Value', customisationChargePerBowl: 30, deliveryStyles: ['spread', 'flexible'] },
];

interface Props {
  plan: PlanConfig;
  selected: boolean;
  deliveryStyle: DeliveryStyle | null;
  onSelect: () => void;
  onDeliveryStyle: (style: DeliveryStyle) => void;
}

export default function PlanCard({
  plan, selected, deliveryStyle,
  onSelect, onDeliveryStyle,
}: Props) {
  return (
    <div
      className={`cursor-pointer rounded-xl border-2 p-4 transition-all duration-200 md:p-6 ${
        selected ? 'border-terracotta bg-terracotta/5' : 'border-black/10 bg-white hover:border-terracotta/40'
      }`}
      onClick={onSelect}
    >
      <div className="mb-3 flex items-start justify-between md:mb-4">
        <div className="min-w-0">
          <h3 className="font-display text-[18px] font-medium leading-tight text-ink md:text-xl">{plan.name}</h3>
        </div>
        <span className="ml-3 shrink-0 rounded-full bg-sage/10 px-2 py-0.5 font-body text-[10px] font-bold uppercase tracking-[0.12em] text-sage md:px-2.5 md:py-1 md:text-[11px] md:tracking-wider">
          {plan.savingsBadge}
        </span>
      </div>

      <div className="mb-1 flex flex-wrap items-baseline gap-1">
        <span className="mr-1 font-body text-[10px] uppercase tracking-[0.14em] text-stone/80 md:text-[12px] md:tracking-wider">From</span>
        <span className="font-display text-[28px] font-medium leading-none text-ink md:text-3xl">Rs {plan.weeklyPrice.toLocaleString('en-IN')}</span>
        <span className="font-body text-[12px] text-stone md:text-[13px]">/week</span>
      </div>

      <p className="font-body text-[11px] leading-relaxed text-stone/90 md:hidden">
        <span className="block">Standard bowls start at Rs {plan.perBowl}/bowl.</span>
        {plan.ratePremium != null && plan.ratePremium > 0 ? (
          <span className="mt-0.5 block">Exotic bowls are Rs {plan.ratePremium}/bowl.</span>
        ) : null}
      </p>
      <p className="mt-0.5 hidden font-body text-[12px] text-stone/90 md:block">
        {plan.ratePremium != null && plan.ratePremium > 0
          ? (
            <>
              <span className="block">Standard bowls are Rs {plan.perBowl}/bowl.</span>
              <span className="block">Exotic bowls are Rs {plan.ratePremium}/bowl.</span>
            </>
          ) : (
            <span className="block">Rs {plan.perBowl} per bowl.</span>
          )}
      </p>

      {selected && (
        <div className="mt-3 flex items-center gap-2 md:mt-4">
          <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-terracotta">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <span className="font-body text-[12px] font-bold text-terracotta md:text-[13px]">Selected</span>
        </div>
      )}

      {selected && (
        <div
          id={`delivery-style-${plan.id}`}
          className="mt-4 border-t border-black/5 pt-4 md:mt-5 md:pt-5"
          onClick={e => e.stopPropagation()}
        >
          <p className="mb-2.5 font-body text-[10px] font-bold uppercase tracking-[0.14em] text-stone md:mb-3 md:text-[11px] md:tracking-wider">Delivery Style</p>
          <div className="flex flex-col gap-2">
            {(!plan.deliveryStyles || plan.deliveryStyles.includes('spread')) && (
              <button
                onClick={() => onDeliveryStyle('spread')}
                className={`flex items-center gap-3 rounded-lg border p-2.5 text-left transition-all md:p-3 ${
                  deliveryStyle === 'spread' ? 'border-sage bg-sage/10' : 'border-black/10 bg-white hover:border-sage/50'
                }`}
              >
                <div className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${deliveryStyle === 'spread' ? 'border-sage' : 'border-stone/40'}`}>
                  {deliveryStyle === 'spread' && <div className="h-2 w-2 rounded-full bg-sage" />}
                </div>
                <div>
                  <p className="font-body text-[12px] font-semibold text-ink md:text-[13px]">Spread across the week</p>
                  <p className="font-body text-[10px] text-stone md:text-[11px]">Pick specific delivery days</p>
                </div>
              </button>
            )}

            {(!plan.deliveryStyles || plan.deliveryStyles.includes('flexible')) && (
              <button
                onClick={() => onDeliveryStyle('flexible')}
                className={`flex items-center gap-3 rounded-lg border p-2.5 text-left transition-all md:p-3 ${
                  deliveryStyle === 'flexible' ? 'border-terracotta bg-terracotta/5' : 'border-black/10 bg-white hover:border-terracotta/40'
                }`}
              >
                <div className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${deliveryStyle === 'flexible' ? 'border-terracotta' : 'border-stone/40'}`}>
                  {deliveryStyle === 'flexible' && <div className="h-2 w-2 rounded-full bg-terracotta" />}
                </div>
                <div>
                  <p className="font-body text-[12px] font-semibold text-ink md:text-[13px]">Flexible - Wallet</p>
                  <p className="font-body text-[10px] text-stone md:text-[11px]">Pay now, schedule freely all week</p>
                </div>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
