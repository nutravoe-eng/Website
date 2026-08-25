"use client";

import { useMemo, useRef, useState } from "react";
import { useCart } from "@/components/CartContext";
import type { Bowl, BowlPresetOptions, IngredientCustomization } from "@/types";
import { useDialogAccessibility } from "@/lib/use-dialog-accessibility";
import { DEFAULT_BOWL_PRESET } from "@/lib/bowl-customization";

export interface BowlOrderControls {
  cartItem: ReturnType<typeof useCart>["items"][number] | undefined;
  quantity: number;
  isCustomised: boolean;
  showCustomModal: boolean;
  showRepeatChoice: boolean;
  customModalMode: "edit" | "add-new";
  repeatDialogRef: React.RefObject<HTMLDivElement | null>;
  openCustomModal: (mode?: "edit" | "add-new") => void;
  closeCustomModal: () => void;
  openRepeatChoice: () => void;
  closeRepeatChoice: () => void;
  confirmCustomizations: (
    customizations: IngredientCustomization[],
    presetOptions: BowlPresetOptions,
    customizationCost: number,
  ) => void;
  decreaseQuantity: () => void;
  repeatSame: () => void;
  customiseDifferently: () => void;
  lastCustomizationSummary: string;
}

function hasNonDefaultCustomizations(customizations: IngredientCustomization[]): boolean {
  return customizations.some((item) => item.option !== "default");
}

/** True when this item has nothing to customize — no ingredients to swap, and Base/Oats/No-Sugar hidden. */
function hasNoCustomizationOptions(bowl: Bowl): boolean {
  const ingredients = (bowl.customizableIngredients ?? []).filter((i) => !i.isBase);
  return ingredients.length === 0 && bowl.showStandardCustomizations === false;
}

function summarize(cartItem: BowlOrderControls["cartItem"], bowl: Bowl): string {
  if (!cartItem) return "";
  const removed = cartItem.customizations
    .filter((item) => item.option === "remove")
    .map((item) => bowl.customizableIngredients?.find((ingredient) => ingredient.id === item.ingredientId)?.name)
    .filter(Boolean) as string[];
  const extras = cartItem.customizations
    .filter((item) => item.option === "extra")
    .map((item) => bowl.customizableIngredients?.find((ingredient) => ingredient.id === item.ingredientId)?.name)
    .filter(Boolean) as string[];
  const parts: string[] = [];
  if (removed.length) parts.push(`Remove: ${removed.join(", ")}`);
  if (extras.length) parts.push(`Extra: ${extras.join(", ")}`);
  return parts.join(" - ");
}

export function useBowlOrderControls(bowl: Bowl): BowlOrderControls {
  const { addItem, updateQuantity, updateCustomizations, items } = useCart();
  const cartItem = useMemo(
    () => items.find((item) => item.bowl._id === bowl._id),
    [bowl._id, items],
  );
  const quantity = useMemo(
    () => items.filter((item) => item.bowl._id === bowl._id).reduce((sum, item) => sum + item.quantity, 0),
    [bowl._id, items],
  );

  const [showCustomModal, setShowCustomModal] = useState(false);
  const [showRepeatChoice, setShowRepeatChoice] = useState(false);
  const [customModalMode, setCustomModalMode] = useState<"edit" | "add-new">("edit");
  const repeatDialogRef = useRef<HTMLDivElement>(null);

  useDialogAccessibility(repeatDialogRef, () => setShowRepeatChoice(false));

  const isCustomised = cartItem ? hasNonDefaultCustomizations(cartItem.customizations) : false;
  const lastCustomizationSummary = useMemo(() => summarize(cartItem, bowl), [bowl, cartItem]);

  return {
    cartItem,
    quantity,
    isCustomised,
    showCustomModal,
    showRepeatChoice,
    customModalMode,
    repeatDialogRef,
    openCustomModal(mode = "edit") {
      if (mode === "add-new" && hasNoCustomizationOptions(bowl)) {
        addItem(bowl, [], DEFAULT_BOWL_PRESET, 0);
        return;
      }
      setCustomModalMode(mode);
      setShowCustomModal(true);
    },
    closeCustomModal() {
      setShowCustomModal(false);
      setCustomModalMode("edit");
    },
    openRepeatChoice() {
      if (hasNoCustomizationOptions(bowl) && cartItem) {
        addItem(bowl, [...cartItem.customizations], { ...cartItem.presetOptions }, cartItem.customizationCost);
        return;
      }
      setShowRepeatChoice(true);
    },
    closeRepeatChoice() {
      setShowRepeatChoice(false);
    },
    confirmCustomizations(customizations, presetOptions, customizationCost) {
      if (customModalMode === "add-new") {
        addItem(bowl, customizations, presetOptions, customizationCost);
      } else if (cartItem) {
        updateCustomizations(cartItem.instanceId, customizations, presetOptions, customizationCost);
      } else {
        addItem(bowl, customizations, presetOptions, customizationCost);
      }
      setShowCustomModal(false);
      setCustomModalMode("edit");
    },
    decreaseQuantity() {
      if (cartItem) updateQuantity(cartItem.instanceId, cartItem.quantity - 1);
    },
    repeatSame() {
      if (cartItem) {
        addItem(
          bowl,
          [...cartItem.customizations],
          { ...cartItem.presetOptions },
          cartItem.customizationCost,
        );
      }
      setShowRepeatChoice(false);
    },
    customiseDifferently() {
      setShowRepeatChoice(false);
      setCustomModalMode("add-new");
      setShowCustomModal(true);
    },
    lastCustomizationSummary,
  };
}
