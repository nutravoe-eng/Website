import type { Bowl, BowlPresetOptions, IngredientCustomization } from "@/types";
import { baseChoiceLabel, oatsChoiceLabel } from "@/lib/preset-labels";

/** Align with CustomizationModal / SubscribeWizard defaults. */
export const DEFAULT_BOWL_PRESET: BowlPresetOptions = {
  baseChoice: "yogurt",
  oatsChoice: "roasted",
  noSugar: false,
};

export function findBowlByIdentifier(
  bowls: Bowl[],
  identifier: string | undefined,
): Bowl | undefined {
  if (!identifier) return undefined;
  return bowls.find(
    (bowl) =>
      bowl.slug === identifier ||
      bowl._id === identifier ||
      `bowl-${bowl.slug}` === identifier,
  );
}

export function encodePresetIntoCustomizations(
  customizations: IngredientCustomization[],
  preset: BowlPresetOptions,
): IngredientCustomization[] {
  const filtered = customizations.filter((c) => !c.ingredientId.startsWith("__preset_"));
  const presetEntries: IngredientCustomization[] = [
    { ingredientId: `__preset_base_${preset.baseChoice}`, option: "default" },
    { ingredientId: `__preset_oats_${preset.oatsChoice}`, option: "default" },
  ];
  if (preset.noSugar) {
    presetEntries.push({ ingredientId: "__preset_no_sugar", option: "default" });
  }
  return [...filtered, ...presetEntries];
}

/**
 * One-line summary for admin UI (matches user-side readability).
 */
export function formatBowlCustomizationSummary(
  customizations: IngredientCustomization[] | undefined,
  bowl: Bowl | undefined,
  presetOptions: BowlPresetOptions,
): string {
  const list = customizations ?? [];
  const removed = list
    .filter((c) => c.option === "remove")
    .map(
      (c) =>
        bowl?.customizableIngredients?.find((i) => i.id === c.ingredientId)?.name,
    )
    .filter(Boolean) as string[];
  const extras = list
    .filter((c) => c.option === "extra")
    .map(
      (c) =>
        bowl?.customizableIngredients?.find((i) => i.id === c.ingredientId)?.name,
    )
    .filter(Boolean) as string[];
  const parts: string[] = [];
  parts.push(`Base: ${baseChoiceLabel(presetOptions.baseChoice)} · Oats: ${oatsChoiceLabel(presetOptions.oatsChoice)}`);
  if (presetOptions.noSugar) parts.push("No sugar");
  if (removed.length) parts.push(`Remove: ${removed.join(", ")}`);
  if (extras.length) parts.push(`Extra: ${extras.join(", ")}`);
  if (parts.length === 0) return "Default customisation";
  return parts.join(" · ");
}
