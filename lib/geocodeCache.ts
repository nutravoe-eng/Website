/**
 * Client-side geocode cache backed by localStorage.
 * Each pincode result is stored for 7 days, so `/api/geocode` is only
 * called once per unique pincode per device.
 */

const CACHE_KEY = 'nutravoe_geocache';
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface CacheEntry {
  lat: number;
  lng: number;
  ts: number;
}

function readCache(): Record<string, CacheEntry> {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}');
  } catch {
    return {};
  }
}

function writeCache(cache: Record<string, CacheEntry>) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Storage quota exceeded — silently skip caching
  }
}

/**
 * Resolves a pincode to { lat, lng }.
 * Checks localStorage cache first; falls back to /api/geocode if stale or missing.
 * Returns null if geocoding fails.
 */
export async function geocodePincode(
  pincode: string,
): Promise<{ lat: number; lng: number } | null> {
  const cache = readCache();
  const entry = cache[pincode];

  if (entry && Date.now() - entry.ts < TTL_MS) {
    return { lat: entry.lat, lng: entry.lng };
  }

  try {
    const res = await fetch(`/api/geocode?pincode=${encodeURIComponent(pincode)}`);
    if (!res.ok) return null;
    const { lat, lng }: { lat: number; lng: number } = await res.json();
    cache[pincode] = { lat, lng, ts: Date.now() };
    writeCache(cache);
    return { lat, lng };
  } catch {
    return null;
  }
}
