import { Bowl } from "@/types";

/**
 * Price-unit suffix shown next to an item's price (e.g. "₹80" + "/bottle").
 * Prefers the `unitLabel` set on the category directly in Studio. Falls back
 * to a guess from the category name for any category that hasn't had its
 * unit label set yet, so nothing breaks while everything gets configured.
 */
export function priceUnitLabel(category: Bowl["category"]): string {
  if (category && typeof category.unitLabel === "string") return category.unitLabel;

  const key = `${category?.slug ?? ""} ${category?.title ?? ""}`.toLowerCase();
  if (key.includes("smoothie")) return "/glass";
  if (key.includes("hydration")) return "/bottle";
  if (key.includes("combo")) return "/combo";
  if (key.includes("bowl") || !category) return "/bowl";
  return "";
}
