"use client";

import { useState } from "react";
import Image from "next/image";
import { Bowl, IngredientCustomization } from "@/types";
import { useCart } from "./CartContext";
import CustomizationModal from "./CustomizationModal";

interface BowlCardProps {
  bowl: Bowl;
}

function hasNonDefaultCustomizations(customizations: IngredientCustomization[]): boolean {
  return customizations.some(c => c.option !== "default");
}

export default function BowlCard({ bowl }: BowlCardProps) {
  const { addItem, updateQuantity, updateCustomizations, items } = useCart();
  const cartItem = items.find((i) => i.bowl._id === bowl._id);
  const quantity = cartItem ? cartItem.quantity : 0;

  const [showCustomModal, setShowCustomModal] = useState(false);

  const isCustomised = cartItem ? hasNonDefaultCustomizations(cartItem.customizations) : false;

  return (
    <>
      <div className="group bg-white rounded-sm overflow-hidden border border-ink/5 transition-all duration-500 hover:shadow-2xl hover:-translate-y-1 flex flex-col">
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
            {quantity > 0 ? (
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
                    onClick={() => updateQuantity(bowl._id, quantity - 1)}
                    className="w-9 h-full flex items-center justify-center hover:bg-black/10 transition-colors border-r border-white/10"
                    aria-label="Decrease quantity"
                  >
                    &minus;
                  </button>
                  <span className="font-body text-[13px] font-medium flex-1 text-center">{quantity}</span>
                  <button
                    onClick={() => addItem(bowl)}
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
          initialCustomizations={cartItem?.customizations}
          mode="cart"
          onConfirm={(customizations, cost) => {
            if (cartItem) {
              updateCustomizations(bowl._id, customizations, cost);
            } else {
              addItem(bowl, customizations, cost);
            }
            setShowCustomModal(false);
          }}
          onClose={() => setShowCustomModal(false)}
        />
      )}
    </>
  );
}
