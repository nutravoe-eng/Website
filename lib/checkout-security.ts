import {
  DELIVERY_FEE_RS,
  FREE_ZONE_RADIUS_KM,
  deliveryFeeFromDistanceKm,
  deliveryPricingFromDistanceKm,
  subscriptionWeeklyFeeFromDistanceKm,
  type DeliveryPriceBreakdown,
} from "@/lib/delivery";
import { geocodeIndianPincode } from "@/lib/geocode";
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
  distance_source?: "road" | "straight_line" | null;
}

interface PricingContextOptions {
  /** @deprecated No longer used — kept for call-site compatibility. */
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

/**
 * Distance (km) for delivery pricing.
 *
 * Only trusts a cached `distance_km` when `distance_source === "road"` (Google Maps driving
 * distance). If the cached value came from a haversine fallback ("straight_line"), it
 * under-estimates the actual road distance, which can suppress the delivery fee for
 * addresses near the 5 km free-zone boundary. In that case we re-attempt routing; if it
 * still fails we keep the haversine value rather than blocking checkout.
 */
async function resolveDistanceKmForDeliveryPricing(
  address: AddressForPricing,
  options?: PricingContextOptions,
): Promise<number | null> {
  const hasCachedRoadDistance =
    typeof address.distance_km === "number" &&
    Number.isFinite(address.distance_km) &&
    address.distance_source === "road";

  if (hasCachedRoadDistance) {
    return address.distance_km as number;
  }

  const coords =
    typeof address.lat === "number" &&
    typeof address.lng === "number" &&
    Number.isFinite(address.lat) &&
    Number.isFinite(address.lng)
      ? { lat: address.lat, lng: address.lng }
      : await resolveAddressCoordinates(address);

  if (!coords) return null;

  const { distanceKm, source } = await resolveDeliveryDistanceKm(coords.lat, coords.lng);

  // When routing is still unavailable, fall back to the cached haversine value (if any) rather
  // than returning null and triggering the ₹60 hard fallback.
  if (source === "straight_line" && typeof address.distance_km === "number" && Number.isFinite(address.distance_km)) {
    return address.distance_km;
  }

  return distanceKm;
}

export async function isNearZoneAddress(address: AddressForPricing, options?: PricingContextOptions): Promise<boolean> {
  const d = await resolveDistanceKmForDeliveryPricing(address, options);
  if (d === null) return false;
  return d <= FREE_ZONE_RADIUS_KM;
}

export async function getAddressDeliveryFee(address: AddressForPricing, options?: PricingContextOptions): Promise<number> {
  const d = await resolveDistanceKmForDeliveryPricing(address, options);
  if (d === null) return DELIVERY_FEE_RS;
  return deliveryFeeFromDistanceKm(d);
}

export async function getAddressDeliveryBreakdown(
  address: AddressForPricing,
  options?: PricingContextOptions,
): Promise<({ isFree: true; distanceKm: number } | ({ isFree: false } & DeliveryPriceBreakdown)) | null> {
  const d = await resolveDistanceKmForDeliveryPricing(address, options);
  if (d === null) return null;
  return deliveryPricingFromDistanceKm(d);
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

function normalizeLegacyBowlKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function addBowlLookupEntry(map: Map<string, Bowl>, key: string | undefined, bowl: Bowl) {
  if (!key) return;
  const normalized = normalizeLegacyBowlKey(key);
  if (!normalized) return;
  map.set(normalized, bowl);
  if (normalized.endsWith("-bowl")) {
    map.set(normalized.slice(0, -5), bowl);
  }
  if (normalized.endsWith("-oatmeal")) {
    map.set(normalized.slice(0, -8), bowl);
  }
}

function buildBowlLookupMap(bowls: Bowl[]): Map<string, Bowl> {
  const map = new Map<string, Bowl>();
  for (const bowl of bowls) {
    addBowlLookupEntry(map, bowl.slug, bowl);
    addBowlLookupEntry(map, bowl._id, bowl);
    addBowlLookupEntry(map, `bowl-${bowl.slug}`, bowl);
    addBowlLookupEntry(map, bowl.name, bowl);
  }
  return map;
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

  const bowlMap = buildBowlLookupMap(bowls);

  const lineItems = items.map((item) => {
    const bowl = bowlMap.get(normalizeLegacyBowlKey(item.bowlSlug));
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
  const [plans, bowls, distanceKmForPricing] = await Promise.all([
    getSubscriptionPlans(),
    getAllBowls(),
    resolveDistanceKmForDeliveryPricing(address, options),
  ]);

  const plan = getPlanBySlug(plans, planSlug);
  if (!plan) {
    throw new Error(`Unknown subscription plan: ${planSlug}`);
  }
  const bowlMap = buildBowlLookupMap(bowls);
  const perBowl = plan.pricePerBowl || plan.price_per_bowl || 0;

  let totalIngredientExtrasRs = 0;
  let bowlsBaseFromConfigsRs = 0;

  for (const config of dayConfigs) {
    const bowl = bowlMap.get(normalizeLegacyBowlKey(config.bowlId));
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
