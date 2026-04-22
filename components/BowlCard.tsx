"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { Bowl, IngredientCustomization } from "@/types";
import { useCart } from "./CartContext";
import CustomizationModal from "./CustomizationModal";
import { useDialogAccessibility } from "@/lib/use-dialog-accessibility";

interface BowlCardProps {
  bowl: Bowl;
}

function hasNonDefaultCustomizations(customizations: IngredientCustomization[]): boolean {
  return customizations.some(c => c.option !== "default");
}

function customizationSummary(customizations: IngredientCustomization[], bowl: Bowl): string {
  const removed = customizations
    .filter(c => c.option === "remove")
    .map(c => bowl.customizableIngredients?.find(i => i.id === c.ingredientId)?.name)
    .filter(Boolean);
  const extras = customizations
    .filter(c => c.option === "extra")
    .map(c => bowl.customizableIngredients?.find(i => i.id === c.ingredientId)?.name)
    .filter(Boolean);
  const parts: string[] = [];
  if (removed.length) parts.push(`−${removed.join(", −")}`);
  if (extras.length) parts.push(`+${extras.join(", +")}`);
  return parts.join("  ·  ");
}

export default function BowlCard({ bowl }: BowlCardProps) {
  const { addItem, updateQuantity, updateCustomizations, items } = useCart();
  // We pick the first one matching to edit its quantity, or 0 if none.
  const cartItem = items.find((i) => i.bowl._id === bowl._id);
  const quantity = items.filter((i) => i.bowl._id === bowl._id).reduce((sum, i) => sum + i.quantity, 0);

  const [showCustomModal, setShowCustomModal] = useState(false);
  const [customModalMode, setCustomModalMode] = useState<"edit" | "add-new">("edit");
  const [showRepeatChoice, setShowRepeatChoice] = useState(false);
  const repeatDialogRef = useRef<HTMLDivElement>(null);
  useDialogAccessibility(repeatDialogRef, () => setShowRepeatChoice(false));

  const isCustomised = cartItem ? hasNonDefaultCustomizations(cartItem.customizations) : false;

  return (
    <>
      <div className={`${bowl.inStock === false ? 'opacity-60' : 'group hover:shadow-2xl hover:-translate-y-1'} bg-white rounded-sm overflow-hidden border border-ink/5 transition-all duration-500 flex flex-col`}>
        {/* Image */}
        <div className="relative aspect-square overflow-hidden bg-cream">
          <Image
            src={bowl.image}
            alt={bowl.name}
            fill
            className="object-contain transition-transform duration-700 group-hover:scale-105"
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          />
          {/* Nutrition pill badge */}
          {bowl.nutrition && (
            <span className="absolute top-3 left-3 z-10 px-3 py-1.5 rounded-full bg-terracotta/90 font-body text-[11px] text-white font-medium tracking-wide leading-none">
              {bowl.nutrition.calories} kcal &middot; {bowl.nutrition.protein}g protein &middot; {bowl.nutrition.fibre}g fibre
            </span>
          )}
          {bowl.inStock === false && (
            <span className="absolute top-3 right-3 z-10 px-3 py-1.5 rounded-full bg-ink/75 font-body text-[11px] text-white font-medium tracking-wide leading-none">
              Out of stock
            </span>
          )}
        </div>

        {/* Body */}
        <div className="p-6 flex flex-col flex-1">
          <h3 className="font-display text-[21px] font-medium text-ink mb-3 tracking-[0.02em]">
            {bowl.name}
          </h3>

          {/* Ingredients */}
          {bowl.ingredients && bowl.ingredients.length > 0 && (
            <ul className="mb-2 space-y-0.5">
              {bowl.ingredients.map((line, i) => (
                <li key={i} className="flex items-start gap-1.5 font-body text-[12px] text-stone leading-relaxed">
                  <span className="text-terracotta mt-0.5 leading-none select-none">&middot;</span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          )}

          {/* Tagline */}
          <p className="font-body text-[12px] italic text-stone/60 mb-4 flex-1">
            {bowl.tagline}
          </p>

          {/* Divider */}
          <div className="border-t border-ink/8 mb-4" />

          {/* Price + CTA */}
          <div className="flex items-center justify-between">
            <span className="flex items-baseline gap-1">
              <span className="font-display text-[22px] text-sage-dark">&#8377; {bowl.price}</span>
              <span className="font-body text-[12px] text-stone/60">/bowl</span>
            </span>
            {bowl.inStock === false ? (
              <button
                disabled
                className="font-body text-xs font-medium tracking-widest px-5 h-9 rounded-sm bg-black/10 text-stone cursor-not-allowed"
              >
                Out of Stock
              </button>
            ) : quantity > 0 ? (
              <div className="flex items-center gap-2">
                {/* Edit customisation button */}
                <button
                  onClick={() => setShowCustomModal(true)}
                  aria-label="Edit customisation"
                  className="relative w-9 h-9 flex items-center justify-center rounded-sm border border-black/10 bg-white hover:bg-sage/5 hover:border-sage/40 transition-colors text-stone hover:text-sage-dark"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
                    <path d="m15 5 4 4"/>
                  </svg>
                  {isCustomised && (
                    <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-terracotta border-2 border-white" />
                  )}
                </button>
                {/* Quantity stepper */}
                <div className="flex items-center bg-sage-dark text-white rounded-sm overflow-hidden h-9 min-w-[96px] shadow-sm">
                  <button
                    onClick={() => {
                      if (cartItem) updateQuantity(cartItem.instanceId, cartItem.quantity - 1);
                    }}
                    className="w-9 h-full flex items-center justify-center hover:bg-black/10 transition-colors border-r border-white/10"
                    aria-label="Decrease quantity"
                  >
                    &minus;
                  </button>
                  <span className="font-body text-[13px] font-medium flex-1 text-center">{quantity}</span>
                  <button
                    onClick={() => {
                      if (cartItem) {
                        setShowRepeatChoice(true);
                      } else {
                        addItem(bowl);
                      }
                    }}
                    className="w-9 h-full flex items-center justify-center hover:bg-black/10 transition-colors border-l border-white/10"
                    aria-label="Increase quantity"
                  >
                    +
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowCustomModal(true)}
                className="font-body text-xs font-medium tracking-widest px-5 h-9 rounded-sm transition-all duration-300 border-none cursor-pointer bg-sage text-white hover:bg-sage-dark shadow-sm hover:shadow-[0_4px_12px_rgba(125,155,118,0.25)]"
              >
                Add to Cart
              </button>
            )}
          </div>
        </div>
      </div>

      {showCustomModal && (
        <CustomizationModal
          bowl={bowl}
          initialCustomizations={customModalMode === "add-new" ? undefined : cartItem?.customizations}
          initialPresetOptions={customModalMode === "add-new" ? undefined : cartItem?.presetOptions}
          mode="cart"
          onConfirm={(customizations, presetOptions, cost) => {
            if (customModalMode === "add-new") {
              addItem(bowl, customizations, presetOptions, cost);
            } else if (cartItem) {
              updateCustomizations(cartItem.instanceId, customizations, presetOptions, cost);
            } else {
              addItem(bowl, customizations, presetOptions, cost);
            }
            setShowCustomModal(false);
            setCustomModalMode("edit");
          }}
          onClose={() => {
            setShowCustomModal(false);
            setCustomModalMode("edit");
          }}
        />
      )}

      {/* Repeat-or-customise choice sheet */}
      {showRepeatChoice && cartItem && (
        <div
          className="fixed inset-0 z-[120] flex items-end md:items-center justify-center p-0 md:p-4 bg-ink/60 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={(e) => { if (e.target === e.currentTarget) setShowRepeatChoice(false); }}
        >
          <div
            ref={repeatDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="repeat-choice-title"
            tabIndex={-1}
            className="bg-white rounded-t-2xl md:rounded-2xl w-full md:max-w-sm shadow-2xl animate-in slide-in-from-bottom-4 md:zoom-in-95 duration-200"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-black/5">
              <div>
                <h3 id="repeat-choice-title" className="font-display text-xl font-medium text-ink">Add another {bowl.name}?</h3>
                <p className="font-body text-[12px] text-stone mt-0.5">Choose how you'd like it</p>
              </div>
              <button
                onClick={() => setShowRepeatChoice(false)}
                aria-label="Close"
                className="w-8 h-8 flex items-center justify-center rounded-full bg-black/5 hover:bg-black/10 text-stone hover:text-ink transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage focus-visible:ring-offset-1"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
                </svg>
              </button>
            </div>

            {/* Options */}
            <div className="p-4 flex flex-col gap-3 pb-8 md:pb-4">
              {/* Repeat same */}
              <button
                onClick={() => {
                  updateQuantity(cartItem.instanceId, cartItem.quantity + 1);
                  setShowRepeatChoice(false);
                }}
                className="flex items-center gap-4 p-4 border border-black/10 hover:border-sage/40 rounded-xl hover:bg-sage/5 transition-all text-left group"
              >
                <div className="w-10 h-10 rounded-full bg-sage/10 text-sage-dark flex items-center justify-center shrink-0">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                    <path d="M3 3v5h5"/>
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-body text-[14px] font-bold text-ink group-hover:text-sage-dark transition-colors">Repeat same customisation</p>
                  {customizationSummary(cartItem.customizations, bowl) && (
                    <p className="font-body text-[11px] text-stone mt-0.5 truncate">
                      {customizationSummary(cartItem.customizations, bowl)}
                    </p>
                  )}
                </div>
              </button>

              {/* Customise differently */}
              <button
                onClick={() => {
                  setShowRepeatChoice(false);
                  setCustomModalMode("add-new");
                  setShowCustomModal(true);
                }}
                className="flex items-center gap-4 p-4 border border-black/10 hover:border-terracotta/40 rounded-xl hover:bg-terracotta/5 transition-all text-left group"
              >
                <div className="w-10 h-10 rounded-full bg-terracotta/10 text-terracotta flex items-center justify-center shrink-0">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
                    <path d="m15 5 4 4"/>
                  </svg>
                </div>
                <div>
                  <p className="font-body text-[14px] font-bold text-ink group-hover:text-terracotta transition-colors">Customise differently</p>
                  <p className="font-body text-[11px] text-stone mt-0.5">Opens ingredient options for a new version</p>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
