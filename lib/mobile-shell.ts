import type { Bowl, BowlPresetOptions, IngredientCustomization, SubscriptionPriceTier } from "@/types";

export const MOBILE_SHELL_CUSTOMER_PREFIXES = [
  "/",
  "/menu",
  "/about",
  "/subscribe",
  "/account",
  "/orders",
  "/subscriptions",
  "/addresses",
  "/wallet",
  "/help",
  "/profile",
] as const;

export const MOBILE_SHELL_FLOW_PREFIXES = [
  "/cart",
  "/signin",
  "/reset-password",
  "/confirmation",
  "/admin",
  "/invoice",
  "/receipt",
] as const;

export const MOBILE_SHELL_ACCOUNT_PREFIXES = [
  "/account",
  "/orders",
  "/subscriptions",
  "/addresses",
  "/wallet",
  "/help",
  "/profile",
] as const;

export const MOBILE_SHELL_HIDE_WHATSAPP_PREFIXES = [
  "/menu",
  "/subscribe",
  "/cart",
  "/account",
  "/orders",
  "/subscriptions",
  "/addresses",
  "/wallet",
  "/help",
  "/profile",
] as const;

export const MOBILE_SHELL_MINIMAL_FOOTER_PREFIXES = [
  ...MOBILE_SHELL_CUSTOMER_PREFIXES,
  "/b2b",
  "/privacy",
  "/terms",
  "/cart",
  "/signin",
  "/reset-password",
] as const;

export const MOBILE_SHELL_BOTTOM_NAV_HEIGHT_REM = 4.5;
export const MOBILE_SHELL_CART_BAR_HEIGHT_REM = 3.5;
export const MOBILE_SHELL_CHECKOUT_BAR_HEIGHT_REM = 8;

export const MENU_TIER_OPTIONS = [
  { key: "standard", label: "Premium", priceLabel: "Rs 299" },
  { key: "premium", label: "Exotic", priceLabel: "Rs 399" },
] as const;

export type MenuTierKey = (typeof MENU_TIER_OPTIONS)[number]["key"];

export function getMobileAccountHref(isLoggedIn: boolean) {
  return isLoggedIn ? "/account" : "/signin?next=/account";
}

function matchesPrefix(pathname: string, prefix: string): boolean {
  if (prefix === "/") return pathname === "/";
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function matchesAnyPrefix(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => matchesPrefix(pathname, prefix));
}

export function isFlowPathname(pathname: string): boolean {
  return matchesAnyPrefix(pathname, MOBILE_SHELL_FLOW_PREFIXES);
}

export function isCustomerShellPathname(pathname: string): boolean {
  return matchesAnyPrefix(pathname, MOBILE_SHELL_CUSTOMER_PREFIXES) && !isFlowPathname(pathname);
}

export function shouldShowMobileBottomNav(pathname: string): boolean {
  return isCustomerShellPathname(pathname);
}

export function shouldShowMinimalFooter(pathname: string): boolean {
  return matchesAnyPrefix(pathname, MOBILE_SHELL_MINIMAL_FOOTER_PREFIXES);
}

export function shouldShowWhatsAppFab(pathname: string): boolean {
  return !matchesAnyPrefix(pathname, MOBILE_SHELL_HIDE_WHATSAPP_PREFIXES) && !isFlowPathname(pathname);
}

export function shouldShowMobileCartBar(pathname: string, itemCount: number): boolean {
  return itemCount > 0 && shouldShowMobileBottomNav(pathname) && pathname !== "/cart" && pathname !== "/subscribe";
}

export function shouldReserveCheckoutBarSpace(pathname: string, itemCount: number): boolean {
  return pathname === "/cart" && itemCount > 0;
}

export function getMobileNavActiveKey(pathname: string): "home" | "menu" | "subscribe" | "account" {
  if (matchesAnyPrefix(pathname, MOBILE_SHELL_ACCOUNT_PREFIXES)) return "account";
  if (matchesPrefix(pathname, "/menu")) return "menu";
  if (matchesPrefix(pathname, "/subscribe")) return "subscribe";
  return "home";
}

export function getBottomSafeAreaPaddingRem({
  pathname,
  itemCount,
}: {
  pathname: string;
  itemCount: number;
}): number {
  let rem = 0;
  if (shouldShowMobileBottomNav(pathname)) rem += MOBILE_SHELL_BOTTOM_NAV_HEIGHT_REM;
  if (shouldShowMobileCartBar(pathname, itemCount)) rem += MOBILE_SHELL_CART_BAR_HEIGHT_REM;
  if (shouldReserveCheckoutBarSpace(pathname, itemCount)) rem += MOBILE_SHELL_CHECKOUT_BAR_HEIGHT_REM;
  return rem;
}

export function resolveBowlTier(bowl: Bowl): MenuTierKey {
  const normalized = String(bowl.subscriptionPriceTier ?? "").trim().toLowerCase();
  if (normalized === "premium" || bowl.price >= 399) return "premium";
  return "standard";
}

export function getTierLabel(tier: MenuTierKey | SubscriptionPriceTier | undefined): string {
  if (tier === "premium") return "Exotic";
  return "Premium";
}

export function getTierPriceLabel(tier: MenuTierKey | SubscriptionPriceTier | undefined): string {
  if (tier === "premium") return "Rs 399";
  return "Rs 299";
}

export function summarizeCustomizations(
  customizations: IngredientCustomization[] | undefined,
  bowl: Bowl | undefined,
  presetOptions?: BowlPresetOptions,
): string {
  const removed = (customizations ?? [])
    .filter((item) => item.option === "remove")
    .map((item) => bowl?.customizableIngredients?.find((ingredient) => ingredient.id === item.ingredientId)?.name)
    .filter(Boolean) as string[];
  const extras = (customizations ?? [])
    .filter((item) => item.option === "extra")
    .map((item) => bowl?.customizableIngredients?.find((ingredient) => ingredient.id === item.ingredientId)?.name)
    .filter(Boolean) as string[];
  const parts: string[] = [];
  if (presetOptions) {
    parts.push(`Base: ${presetOptions.baseChoice}`);
    parts.push(`Oats: ${presetOptions.oatsChoice}`);
    if (presetOptions.noSugar) parts.push("No sugar");
  }
  if (removed.length) parts.push(`Remove: ${removed.join(", ")}`);
  if (extras.length) parts.push(`Extra: ${extras.join(", ")}`);
  return parts.join(" - ");
}
