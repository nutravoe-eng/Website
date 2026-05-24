/**
 * Google Maps Platform — server-side fallbacks when OLA Maps is unavailable.
 *
 * Enable on the same API key: Routes API (driving distance), Geocoding API,
 * Places API (Autocomplete + Place Details for address search).
 */

const ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";
const GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json";
const AUTOCOMPLETE_URL = "https://maps.googleapis.com/maps/api/place/autocomplete/json";
const PLACE_DETAILS_URL = "https://maps.googleapis.com/maps/api/place/details/json";
const TIMEOUT_MS = 5000;

export interface GoogleGeocodeHit {
  lat: number;
  lng: number;
  display_name: string;
}

export interface GoogleReverseGeocodeHit {
  lat: number;
  lng: number;
  display_name?: string;
  city?: string;
  state?: string;
  pincode?: string;
}

function getGoogleMapsApiKey(): string | null {
  const key = process.env.GOOGLE_MAPS_API_KEY?.trim();
  return key || null;
}

async function googleFetchJson<T>(url: URL): Promise<T | null> {
  const key = getGoogleMapsApiKey();
  if (!key) return null;

  url.searchParams.set("key", key);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url.toString(), { cache: "no-store", signal: controller.signal });
    if (!res.ok) {
      if (process.env.NODE_ENV === "development") {
        console.warn(`[google-maps] HTTP ${res.status} for ${url.pathname}`);
      }
      return null;
    }
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

type GeocodeResponse = {
  status?: string;
  results?: Array<{
    formatted_address?: string;
    geometry?: { location?: { lat?: number; lng?: number } };
    address_components?: Array<{
      long_name?: string;
      short_name?: string;
      types?: string[];
    }>;
  }>;
};

function hitsFromGeocodeResponse(data: GeocodeResponse | null, limit: number): GoogleGeocodeHit[] {
  if (!data || data.status !== "OK" || !Array.isArray(data.results)) return [];
  const out: GoogleGeocodeHit[] = [];
  for (const r of data.results) {
    const lat = r.geometry?.location?.lat;
    const lng = r.geometry?.location?.lng;
    if (typeof lat !== "number" || typeof lng !== "number" || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      continue;
    }
    out.push({
      lat,
      lng,
      display_name: r.formatted_address ?? `${lat}, ${lng}`,
    });
    if (out.length >= limit) break;
  }
  return out;
}

/** Forward geocode — best single hit for an address string. */
export async function googleGeocodeAddress(address: string): Promise<GoogleGeocodeHit | null> {
  const trimmed = address.trim();
  if (!trimmed) return null;

  const url = new URL(GEOCODE_URL);
  url.searchParams.set("address", trimmed);
  url.searchParams.set("region", "in");
  url.searchParams.set("components", "country:IN");

  const data = await googleFetchJson<GeocodeResponse>(url);
  return hitsFromGeocodeResponse(data, 1)[0] ?? null;
}

/** Forward geocode — up to `limit` hits (address search fallback). */
export async function googleGeocodeSearch(q: string, limit = 5): Promise<GoogleGeocodeHit[]> {
  const trimmed = q.trim();
  if (!trimmed) return [];
  const address = /\bindia\b/i.test(trimmed) ? trimmed : `${trimmed}, India`;

  const url = new URL(GEOCODE_URL);
  url.searchParams.set("address", address);
  url.searchParams.set("region", "in");
  url.searchParams.set("components", "country:IN");

  const data = await googleFetchJson<GeocodeResponse>(url);
  return hitsFromGeocodeResponse(data, limit);
}

type AutocompleteResponse = {
  status?: string;
  predictions?: Array<{ description?: string; place_id?: string }>;
};

type PlaceDetailsResponse = {
  status?: string;
  result?: {
    formatted_address?: string;
    geometry?: { location?: { lat?: number; lng?: number } };
  };
};

async function googlePlaceDetailsHit(placeId: string): Promise<GoogleGeocodeHit | null> {
  const url = new URL(PLACE_DETAILS_URL);
  url.searchParams.set("place_id", placeId);
  url.searchParams.set("fields", "geometry,formatted_address");

  const data = await googleFetchJson<PlaceDetailsResponse>(url);
  if (!data || data.status !== "OK" || !data.result) return null;

  const lat = data.result.geometry?.location?.lat;
  const lng = data.result.geometry?.location?.lng;
  if (typeof lat !== "number" || typeof lng !== "number") return null;

  return {
    lat,
    lng,
    display_name: data.result.formatted_address ?? `${lat}, ${lng}`,
  };
}

/** Places Autocomplete + details — mirrors Ola autocomplete search UX. */
export async function googlePlacesSearch(q: string, limit = 5): Promise<GoogleGeocodeHit[]> {
  const trimmed = q.trim();
  if (trimmed.length < 3) return googleGeocodeSearch(trimmed, limit);

  const url = new URL(AUTOCOMPLETE_URL);
  url.searchParams.set("input", trimmed);
  url.searchParams.set("components", "country:in");
  url.searchParams.set("types", "geocode");

  const data = await googleFetchJson<AutocompleteResponse>(url);
  if (!data || data.status !== "OK" || !Array.isArray(data.predictions) || !data.predictions.length) {
    return googleGeocodeSearch(trimmed, limit);
  }

  const out: GoogleGeocodeHit[] = [];
  const seen = new Set<string>();
  const predictionLimit = Math.min(limit, 3);
  const detailedHits = await Promise.all(
    data.predictions.slice(0, predictionLimit).map(async (prediction) => {
      if (!prediction.place_id) return null;
      return googlePlaceDetailsHit(prediction.place_id);
    }),
  );

  for (const hit of detailedHits) {
    if (!hit) continue;
    const key = `${hit.lat.toFixed(5)},${hit.lng.toFixed(5)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(hit);
  }

  if (out.length) return out;
  return googleGeocodeSearch(trimmed, limit);
}

function componentValue(
  components: Array<{ long_name?: string; short_name?: string; types?: string[] }> | undefined,
  type: string,
): string | undefined {
  if (!components) return undefined;
  const c = components.find((part) => part.types?.includes(type));
  return c?.long_name ?? c?.short_name;
}

/** Reverse geocode lat/lng (signup pin → city/state/pincode). */
export async function googleReverseGeocode(lat: number, lng: number): Promise<GoogleReverseGeocodeHit | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const url = new URL(GEOCODE_URL);
  url.searchParams.set("latlng", `${lat},${lng}`);
  url.searchParams.set("region", "in");

  const data = await googleFetchJson<GeocodeResponse>(url);
  if (!data || data.status !== "OK" || !data.results?.length) return null;

  const r = data.results[0];
  const components = r.address_components;
  const city =
    componentValue(components, "locality") ??
    componentValue(components, "administrative_area_level_2") ??
    componentValue(components, "sublocality") ??
    componentValue(components, "postal_town");
  const state =
    componentValue(components, "administrative_area_level_1") ?? componentValue(components, "administrative_area_level_2");
  const pincode = componentValue(components, "postal_code");

  return {
    lat,
    lng,
    ...(r.formatted_address ? { display_name: r.formatted_address } : {}),
    ...(city ? { city } : {}),
    ...(state ? { state } : {}),
    ...(pincode && /^\d{6}$/.test(pincode) ? { pincode } : {}),
  };
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
      console.warn(`[google-maps] Routes API HTTP ${res.status} — skipping`);
      return null;
    }

    const json = await res.json();
    const meters: unknown = json?.routes?.[0]?.distanceMeters;
    if (typeof meters !== "number" || !Number.isFinite(meters) || meters < 0) {
      console.warn("[google-maps] Routes API: unexpected response shape — skipping");
      return null;
    }

    return meters / 1000;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
