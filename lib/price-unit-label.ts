import { Bowl } from "@/types";

/**
 * Price-unit suffix shown next to an item's price (e.g. "₹80" + "/bottle").
 * Derived from the item's category name since not every category is a "bowl"
 * (Hydration, Combos, etc.). Falls back to "/bowl" for uncategorized items,
 * since that's the original/default product type.
 */
export function priceUnitLabel(category: Bowl["category"]): string {
  const key = `${category?.slug ?? ""} ${category?.title ?? ""}`.toLowerCase();
  if (key.includes("smoothie")) return "/glass";
  if (key.includes("hydration")) return "/bottle";
  if (key.includes("combo")) return "/combo";
  if (key.includes("bowl") || !category) return "/bowl";
  return "";
}
