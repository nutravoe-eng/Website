"use client";

import Image from "next/image";
import { Bowl } from "@/types";
import CustomizationModal from "./CustomizationModal";
import RepeatCustomisationChoiceSheet from "./RepeatCustomisationChoiceSheet";
import { useBowlOrderControls } from "@/lib/use-bowl-order-controls";

interface BowlCardProps {
  bowl: Bowl;
}

export default function BowlCard({ bowl }: BowlCardProps) {
  const {
    cartItem,
    quantity,
    isCustomised,
    showCustomModal,
    showRepeatChoice,
    customModalMode,
    openCustomModal,
    closeCustomModal,
    openRepeatChoice,
    closeRepeatChoice,
    confirmCustomizations,
    decreaseQuantity,
    repeatSame,
    customiseDifferently,
    lastCustomizationSummary,
  } = useBowlOrderControls(bowl);

  return (
    <>
      <div
        className={`${bowl.inStock === false ? "opacity-60" : "group hover:shadow-2xl hover:-translate-y-1"} bg-white rounded-sm overflow-hidden border border-ink/5 transition-all duration-500 flex flex-col`}
      >
        <div className="relative aspect-square overflow-hidden bg-cream">
          <Image
            src={bowl.image}
            alt={bowl.name}
            fill
            className="object-contain transition-transform duration-700 group-hover:scale-105"
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          />
          {bowl.nutrition ? (
            <span className="absolute top-3 left-3 z-10 rounded-full bg-terracotta/90 px-3 py-1.5 font-body text-[11px] font-medium leading-none tracking-wide text-white">
              {bowl.nutrition.calories} kcal &middot; {bowl.nutrition.protein}g protein &middot; {bowl.nutrition.fibre}g fibre
            </span>
          ) : null}
          {bowl.inStock === false ? (
            <span className="absolute top-3 right-3 z-10 rounded-full bg-ink/75 px-3 py-1.5 font-body text-[11px] font-medium leading-none tracking-wide text-white">
              Out of stock
            </span>
          ) : null}
        </div>

        <div className="flex flex-1 flex-col p-6">
          <h3 className="mb-3 font-display text-[21px] font-medium tracking-[0.02em] text-ink">
            {bowl.name}
          </h3>

          {bowl.ingredients && bowl.ingredients.length > 0 ? (
            <ul className="mb-2 space-y-0.5">
              {bowl.ingredients.map((line, index) => (
                <li key={index} className="flex items-start gap-1.5 font-body text-[12px] leading-relaxed text-stone">
                  <span className="mt-0.5 leading-none text-terracotta select-none">&middot;</span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          ) : null}

          <p className="mb-4 flex-1 font-body text-[12px] italic text-stone/60">{bowl.tagline}</p>

          {isCustomised && lastCustomizationSummary ? (
            <p className="mb-4 font-body text-[11px] text-terracotta">{lastCustomizationSummary}</p>
          ) : null}

          <div className="mb-4 border-t border-ink/8" />

          <div className="flex items-center justify-between">
            <span className="flex items-baseline gap-1">
              <span className="font-display text-[22px] text-sage-dark">&#8377; {bowl.price}</span>
              <span className="font-body text-[12px] text-stone/60">/bowl</span>
            </span>

            {bowl.inStock === false ? (
              <button
                disabled
                className="h-9 rounded-sm bg-black/10 px-5 font-body text-xs font-medium tracking-widest text-stone cursor-not-allowed"
              >
                Out of Stock
              </button>
            ) : quantity > 0 ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => openCustomModal("edit")}
                  aria-label="Edit customisation"
                  className="relative flex h-9 w-9 items-center justify-center rounded-sm border border-black/10 bg-white text-stone transition-colors hover:border-sage/40 hover:bg-sage/5 hover:text-sage-dark"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                    <path d="m15 5 4 4" />
                  </svg>
                  {isCustomised ? (
                    <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border-2 border-white bg-terracotta" />
                  ) : null}
                </button>

                <div className="flex h-9 min-w-[96px] items-center overflow-hidden rounded-sm bg-sage-dark text-white shadow-sm">
                  <button
                    type="button"
                    onClick={decreaseQuantity}
                    className="flex h-full w-9 items-center justify-center border-r border-white/10 transition-colors hover:bg-black/10"
                    aria-label="Decrease quantity"
                  >
                    &minus;
                  </button>
                  <span className="flex-1 text-center font-body text-[13px] font-medium">{quantity}</span>
                  <button
                    type="button"
                    onClick={() => {
                      if (cartItem) openRepeatChoice();
                    }}
                    className="flex h-full w-9 items-center justify-center border-l border-white/10 transition-colors hover:bg-black/10"
                    aria-label="Increase quantity"
                  >
                    +
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => openCustomModal("add-new")}
                className="h-9 rounded-sm border-none bg-sage px-5 font-body text-xs font-medium tracking-widest text-white shadow-sm transition-all duration-300 hover:bg-sage-dark hover:shadow-[0_4px_12px_rgba(125,155,118,0.25)]"
              >
                Add to Cart
              </button>
            )}
          </div>
        </div>
      </div>

      {showCustomModal ? (
        <CustomizationModal
          bowl={bowl}
          initialCustomizations={customModalMode === "add-new" ? undefined : cartItem?.customizations}
          initialPresetOptions={customModalMode === "add-new" ? undefined : cartItem?.presetOptions}
          mode="cart"
          onConfirm={confirmCustomizations}
          onClose={closeCustomModal}
        />
      ) : null}

      {showRepeatChoice && cartItem ? (
        <RepeatCustomisationChoiceSheet
          productName={bowl.name}
          lastSummaryLine={lastCustomizationSummary}
          onRepeatSame={repeatSame}
          onCustomiseDifferently={customiseDifferently}
          onClose={closeRepeatChoice}
        />
      ) : null}
    </>
  );
}
