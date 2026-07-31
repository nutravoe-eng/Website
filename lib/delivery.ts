export const DELIVERY_FEE_RS = 60;
export const FREE_ZONE_RADIUS_KM = 10;

export interface Hub {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

/**
 * All Nutravoe kitchen / fulfilment hubs.
 * To add a new city or hub, append an entry here — nothing else needs to change.
 */
export const HUBS: Hub[] = [
  {
    id: "domlur",
    name: "Domlur Kitchen",
    lat: 12.960317,
    lng: 77.637860,
  },
];

/** Haversine formula — returns straight-line distance in km (fallback when road routing unavailable) */
export function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Nearest hub by straight-line distance + that straight-line km (for quick UI / fallback only).
 * Pricing uses {@link resolveDeliveryDistanceKm} (road distance) when available.
 */
export function getNearestHub(
  lat: number,
  lng: number,
): { hub: Hub; distanceKm: number } {
  let nearest = HUBS[0];
  let minDist = haversineDistance(lat, lng, HUBS[0].lat, HUBS[0].lng);

  for (const hub of HUBS.slice(1)) {
    const d = haversineDistance(lat, lng, hub.lat, hub.lng);
    if (d < minDist) {
      minDist = d;
      nearest = hub;
    }
  }

  return { hub: nearest, distanceKm: minDist };
}

export interface DeliveryPriceBreakdown {
  distanceKm: number;
  ceilKm: number;
  totalCostRs: number; // ceil(km) × 10
  nutravoeCoverageRs: number; // ceil(km) × 5 — Nutravoe covers half
  customerPaysRs: number; // ceil(km) × 5
}

/** Full pricing from a distance in km (road or straight-line). */
export function deliveryPricingFromDistanceKm(
  distanceKm: number,
):
  | { isFree: true; distanceKm: number }
  | ({ isFree: false } & DeliveryPriceBreakdown) {
  if (distanceKm <= FREE_ZONE_RADIUS_KM) {
    return { isFree: true, distanceKm };
  }
  const ceilKm = Math.ceil(distanceKm);
  const totalCostRs = ceilKm * 10;
  const half = ceilKm * 5;
  return {
    isFree: false,
    distanceKm,
    ceilKm,
    totalCostRs,
    nutravoeCoverageRs: half,
    customerPaysRs: half,
  };
}

/**
 * Weekly delivery fee for a subscription from a distance in km.
 * uniqueDeliveryDays = distinct delivery days per week.
 */
export function subscriptionWeeklyFeeFromDistanceKm(distanceKm: number, uniqueDeliveryDays: number): number {
  if (distanceKm <= FREE_ZONE_RADIUS_KM) return 0;
  return Math.ceil(distanceKm) * 5 * uniqueDeliveryDays;
}

/** Single-order delivery fee from km (0 in free zone). */
export function deliveryFeeFromDistanceKm(distanceKm: number): number {
  if (distanceKm <= FREE_ZONE_RADIUS_KM) return 0;
  return Math.ceil(distanceKm) * 5;
}
