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
    id: 'domlur',
    name: 'Domlur Kitchen',
    lat: 12.9616,
    lng: 77.6382,
  },
];

/** Haversine formula — returns straight-line distance in km */
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

/** Returns the closest hub and its distance from the given coordinates */
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

/** Returns 0 (free) or DELIVERY_FEE_RS (₹60) based on distance from nearest hub */
export function getDeliveryFee(lat: number, lng: number): number {
  const { distanceKm } = getNearestHub(lat, lng);
  return distanceKm <= FREE_ZONE_RADIUS_KM ? 0 : DELIVERY_FEE_RS;
}
