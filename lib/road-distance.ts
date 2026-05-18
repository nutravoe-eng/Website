import type { Hub } from "@/lib/delivery";
import { getNearestHub, haversineDistance } from "@/lib/delivery";
import { googleDrivingDistanceKm } from "@/lib/google-maps";
import { olaDrivingDistanceKm } from "@/lib/ola-maps";

export type DistanceSource = "road" | "straight_line";

/**
 * Road distance from hub to destination when possible; otherwise straight-line to that hub.
 * Attempt order: OLA Maps → Google Maps → haversine straight-line.
 *
 * @param options.httpReferrer — From `requestOriginReferrer(req)` when handling an HTTP request
 *   so Ola domain allowlist matches the real dev port (3001, 3002, …).
 */
export async function resolveDeliveryDistanceKm(
  destLat: number,
  destLng: number,
  options?: { httpReferrer?: string | null },
): Promise<{ hub: Hub; distanceKm: number; source: DistanceSource }> {
  const { hub } = getNearestHub(destLat, destLng);

  const olaKm = await olaDrivingDistanceKm(hub.lat, hub.lng, destLat, destLng, options?.httpReferrer);
  if (olaKm !== null && Number.isFinite(olaKm) && olaKm >= 0) {
    return { hub, distanceKm: olaKm, source: "road" };
  }

  const googleKm = await googleDrivingDistanceKm(hub.lat, hub.lng, destLat, destLng);
  if (googleKm !== null && Number.isFinite(googleKm) && googleKm >= 0) {
    console.warn(`[delivery] OLA Maps unavailable for (${destLat},${destLng}); using Google Maps fallback ${googleKm.toFixed(2)} km.`);
    return { hub, distanceKm: googleKm, source: "road" };
  }

  const straightKm = haversineDistance(destLat, destLng, hub.lat, hub.lng);
  console.warn(
    `[delivery] OLA Maps and Google Maps both unavailable for (${destLat},${destLng}); falling back to haversine ${straightKm.toFixed(2)} km. ` +
      `Road distance is typically 10–30% longer — delivery fee may be under-applied near the 10 km threshold.`,
  );
  return { hub, distanceKm: straightKm, source: "straight_line" };
}
