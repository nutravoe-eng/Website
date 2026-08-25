import type { BowlPresetOptions } from "@/types";

export function baseChoiceLabel(choice: BowlPresetOptions["baseChoice"] | undefined): string {
  if (choice === "milk") return "Milk";
  if (choice === "vegan") return "Vegan";
  return "Yogurt";
}

export function oatsChoiceLabel(choice: BowlPresetOptions["oatsChoice"] | undefined): string {
  if (choice === "roasted") return "Roasted";
  if (choice === "none") return "No Oats";
  return "Soaked";
}

/** Reverses encodePresetIntoCustomizations' `__preset_base_*` ingredient IDs back into a choice. */
export function parseBaseChoiceFromIngredientIds(ids: string[]): BowlPresetOptions["baseChoice"] {
  if (ids.includes("__preset_base_milk")) return "milk";
  if (ids.includes("__preset_base_vegan")) return "vegan";
  return "yogurt";
}

/** Reverses encodePresetIntoCustomizations' `__preset_oats_*` ingredient IDs back into a choice. */
export function parseOatsChoiceFromIngredientIds(ids: string[]): BowlPresetOptions["oatsChoice"] {
  if (ids.includes("__preset_oats_roasted")) return "roasted";
  if (ids.includes("__preset_oats_none")) return "none";
  return "soaked";
}
