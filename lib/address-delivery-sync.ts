import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveDeliveryDistanceKm } from "@/lib/road-distance";

export interface SyncAddressDeliveryResult {
  distanceKm: number;
  nearestHubId: string | null;
  source: "road" | "straight_line";
}

/**
 * Ola (or straight-line fallback) from hub → pin, then persist `nearest_hub_id` + `distance_km`.
 * Does not set `delivery_fee` — that is derived in app code from `distance_km` (one-off rule).
 */
export async function syncAddressDeliveryMetadata(
  supabase: SupabaseClient,
  addressId: string,
  lat: number,
  lng: number,
  options?: { httpReferrer?: string | null },
): Promise<SyncAddressDeliveryResult> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error("Valid lat and lng are required");
  }

  const { hub, distanceKm, source } = await resolveDeliveryDistanceKm(lat, lng, {
    httpReferrer: options?.httpReferrer,
  });

  const slug = hub.id;
  const { data: hubRow } = await supabase.from("delivery_hubs").select("id").eq("slug", slug).maybeSingle();
  const nearestHubId = hubRow?.id && typeof hubRow.id === "string" ? hubRow.id : null;

  const distanceRounded = Math.round(distanceKm * 100) / 100;

  const { error } = await supabase
    .from("addresses")
    .update({
      nearest_hub_id: nearestHubId,
      distance_km: distanceRounded,
      distance_source: source,
      delivery_fee: null,
    })
    .eq("id", addressId);

  if (error) throw new Error(error.message);

  return { distanceKm: distanceRounded, nearestHubId, source };
}

/**
 * Load coordinates from the address row, then run {@link syncAddressDeliveryMetadata}.
 */
export async function syncAddressDeliveryMetadataById(
  supabase: SupabaseClient,
  addressId: string,
  options?: { httpReferrer?: string | null },
): Promise<SyncAddressDeliveryResult> {
  const { data: row, error } = await supabase
    .from("addresses")
    .select("lat, lng")
    .eq("id", addressId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!row || typeof row.lat !== "number" || typeof row.lng !== "number") {
    throw new Error("Address not found or missing map coordinates");
  }

  return syncAddressDeliveryMetadata(supabase, addressId, row.lat, row.lng, options);
}
