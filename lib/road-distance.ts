import type { Hub } from "@/lib/delivery";
import { getNearestHub, haversineDistance } from "@/lib/delivery";
import { olaDrivingDistanceKm } from "@/lib/ola-maps";

export type DistanceSource = "road" | "straight_line";

/**
 * Road distance from hub to destination when possible; otherwise straight-line to that hub.
 * Used for delivery pricing (aligns with how couriers actually travel).
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
  const roadKm = await olaDrivingDistanceKm(hub.lat, hub.lng, destLat, destLng, options?.httpReferrer);
  if (roadKm !== null && Number.isFinite(roadKm) && roadKm >= 0) {
    return { hub, distanceKm: roadKm, source: "road" };
  }
  const straightKm = haversineDistance(destLat, destLng, hub.lat, hub.lng);
  return { hub, distanceKm: straightKm, source: "straight_line" };
}
