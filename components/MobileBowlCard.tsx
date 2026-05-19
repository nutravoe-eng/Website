"use client";

import Image from "next/image";
import { Bowl } from "@/types";
import CustomizationModal from "@/components/CustomizationModal";
import RepeatCustomisationChoiceSheet from "@/components/RepeatCustomisationChoiceSheet";
import { useBowlOrderControls } from "@/lib/use-bowl-order-controls";
import { getTierLabel, resolveBowlTier } from "@/lib/mobile-shell";

export default function MobileBowlCard({ bowl }: { bowl: Bowl }) {
  const tierKey = resolveBowlTier(bowl);
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
      <article className={`border-b border-black/8 bg-white py-5 ${bowl.inStock === false ? "opacity-60" : ""}`}>
        <div className="flex items-start gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="rounded-full border border-sage/30 bg-sage/8 px-2 py-0.5 font-body text-[10px] font-bold uppercase tracking-[0.16em] text-sage-dark">
                {getTierLabel(tierKey)}
              </span>
              {bowl.inStock === false ? (
                <span className="rounded-full bg-black/6 px-2 py-0.5 font-body text-[10px] font-bold uppercase tracking-[0.16em] text-stone">
                  Out of stock
                </span>
              ) : null}
            </div>

            <h3 className="mt-3 font-body text-[15px] font-bold leading-[1.2] text-ink">
              {bowl.name}
            </h3>
            <p className="mt-1 font-display text-[22px] leading-none text-sage-dark">Rs {bowl.price}</p>

            {bowl.nutrition ? (
              <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2">
                <div>
                  <p className="font-body text-[11px] text-stone">Kcal</p>
                  <p className="font-body text-[12px] font-bold text-sage-dark">{bowl.nutrition.calories}</p>
                </div>
                <div>
                  <p className="font-body text-[11px] text-stone">Protein</p>
                  <p className="font-body text-[12px] font-bold text-ink">{bowl.nutrition.protein}g</p>
                </div>
                <div>
                  <p className="font-body text-[11px] text-stone">Fibre</p>
                  <p className="font-body text-[12px] font-bold text-ink">{bowl.nutrition.fibre}g</p>
                </div>
              </div>
            ) : null}

            <p className="mt-3 line-clamp-3 font-body text-[11.5px] leading-relaxed text-stone">
              {bowl.tagline || bowl.ingredients?.join(", ")}
            </p>

            {isCustomised && lastCustomizationSummary ? (
              <p className="mt-2 font-body text-[11px] text-terracotta">{lastCustomizationSummary}</p>
            ) : null}
          </div>

          <div className="w-[140px] shrink-0">
            <div className="relative aspect-square overflow-hidden rounded-[20px] bg-cream shadow-[0_12px_24px_rgba(0,0,0,0.08)]">
              <Image src={bowl.image} alt={bowl.name} fill className="object-cover" sizes="140px" />

              {quantity > 0 ? (
                <div className="absolute bottom-3 right-3 flex h-11 items-center overflow-hidden rounded-2xl bg-white shadow-[0_10px_24px_rgba(0,0,0,0.14)]">
                  <button
                    type="button"
                    onClick={decreaseQuantity}
                    className="flex h-full w-10 items-center justify-center text-lg text-ink"
                    aria-label="Decrease quantity"
                  >
                    -
                  </button>
                  <span className="min-w-[30px] text-center font-body text-[13px] font-bold text-ink">
                    {quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      if (cartItem) openRepeatChoice();
                    }}
                    className="flex h-full w-10 items-center justify-center text-xl text-sage-dark"
                    aria-label="Increase quantity"
                  >
                    +
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => openCustomModal("add-new")}
                  className="absolute bottom-3 right-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-[28px] leading-none text-sage-dark shadow-[0_10px_24px_rgba(0,0,0,0.14)]"
                  aria-label={`Add ${bowl.name} to cart`}
                >
                  +
                </button>
              )}

              {isCustomised ? (
                <button
                  type="button"
                  onClick={() => openCustomModal("edit")}
                  className="absolute left-3 top-3 rounded-full bg-white/92 px-2.5 py-1 font-body text-[10px] font-bold uppercase tracking-[0.16em] text-terracotta shadow-sm"
                >
                  Custom
                </button>
              ) : null}
            </div>

            <button
              type="button"
              onClick={() => openCustomModal(quantity > 0 ? "edit" : "add-new")}
              className="mt-2 w-full text-center font-body text-[12px] text-stone underline decoration-black/15 underline-offset-4"
            >
              Customizable
            </button>
          </div>
        </div>
      </article>

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
