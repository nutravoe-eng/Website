'use client';

import { useRef, useState } from 'react';
import Image from 'next/image';
import type { Bowl, Subscription, IngredientCustomization } from '@/types';
import { formatCurrency } from '@/lib/utils';
import { STUB_PLANS as PLANS, BULK_DAY_OPTIONS } from '../../subscribe/PlanCard';
import BowlPicker from '../../subscribe/BowlPicker';
import CustomizationModal from '@/components/CustomizationModal';
import { useDialogAccessibility } from '@/lib/use-dialog-accessibility';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
type Day = typeof DAYS[number];

const TIME_SLOTS = [
  '7:00 AM – 8:00 AM',
  '8:00 AM – 9:00 AM',
  '9:00 AM – 10:00 AM',
] as const;

interface EditState {
  deliveryStyle: 'spread' | 'bulk' | 'flexible';
  bulkDeliveryDay: string;
  deliveryTimeSlot: string;
  selectedDays: string[];
  dayBowlMap: Record<string, string>;
  bulkBowlCounts: Record<string, number>;
  dayCustomMap: Record<string, IngredientCustomization[]>;
  dayCustomCostMap: Record<string, number>;
  bulkCustomMap: Record<string, IngredientCustomization[]>;
  bulkCustomCostMap: Record<string, number>;
}

interface Props {
  sub: Subscription;
  bowls: Bowl[];
  onSave: (updated: Subscription) => void;
  onClose: () => void;
}

export default function ManageModal({ sub, bowls, onSave, onClose }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const plan = PLANS.find(p => p.id === sub.planId);
  useDialogAccessibility(dialogRef, onClose);

  const [edit, setEdit] = useState<EditState>(() => ({
    deliveryStyle: sub.deliveryStyle,
    bulkDeliveryDay: sub.bulkDeliveryDay ?? 'next-day',
    deliveryTimeSlot: sub.deliveryTimeSlot ?? '',
    selectedDays: sub.deliveryStyle === 'spread' ? sub.dayConfigs.map(d => d.day) : [],
    dayBowlMap: sub.deliveryStyle === 'spread'
      ? Object.fromEntries(sub.dayConfigs.map(d => [d.day, d.bowlId]))
      : {},
    bulkBowlCounts: sub.deliveryStyle === 'bulk' && sub.bulkBowls
      ? Object.fromEntries(sub.bulkBowls.map(b => [b.bowlId, b.quantity]))
      : {},
    dayCustomMap: sub.deliveryStyle === 'spread'
      ? Object.fromEntries(sub.dayConfigs.map(d => [d.day, d.customizations ?? []]))
      : {},
    dayCustomCostMap: sub.deliveryStyle === 'spread'
      ? Object.fromEntries(sub.dayConfigs.map(d => [d.day, d.customizationCost ?? 0]))
      : {},
    bulkCustomMap: sub.deliveryStyle === 'bulk' && sub.bulkBowls
      ? Object.fromEntries(sub.bulkBowls.map(b => [b.bowlId, b.customizations ?? []]))
      : {},
    bulkCustomCostMap: sub.deliveryStyle === 'bulk' && sub.bulkBowls
      ? Object.fromEntries(sub.bulkBowls.map(b => [b.bowlId, b.customizationCost ?? 0]))
      : {},
  }));

  const [customizingDay, setCustomizingDay] = useState<string | null>(null);
  const [customizingBulkBowlId, setCustomizingBulkBowlId] = useState<string | null>(null);

  if (!plan) return null;

  const bulkTotal = Object.values(edit.bulkBowlCounts).reduce((s, c) => s + c, 0);

  const isValid = (() => {
    if (edit.deliveryStyle === 'flexible') return true;
    if (!edit.deliveryTimeSlot) return false;
    if (edit.deliveryStyle === 'bulk') {
      return bulkTotal === plan.bowlsPerWeek;
    }
    if (edit.selectedDays.length !== plan.bowlsPerWeek) return false;
    return edit.selectedDays.every(d => Boolean(edit.dayBowlMap[d]));
  })();

  function switchStyle(style: 'spread' | 'bulk' | 'flexible') {
    setEdit(e => ({ ...e, deliveryStyle: style }));
  }

  function toggleDay(day: string) {
    const isSelected = edit.selectedDays.includes(day);
    if (isSelected) {
      setEdit(e => ({
        ...e,
        selectedDays: e.selectedDays.filter(d => d !== day),
        dayBowlMap: { ...e.dayBowlMap, [day]: '' },
      }));
    } else {
      if (plan && edit.selectedDays.length >= plan.bowlsPerWeek) return;
      setEdit(e => ({ ...e, selectedDays: [...e.selectedDays, day] }));
    }
  }

  function setDayBowl(day: string, bowlId: string) {
    setEdit(e => ({ ...e, dayBowlMap: { ...e.dayBowlMap, [day]: bowlId } }));
  }

  function adjustCount(bowlId: string, delta: number) {
    const current = edit.bulkBowlCounts[bowlId] ?? 0;
    if (delta > 0 && plan && bulkTotal >= plan.bowlsPerWeek) return;
    const next = Math.max(0, current + delta);
    setEdit(e => ({ ...e, bulkBowlCounts: { ...e.bulkBowlCounts, [bowlId]: next } }));
  }

  function handleSave() {
    if (!isValid) return;
    const updated: Subscription = {
      ...sub,
      deliveryStyle: edit.deliveryStyle,
      bulkDeliveryDay: edit.deliveryStyle === 'bulk' ? edit.bulkDeliveryDay : undefined,
      deliveryTimeSlot: edit.deliveryStyle !== 'flexible' ? edit.deliveryTimeSlot : undefined,
      dayConfigs: edit.deliveryStyle === 'spread'
        ? edit.selectedDays.map(day => ({
            day: day as Day,
            bowlId: edit.dayBowlMap[day],
            bowlName: bowls.find(b => b._id === edit.dayBowlMap[day])?.name ?? '',
            quantity: 1,
            customizations: edit.dayCustomMap[day] ?? [],
            customizationCost: edit.dayCustomCostMap[day] ?? 0,
          }))
        : [],
      bulkBowls: edit.deliveryStyle === 'bulk'
        ? Object.entries(edit.bulkBowlCounts)
            .filter(([, c]) => c > 0)
            .map(([bowlId, quantity]) => ({
              bowlId,
              bowlName: bowls.find(b => b._id === bowlId)?.name ?? '',
              quantity,
              customizations: edit.bulkCustomMap[bowlId] ?? [],
              customizationCost: edit.bulkCustomCostMap[bowlId] ?? 0,
            }))
        : undefined,
    };
    onSave(updated);
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-ink/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="manage-subscription-title"
        tabIndex={-1}
        className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200 flex flex-col max-h-[92vh]"
      >

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-black/5 shrink-0">
          <div>
            <h3 id="manage-subscription-title" className="font-display text-xl font-medium text-ink">Manage Subscription</h3>
            <p className="font-body text-[13px] text-stone mt-0.5">
              {plan.name} · {formatCurrency(plan.weeklyPrice)}/week
            </p>
          </div>
          <button onClick={onClose} className="text-stone hover:text-ink transition-colors p-1 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage focus-visible:ring-offset-1">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
            </svg>
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto p-6 space-y-6 flex-1">

          {/* ── Delivery Type ─────────────────────────────────── */}
          <div>
            <p className="font-body text-[11px] font-bold uppercase tracking-wider text-stone mb-3">Delivery Type</p>
            <div className="flex flex-col gap-2" role="radiogroup" aria-label="Delivery Type">
              <button
                onClick={() => switchStyle('spread')}
                role="radio"
                aria-checked={edit.deliveryStyle === 'spread'}
                className={`flex items-center gap-3 p-3.5 rounded-xl border text-left transition-all ${
                  edit.deliveryStyle === 'spread' ? 'border-sage bg-sage/10' : 'border-black/10 hover:border-sage/40'
                }`}
              >
                <div className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${edit.deliveryStyle === 'spread' ? 'border-sage' : 'border-stone/40'}`}>
                  {edit.deliveryStyle === 'spread' && <div className="w-2 h-2 rounded-full bg-sage" />}
                </div>
                <div>
                  <p className="font-body text-[13px] font-semibold text-ink">Spread across the week</p>
                  <p className="font-body text-[11px] text-stone">Pick specific delivery days</p>
                </div>
              </button>

              <button
                onClick={() => switchStyle('bulk')}
                role="radio"
                aria-checked={edit.deliveryStyle === 'bulk'}
                className={`flex items-center gap-3 p-3.5 rounded-xl border text-left transition-all ${
                  edit.deliveryStyle === 'bulk' ? 'border-sage bg-sage/10' : 'border-black/10 hover:border-sage/40'
                }`}
              >
                <div className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${edit.deliveryStyle === 'bulk' ? 'border-sage' : 'border-stone/40'}`}>
                  {edit.deliveryStyle === 'bulk' && <div className="w-2 h-2 rounded-full bg-sage" />}
                </div>
                <div>
                  <p className="font-body text-[13px] font-semibold text-ink">Bulk delivery</p>
                  <p className="font-body text-[11px] text-stone">All bowls on one day</p>
                </div>
              </button>

              <button
                onClick={() => switchStyle('flexible')}
                role="radio"
                aria-checked={edit.deliveryStyle === 'flexible'}
                className={`flex items-center gap-3 p-3.5 rounded-xl border text-left transition-all ${
                  edit.deliveryStyle === 'flexible' ? 'border-terracotta bg-terracotta/5' : 'border-black/10 hover:border-terracotta/40'
                }`}
              >
                <div className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${edit.deliveryStyle === 'flexible' ? 'border-terracotta' : 'border-stone/40'}`}>
                  {edit.deliveryStyle === 'flexible' && <div className="w-2 h-2 rounded-full bg-terracotta" />}
                </div>
                <div>
                  <p className="font-body text-[13px] font-semibold text-ink">Flexible — Wallet</p>
                  <p className="font-body text-[11px] text-stone">Pay now, schedule freely all week</p>
                </div>
              </button>
            </div>
          </div>

          {/* ── Bulk config ────────────────────────────────────── */}
          {edit.deliveryStyle === 'bulk' && (
            <>
              {/* Delivery day picker */}
              <div>
                <p className="font-body text-[11px] font-bold uppercase tracking-wider text-stone mb-3">Delivery Day</p>
                <div className="flex flex-wrap gap-2">
                  {BULK_DAY_OPTIONS.map(({ value, label }) => (
                    <button
                      key={value}
                      onClick={() => setEdit(e => ({ ...e, bulkDeliveryDay: value }))}
                      className={`px-3.5 py-2 rounded-full font-body text-[12px] font-medium transition-all border ${
                        edit.bulkDeliveryDay === value
                          ? 'bg-sage text-white border-sage'
                          : 'border-black/15 text-stone hover:border-sage/60'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Bowl quantities */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="font-body text-[11px] font-bold uppercase tracking-wider text-stone">Bowls</p>
                  <span className={`font-body text-[13px] font-bold ${bulkTotal === plan.bowlsPerWeek ? 'text-sage' : 'text-ink'}`}>
                    {bulkTotal} / {plan.bowlsPerWeek}
                  </span>
                </div>
                <div className="space-y-2">
                  {bowls.map(bowl => {
                    const count = edit.bulkBowlCounts[bowl._id] ?? 0;
                    const hasCust = count > 0 && (edit.bulkCustomMap[bowl._id] ?? []).some(c => c.option !== 'default');
                    return (
                      <div key={bowl._id} className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${count > 0 ? 'border-sage/40 bg-sage/5' : 'border-black/8 bg-[#F9F8F6]'}`}>
                        <div className="w-10 h-10 rounded-lg overflow-hidden bg-white relative shrink-0">
                          <Image src={bowl.image} alt={bowl.name} fill className="object-contain" sizes="40px" />
                        </div>
                        <p className="font-body text-[12px] font-medium text-ink flex-1 truncate">{bowl.name}</p>
                        <div className="flex items-center gap-2 shrink-0">
                          {count > 0 && (
                            <button
                              onClick={() => setCustomizingBulkBowlId(bowl._id)}
                              className="relative flex items-center gap-1 px-2 py-1 rounded-md border border-black/10 bg-white hover:bg-sage/5 hover:border-sage/30 font-body text-[11px] font-medium text-stone hover:text-sage-dark transition-colors"
                            >
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
                              </svg>
                              {hasCust && <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-terracotta border border-white" />}
                            </button>
                          )}
                          <button
                            onClick={() => adjustCount(bowl._id, -1)}
                            disabled={count === 0}
                            className="w-7 h-7 rounded-full border border-black/10 flex items-center justify-center text-stone hover:text-ink disabled:opacity-30 transition-all"
                          >−</button>
                          <span className="font-body text-[14px] font-bold text-ink w-4 text-center">{count}</span>
                          <button
                            onClick={() => adjustCount(bowl._id, 1)}
                            disabled={bulkTotal >= plan.bowlsPerWeek}
                            className="w-7 h-7 rounded-full border border-black/10 flex items-center justify-center text-stone hover:text-ink disabled:opacity-30 transition-all"
                          >+</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {/* ── Flexible info ──────────────────────────────────── */}
          {edit.deliveryStyle === 'flexible' && (
            <div className="space-y-3">
              <div className="bg-terracotta/5 border border-terracotta/20 rounded-xl p-4">
                <p className="font-body text-[12px] font-bold text-terracotta mb-2">How Flexible works</p>
                <div className="space-y-1.5">
                  {[
                    'Your weekly plan price is loaded to your Nutravoe Wallet',
                    'Schedule any bowl, any day — as long as your balance allows',
                    'Customisation extras are deducted automatically from the wallet',
                    'Wallet does not auto-refill. New balance loads only after the next approved payment cycle.',
                  ].map((line, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="w-4 h-4 rounded-full bg-terracotta/15 text-terracotta font-body text-[9px] font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                      <p className="font-body text-[12px] text-stone leading-relaxed">{line}</p>
                    </div>
                  ))}
                </div>
              </div>
              <a
                href="/wallet"
                className="flex items-center justify-between p-3.5 bg-[#F9F8F6] border border-black/8 rounded-xl hover:border-terracotta/30 transition-colors group"
              >
                <div>
                  <p className="font-body text-[13px] font-semibold text-ink">Go to Wallet</p>
                  <p className="font-body text-[11px] text-stone">Check balance & schedule orders</p>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-stone group-hover:text-terracotta transition-colors"><path d="m9 18 6-6-6-6"/></svg>
              </a>
            </div>
          )}

          {/* ── Spread config ──────────────────────────────────── */}
          {edit.deliveryStyle === 'spread' && (
            <>
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="font-body text-[11px] font-bold uppercase tracking-wider text-stone">Delivery Days</p>
                  <span className="font-body text-[12px] text-stone">
                    {edit.selectedDays.length} / {plan.bowlsPerWeek}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {DAYS.map(day => {
                    const isSelected = edit.selectedDays.includes(day);
                    const isDisabled = !isSelected && edit.selectedDays.length >= plan.bowlsPerWeek;
                    return (
                      <button
                        key={day}
                        disabled={isDisabled}
                        onClick={() => toggleDay(day)}
                        className={`px-4 py-2 rounded-full font-body text-[13px] font-medium transition-all border ${
                          isSelected
                            ? 'bg-sage text-white border-sage'
                            : 'border-black/15 text-stone hover:border-sage/60 disabled:opacity-40 disabled:cursor-not-allowed'
                        }`}
                      >
                        {day}
                      </button>
                    );
                  })}
                </div>
              </div>

              {edit.selectedDays.length > 0 && (
                <div className="space-y-3">
                  {DAYS.filter(d => edit.selectedDays.includes(d)).map(day => {
                    const hasCust = (edit.dayCustomMap[day] ?? []).some(c => c.option !== 'default');
                    const selectedBowl = bowls.find(b => b._id === edit.dayBowlMap[day]);
                    return (
                      <div key={day} className="bg-[#F9F8F6] rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-3">
                          <span className="w-9 h-9 rounded-full bg-sage/10 text-sage font-body text-[12px] font-bold flex items-center justify-center shrink-0">
                            {day}
                          </span>
                          <p className="font-body text-[13px] font-medium text-ink">
                            {selectedBowl
                              ? selectedBowl.name
                              : <span className="text-stone italic">Select a bowl</span>}
                          </p>
                          {edit.dayBowlMap[day] && (
                            <div className="ml-auto flex items-center gap-2">
                              <button
                                onClick={() => setCustomizingDay(day)}
                                className="relative flex items-center gap-1 px-2.5 py-1 rounded-md border border-black/10 bg-white hover:bg-sage/5 hover:border-sage/30 font-body text-[11px] font-medium text-stone hover:text-sage-dark transition-colors"
                              >
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
                                </svg>
                                Customise
                                {hasCust && <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-terracotta border border-white" />}
                              </button>
                              <div className="w-5 h-5 rounded-full bg-sage/15 flex items-center justify-center">
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#7D9B76" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                              </div>
                            </div>
                          )}
                        </div>
                        <BowlPicker
                          bowls={bowls}
                          selectedBowlId={edit.dayBowlMap[day] ?? ''}
                          onSelect={(id) => {
                            setDayBowl(day, id);
                            // Reset customizations when bowl changes
                            setEdit(e => ({
                              ...e,
                              dayCustomMap: { ...e.dayCustomMap, [day]: [] },
                              dayCustomCostMap: { ...e.dayCustomCostMap, [day]: 0 },
                            }));
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* ── Delivery time slot ─────────────────────────────── */}
          {edit.deliveryStyle !== 'flexible' && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7D9B76" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                <p className="font-body text-[11px] font-bold uppercase tracking-wider text-stone">Preferred delivery time</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {TIME_SLOTS.map(slot => (
                  <button
                    key={slot}
                    onClick={() => setEdit(e => ({ ...e, deliveryTimeSlot: slot }))}
                    className={`px-4 py-2.5 rounded-xl border font-body text-[12px] font-medium transition-all ${
                      edit.deliveryTimeSlot === slot
                        ? 'border-sage bg-sage/10 text-sage-dark font-bold'
                        : 'border-black/15 text-stone hover:border-sage/50'
                    }`}
                  >
                    {slot}
                  </button>
                ))}
              </div>
              {!edit.deliveryTimeSlot && (
                <p className="font-body text-[11px] text-terracotta mt-2">Select a time slot to save changes.</p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-black/5 flex gap-3 shrink-0">
          <button
            onClick={onClose}
            className="flex-1 border border-black/10 hover:bg-[#F9F8F6] text-ink font-body text-[13px] font-medium py-3 rounded-md transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!isValid}
            className="flex-1 bg-sage hover:bg-sage-dark disabled:bg-black/10 disabled:text-stone text-white font-body text-[13px] font-bold py-3 rounded-md transition-colors shadow-sm"
          >
            Save Changes
          </button>
        </div>
      </div>

      {/* Customization modal — spread day */}
      {customizingDay && (() => {
        const bowlId = edit.dayBowlMap[customizingDay];
        const bowl = bowls.find(b => b._id === bowlId);
        if (!bowl) return null;
        return (
          <CustomizationModal
            bowl={bowl}
            initialCustomizations={edit.dayCustomMap[customizingDay] ?? []}
            mode="subscription"
            onConfirm={(customizations, cost) => {
              setEdit(e => ({
                ...e,
                dayCustomMap: { ...e.dayCustomMap, [customizingDay]: customizations },
                dayCustomCostMap: { ...e.dayCustomCostMap, [customizingDay]: cost },
              }));
              setCustomizingDay(null);
            }}
            onClose={() => setCustomizingDay(null)}
          />
        );
      })()}

      {/* Customization modal — bulk bowl */}
      {customizingBulkBowlId && (() => {
        const bowl = bowls.find(b => b._id === customizingBulkBowlId);
        if (!bowl) return null;
        return (
          <CustomizationModal
            bowl={bowl}
            initialCustomizations={edit.bulkCustomMap[customizingBulkBowlId] ?? []}
            mode="subscription"
            onConfirm={(customizations, cost) => {
              setEdit(e => ({
                ...e,
                bulkCustomMap: { ...e.bulkCustomMap, [customizingBulkBowlId]: customizations },
                bulkCustomCostMap: { ...e.bulkCustomCostMap, [customizingBulkBowlId]: cost },
              }));
              setCustomizingBulkBowlId(null);
            }}
            onClose={() => setCustomizingBulkBowlId(null)}
          />
        );
      })()}
    </div>
  );
}
