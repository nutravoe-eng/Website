"use client";

import Image from "next/image";
import { Bowl } from "@/types";
import CustomizationModal from "@/components/CustomizationModal";
import RepeatCustomisationChoiceSheet from "@/components/RepeatCustomisationChoiceSheet";
import { useBowlOrderControls } from "@/lib/use-bowl-order-controls";

export default function HomeMenuCard({ bowl }: { bowl: Bowl }) {
  const {
    cartItem,
    quantity,
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
      <div className="w-[168px] shrink-0 snap-start md:w-[220px]">
        <div className="relative aspect-square overflow-hidden rounded-2xl bg-cream shadow-[0_10px_22px_rgba(0,0,0,0.08)]">
          <Image
            src={bowl.image}
            alt={bowl.name}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 168px, 220px"
          />

          {quantity > 0 ? (
            <div className="absolute bottom-2.5 right-2.5 flex h-9 items-center overflow-hidden rounded-xl bg-white shadow-[0_8px_20px_rgba(0,0,0,0.14)] md:h-11 md:rounded-2xl">
              <button
                type="button"
                onClick={decreaseQuantity}
                className="flex h-full w-8 items-center justify-center text-base text-ink md:w-10 md:text-lg"
                aria-label="Decrease quantity"
              >
                -
              </button>
              <span className="min-w-[22px] text-center font-body text-[12px] font-bold text-ink md:min-w-[30px] md:text-[13px]">
                {quantity}
              </span>
              <button
                type="button"
                onClick={() => {
                  if (cartItem) openRepeatChoice();
                }}
                className="flex h-full w-8 items-center justify-center text-lg text-sage-dark md:w-10 md:text-xl"
                aria-label="Increase quantity"
              >
                +
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => openCustomModal("add-new")}
              className="absolute bottom-2.5 right-2.5 flex h-9 w-9 items-center justify-center rounded-xl bg-white text-[22px] leading-none text-sage-dark shadow-[0_8px_20px_rgba(0,0,0,0.14)] md:h-11 md:w-11 md:rounded-2xl md:text-[26px]"
              aria-label={`Add ${bowl.name} to cart`}
            >
              +
            </button>
          )}
        </div>

        <div className="mt-2 flex items-baseline justify-between gap-2">
          <p className="truncate font-body text-[12.5px] font-medium text-ink md:text-[14px]">
            {bowl.name}
          </p>
          <p className="shrink-0 font-body text-[12px] text-stone md:text-[13px]">
            &#8377;{bowl.price}
          </p>
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
