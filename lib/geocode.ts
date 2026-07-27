/**
 * Server-side geocoding — Google Maps first, Nominatim (OSM) fallback.
 */

import { googleGeocodeAddress, googlePlacesSearch } from "@/lib/google-maps";

export interface GeocodeHit {
  lat: number;
  lng: number;
  display_name: string;
}

function normalizeDigits(value: string): string {
  return value.replace(/\D/g, "");
}

function displayNameMatchesPincode(displayName: string | undefined, pincode: string): boolean {
  if (!displayName) return false;
  const normalizedPin = normalizeDigits(pincode);
  if (normalizedPin.length !== 6) return false;
  return normalizeDigits(displayName).includes(normalizedPin);
}

async function nominatimPincode(pincode: string): Promise<GeocodeHit | null> {
  const query = `${pincode}, India`;
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=in`;

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Nutravoe/1.0 (support@nutravoe.in)",
        "Accept-Language": "en",
      },
      next: { revalidate: 86_400 },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{ lat: string; lon: string; display_name: string }>;
    if (!data.length) return null;
    return {
      lat: Number.parseFloat(data[0].lat),
      lng: Number.parseFloat(data[0].lon),
      display_name: data[0].display_name,
    };
  } catch {
    return null;
  }
}

async function nominatimSearch(q: string): Promise<GeocodeHit[]> {
  const trimmed = q.trim();
  if (!trimmed) return [];
  const query = /\bindia\b/i.test(trimmed) ? trimmed : `${trimmed}, India`;
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&countrycodes=in`;

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Nutravoe/1.0 (support@nutravoe.in)",
        "Accept-Language": "en",
      },
      next: { revalidate: 60 },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as Array<{ lat: string; lon: string; display_name: string }>;
    return data.map((item) => ({
      lat: Number.parseFloat(item.lat),
      lng: Number.parseFloat(item.lon),
      display_name: item.display_name,
    }));
  } catch {
    return [];
  }
}

/** Pincode → coordinates (Google → Nominatim). Used by API routes and checkout pricing. */
export async function geocodeIndianPincode(
  pincode: string,
): Promise<{ lat: number; lng: number; display_name?: string } | null> {
  const normalizedPin = pincode.trim();
  if (!/^\d{6}$/.test(normalizedPin)) return null;

  const queries = [`${normalizedPin} India`, normalizedPin];
  for (const query of queries) {
    const g = await googleGeocodeAddress(query);
    if (g && displayNameMatchesPincode(g.display_name, normalizedPin)) {
      return { lat: g.lat, lng: g.lng, display_name: g.display_name };
    }
  }

  const fb = await nominatimPincode(normalizedPin);
  if (fb && displayNameMatchesPincode(fb.display_name, normalizedPin)) {
    return { lat: fb.lat, lng: fb.lng, display_name: fb.display_name };
  }
  return null;
}

/** Map search: Google Places/geocode → Nominatim. */
export async function geocodeSearchIndia(q: string): Promise<GeocodeHit[]> {
  const trimmed = q.trim();
  if (!trimmed) return [];

  const googleHits = await googlePlacesSearch(trimmed, 5);
  if (googleHits.length) return googleHits;

  return nominatimSearch(q);
}

export const geocodeSearchBangalore = geocodeSearchIndia;
