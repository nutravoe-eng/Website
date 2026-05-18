/**
 * Google Maps Routes API — server-side driving distance.
 * Used as a fallback when OLA Maps is unavailable. Returns null when the API
 * key is missing, the request fails, or the response cannot be parsed, so the
 * caller can safely fall through to haversine straight-line distance.
 */

const ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";
const TIMEOUT_MS = 5000;

function getGoogleMapsApiKey(): string | null {
  const key = process.env.GOOGLE_MAPS_API_KEY?.trim();
  return key || null;
}

export async function googleDrivingDistanceKm(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
): Promise<number | null> {
  const apiKey = getGoogleMapsApiKey();
  if (!apiKey) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(ROUTES_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "routes.distanceMeters",
      },
      body: JSON.stringify({
        origin: { location: { latLng: { latitude: originLat, longitude: originLng } } },
        destination: { location: { latLng: { latitude: destLat, longitude: destLng } } },
        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_UNAWARE",
      }),
      cache: "no-store",
      signal: controller.signal,
    });

    if (!res.ok) {
      console.warn(`[delivery] Google Maps Routes API HTTP ${res.status} — skipping`);
      return null;
    }

    const json = await res.json();
    const meters: unknown = json?.routes?.[0]?.distanceMeters;
    if (typeof meters !== "number" || !Number.isFinite(meters) || meters < 0) {
      console.warn("[delivery] Google Maps Routes API: unexpected response shape — skipping");
      return null;
    }

    return meters / 1000;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
