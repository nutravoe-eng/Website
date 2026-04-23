import {
  DELIVERY_FEE_RS,
  FREE_ZONE_RADIUS_KM,
  deliveryFeeFromDistanceKm,
  deliveryPricingFromDistanceKm,
  subscriptionWeeklyFeeFromDistanceKm,
  type DeliveryPriceBreakdown,
} from "@/lib/delivery";
import { geocodeIndianPincode } from "@/lib/ola-maps";
import { resolveDeliveryDistanceKm } from "@/lib/road-distance";
import { getAllBowls, getSubscriptionPlans } from "@/lib/sanity";
import { getSubscriptionBaseUnitPriceForBowl } from "@/lib/subscription-pricing";
import type { Bowl, BowlPresetOptions, IngredientCustomization, SubscriptionPlan } from "@/types";

export interface AddressForPricing {
  id?: string | null;
  pincode?: string | null;
  lat?: number | null;
  lng?: number | null;
  distance_km?: number | null;
}

interface PricingContextOptions {
  httpReferrer?: string | null;
}

export interface CheckoutItemInput {
  bowlSlug: string;
  quantity: number;
  customizations?: IngredientCustomization[];
  presetOptions?: BowlPresetOptions;
}

export interface CheckoutLineItem {
  bowl_slug: string;
  bowl_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  customizations: {
    removed?: string[];
    added?: string[];
    baseChoice?: "yogurt" | "milk";
    oatsChoice?: "soaked" | "roasted";
    noSugar?: boolean;
    noSugarNote?: string;
  } | null;
}

async function resolveAddressCoordinates(address: AddressForPricing): Promise<{ lat: number; lng: number } | null> {
  if (typeof address.lat === "number" && typeof address.lng === "number") {
    return { lat: address.lat, lng: address.lng };
  }

  if (address.pincode && /^\d{6}$/.test(address.pincode)) {
    return geocodeIndianPincode(address.pincode);
  }

  return null;
}

export async function isNearZoneAddress(address: AddressForPricing, options?: PricingContextOptions): Promise<boolean> {
  if (typeof address.distance_km === "number" && Number.isFinite(address.distance_km)) {
    return address.distance_km <= FREE_ZONE_RADIUS_KM;
  }
  const coords = await resolveAddressCoordinates(address);
  // Fail safe: assume far zone when coords are unavailable to avoid unintended free delivery
  if (!coords) return false;
  const { distanceKm } = await resolveDeliveryDistanceKm(coords.lat, coords.lng, { httpReferrer: options?.httpReferrer });
  return distanceKm <= FREE_ZONE_RADIUS_KM;
}

export async function getAddressDeliveryFee(address: AddressForPricing, options?: PricingContextOptions): Promise<number> {
  if (typeof address.distance_km === "number" && Number.isFinite(address.distance_km)) {
    return deliveryFeeFromDistanceKm(address.distance_km);
  }
  const coords = await resolveAddressCoordinates(address);
  // Fail safe: charge the standard delivery fee when coords are unavailable
  if (!coords) return DELIVERY_FEE_RS;
  const { distanceKm } = await resolveDeliveryDistanceKm(coords.lat, coords.lng, { httpReferrer: options?.httpReferrer });
  return deliveryFeeFromDistanceKm(distanceKm);
}

export async function getAddressDeliveryBreakdown(
  address: AddressForPricing,
  options?: PricingContextOptions,
): Promise<({ isFree: true; distanceKm: number } | ({ isFree: false } & DeliveryPriceBreakdown)) | null> {
  if (typeof address.distance_km === "number" && Number.isFinite(address.distance_km)) {
    return deliveryPricingFromDistanceKm(address.distance_km);
  }
  const coords = await resolveAddressCoordinates(address);
  if (!coords) return null;
  const { distanceKm } = await resolveDeliveryDistanceKm(coords.lat, coords.lng, { httpReferrer: options?.httpReferrer });
  return deliveryPricingFromDistanceKm(distanceKm);
}

function summarizeCustomizations(
  bowl: Bowl,
  customizations: IngredientCustomization[] | undefined,
  presetOptions?: BowlPresetOptions,
): {
  removed?: string[];
  added?: string[];
  baseChoice?: "yogurt" | "milk";
  oatsChoice?: "soaked" | "roasted";
  noSugar?: boolean;
  noSugarNote?: string;
} | null {
  const list = customizations ?? [];
  const removed = list
    .filter((item) => item.option === "remove")
    .map((item) => bowl.customizableIngredients?.find((ingredient) => ingredient.id === item.ingredientId)?.name)
    .filter((value): value is string => Boolean(value));
  const added = list
    .filter((item) => item.option === "extra")
    .map((item) => bowl.customizableIngredients?.find((ingredient) => ingredient.id === item.ingredientId)?.name)
    .filter((value): value is string => Boolean(value));

  const hasPresetOptions = Boolean(presetOptions);
  if (!removed.length && !added.length && !hasPresetOptions) return null;
  return {
    ...(removed.length ? { removed } : {}),
    ...(added.length ? { added } : {}),
    ...(presetOptions ? { baseChoice: presetOptions.baseChoice } : {}),
    ...(presetOptions ? { oatsChoice: presetOptions.oatsChoice } : {}),
    ...(presetOptions ? { noSugar: presetOptions.noSugar } : {}),
    ...(presetOptions?.noSugar
      ? { noSugarNote: "Exclude banana, honey, dates" }
      : {}),
  };
}

export function getCustomizationUpcharge(bowl: Bowl, customizations: IngredientCustomization[] | undefined): number {
  const list = customizations ?? [];
  return list
    .filter((item) => item.option === "extra")
    .reduce((sum, item) => {
      const ingredient = bowl.customizableIngredients?.find((candidate) => candidate.id === item.ingredientId);
      return sum + (ingredient?.extraCost ?? 0);
    }, 0);
}

function getPlanBySlug(plans: SubscriptionPlan[], slug: string): SubscriptionPlan | null {
  return plans.find((plan) => plan.slug === slug) ?? null;
}

/**
 * Standard-tier subscription ₹ per bowl (299-class), global.
 * Use for flexible wallet **load** amounts; per-line debits use {@link getSubscriptionBaseUnitPriceForBowl}.
 */
export async function getSubscriptionUnitPrice(
  planSlug: string,
  _address: AddressForPricing,
  _options?: PricingContextOptions,
): Promise<number | null> {
  const plans = await getSubscriptionPlans();
  const plan = getPlanBySlug(plans, planSlug);
  if (!plan) return null;
  return plan.pricePerBowl || plan.price_per_bowl || 0;
}

export async function buildAuthoritativeOrder(
  items: CheckoutItemInput[],
  address: AddressForPricing,
  subscriptionPlanSlug?: string | null,
  options?: PricingContextOptions,
): Promise<{ subtotal: number; deliveryFee: number; total: number; lineItems: CheckoutLineItem[] }> {
  const [bowls, deliveryFee, plans] = await Promise.all([
    getAllBowls(),
    getAddressDeliveryFee(address, options),
    subscriptionPlanSlug ? getSubscriptionPlans() : Promise.resolve(null),
  ]);

  const subscriptionPlan =
    subscriptionPlanSlug && plans ? getPlanBySlug(plans, subscriptionPlanSlug) : null;
  if (subscriptionPlanSlug && !subscriptionPlan) {
    throw new Error(`Unknown subscription plan: ${subscriptionPlanSlug}`);
  }

  const bowlMap = new Map(bowls.map((bowl) => [bowl.slug, bowl]));

  const lineItems = items.map((item) => {
    const bowl = bowlMap.get(item.bowlSlug);
    if (!bowl) {
      throw new Error(`Unknown bowl: ${item.bowlSlug}`);
    }
    if (bowl.inStock === false) {
      throw new Error(`'${bowl.name}' is currently out of stock`);
    }

    const quantity = Math.max(1, Math.trunc(item.quantity));
    const customizationUpcharge = getCustomizationUpcharge(bowl, item.customizations);
    const baseUnitPrice = subscriptionPlan
      ? getSubscriptionBaseUnitPriceForBowl(subscriptionPlan, bowl)
      : bowl.price;

    return {
      bowl_slug: bowl.slug,
      bowl_name: bowl.name,
      quantity,
      unit_price: baseUnitPrice,                                    // base price only
      total_price: (baseUnitPrice + customizationUpcharge) * quantity, // includes customization
      customizations: summarizeCustomizations(bowl, item.customizations, item.presetOptions),
    };
  });

  const subtotal = lineItems.reduce((sum, item) => sum + item.total_price, 0);
  return {
    subtotal,
    deliveryFee,
    total: subtotal + deliveryFee,
    lineItems,
  };
}

export async function buildSubscriptionQuote(
  planSlug: string,
  address: AddressForPricing,
  dayConfigs: {
    bowlId: string;
    day?: string;
    quantity?: number;
    customizations?: IngredientCustomization[] | IngredientCustomization[][];
  }[],
  options?: PricingContextOptions,
): Promise<{
  billingCycle: "weekly" | "monthly";
  perBowl: number;
  bowlsPerCycle: number;
  bowlsAmountRs: number;
  totalAmountRs: number;
  totalIngredientExtrasRs: number;
  weeklyDeliveryFeeRs: number;
}> {
  const [plans, bowls, coords] = await Promise.all([
    getSubscriptionPlans(),
    getAllBowls(),
    resolveAddressCoordinates(address),
  ]);

  const plan = getPlanBySlug(plans, planSlug);
  if (!plan) {
    throw new Error(`Unknown subscription plan: ${planSlug}`);
  }

  let distanceKmForPricing: number | null = null;
  if (typeof address.distance_km === "number" && Number.isFinite(address.distance_km)) {
    distanceKmForPricing = address.distance_km;
  } else if (coords) {
    const resolved = await resolveDeliveryDistanceKm(coords.lat, coords.lng, { httpReferrer: options?.httpReferrer });
    distanceKmForPricing = resolved.distanceKm;
  }
  const bowlMap = new Map(bowls.map((b) => [b.slug, b]));
  const perBowl = plan.pricePerBowl || plan.price_per_bowl || 0;

  let totalIngredientExtrasRs = 0;
  let bowlsBaseFromConfigsRs = 0;

  for (const config of dayConfigs) {
    const bowl = bowlMap.get(config.bowlId);
    if (!bowl) {
      throw new Error(`Unknown bowl: ${config.bowlId}`);
    }
    if (bowl.inStock === false) {
      throw new Error(`'${bowl.name}' is currently out of stock and cannot be used in a subscription`);
    }

    const lineQty = Math.max(1, Math.trunc(config.quantity ?? 1));
    bowlsBaseFromConfigsRs += getSubscriptionBaseUnitPriceForBowl(plan, bowl) * lineQty;

    const customsRaw = config.customizations as unknown;
    const isPerInstance = Array.isArray((customsRaw as unknown[])?.[0]);

    if (isPerInstance) {
      // Per-instance format: IngredientCustomization[][]
      const instances = customsRaw as IngredientCustomization[][];
      for (const inst of instances) {
        totalIngredientExtrasRs += getCustomizationUpcharge(bowl, inst);
      }
    } else {
      // Legacy flat format: IngredientCustomization[]
      const flat = config.customizations as IngredientCustomization[] | undefined;
      totalIngredientExtrasRs += getCustomizationUpcharge(bowl, flat);
    }
  }

  // Flexible: no day configs — wallet load uses standard tier only. Spread: sum each bowl's tiered price × quantity.
  const bowlsAmountRs =
    dayConfigs.length === 0
      ? (perBowl * plan.bowlsPerCycle) + totalIngredientExtrasRs
      : bowlsBaseFromConfigsRs + totalIngredientExtrasRs;

  // Count unique delivery days to calculate weekly delivery fee
  const uniqueDeliveryDays = new Set(dayConfigs.map((c) => c.day).filter(Boolean)).size;
  const weeklyDeliveryFeeRs =
    distanceKmForPricing !== null
      ? subscriptionWeeklyFeeFromDistanceKm(distanceKmForPricing, uniqueDeliveryDays)
      : uniqueDeliveryDays * DELIVERY_FEE_RS; // failsafe when coords unavailable

  return {
    billingCycle: plan.billingCycle,
    perBowl,
    bowlsPerCycle: plan.bowlsPerCycle,
    bowlsAmountRs,
    totalAmountRs: bowlsAmountRs + weeklyDeliveryFeeRs,
    totalIngredientExtrasRs,
    weeklyDeliveryFeeRs,
  };
}
