import type { Hub } from "@/lib/delivery";
import { getNearestHub, haversineDistance } from "@/lib/delivery";
import { googleDrivingDistanceKm } from "@/lib/google-maps";

export type DistanceSource = "road" | "straight_line";

/**
 * Road distance from hub to destination when possible; otherwise straight-line to that hub.
 * Attempt order: Google Maps Routes → haversine straight-line.
 */
export async function resolveDeliveryDistanceKm(
  destLat: number,
  destLng: number,
): Promise<{ hub: Hub; distanceKm: number; source: DistanceSource }> {
  const { hub } = getNearestHub(destLat, destLng);

  const googleKm = await googleDrivingDistanceKm(hub.lat, hub.lng, destLat, destLng);
  if (googleKm !== null && Number.isFinite(googleKm) && googleKm >= 0) {
    return { hub, distanceKm: googleKm, source: "road" };
  }

  const straightKm = haversineDistance(destLat, destLng, hub.lat, hub.lng);
  console.warn(
    `[delivery] Google Maps Routes unavailable for (${destLat},${destLng}); falling back to haversine ${straightKm.toFixed(2)} km. ` +
      `Road distance is typically 10–30% longer — delivery fee may be under-applied near the 5 km threshold.`,
  );
  return { hub, distanceKm: straightKm, source: "straight_line" };
}
