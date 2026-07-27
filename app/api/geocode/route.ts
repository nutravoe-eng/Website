import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { googleReverseGeocode } from "@/lib/google-maps";
import { geocodeIndianPincode } from "@/lib/geocode";

const INDIAN_STATES_AND_UTS = new Set([
  "andhra pradesh",
  "arunachal pradesh",
  "assam",
  "bihar",
  "chhattisgarh",
  "goa",
  "gujarat",
  "haryana",
  "himachal pradesh",
  "jharkhand",
  "karnataka",
  "kerala",
  "madhya pradesh",
  "maharashtra",
  "manipur",
  "meghalaya",
  "mizoram",
  "nagaland",
  "odisha",
  "punjab",
  "rajasthan",
  "sikkim",
  "tamil nadu",
  "telangana",
  "tripura",
  "uttar pradesh",
  "uttarakhand",
  "west bengal",
  "andaman and nicobar islands",
  "chandigarh",
  "dadra and nagar haveli and daman and diu",
  "delhi",
  "jammu and kashmir",
  "ladakh",
  "lakshadweep",
  "puducherry",
]);

function normalizeToken(value: string): string {
  return value.toLowerCase().replace(/\./g, "").replace(/\s+/g, " ").trim();
}

function canonicalizeCity(city: string): string {
  const normalized = normalizeToken(city);
  if (/^(bengaluru|bangalore)( urban)?$/.test(normalized)) return "Bengaluru";
  return city;
}

function isLikelyLocality(token: string): boolean {
  const t = normalizeToken(token);
  // Common locality/micro-area markers across Indian addresses.
  return /(?:^|\s)(road|rd|street|st|lane|ln|main|cross|layout|phase|block|sector|colony|nagar|extension|extn|tehsil|taluk|mandal|village|area|market|bazar|circle|chowk|industrial area)(?:\s|$)/.test(t);
}

function parseCityState(displayName?: string): { city?: string; state?: string } {
  if (!displayName) return {};
  const parts = displayName
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (!parts.length) return {};

  const indiaIdx = parts.findIndex((p) => /^india$/i.test(p));
  const withoutCountry = indiaIdx >= 0 ? parts.slice(0, indiaIdx) : parts;
  const cleaned = withoutCountry.filter((p) => !/^\d{6}$/.test(p.trim()));
  if (!cleaned.length) return {};

  const normalizedParts = cleaned.map((part) => normalizeToken(part));
  const stateIdx = normalizedParts.findLastIndex((part) => INDIAN_STATES_AND_UTS.has(part));

  const state = stateIdx >= 0 ? cleaned[stateIdx] : cleaned[cleaned.length - 1];
  const cityCandidates = stateIdx > 0 ? cleaned.slice(0, stateIdx) : cleaned;
  const normalizedCityCandidates = cityCandidates.map((part) => normalizeToken(part));

  const bengaluruMatchIdx = normalizedCityCandidates.findIndex((part) =>
    /^(bengaluru|bangalore)( urban)?$/.test(part),
  );
  let pickedCity: string;
  if (bengaluruMatchIdx >= 0) {
    pickedCity = cityCandidates[bengaluruMatchIdx];
  } else {
    // Prefer rightmost non-locality token in hierarchy (closest to district/city level).
    const nonLocality = [...cityCandidates].reverse().find((part) => !isLikelyLocality(part));
    pickedCity = nonLocality ?? cityCandidates[cityCandidates.length - 1] ?? cleaned[0];
  }

  return { city: canonicalizeCity(pickedCity), state };
}

function parseIndianPincode(displayName?: string): string | undefined {
  if (!displayName) return undefined;
  const match = displayName.match(/\b(\d{6})\b/);
  return match?.[1];
}

async function reverseGeocodeIndia(lat: number, lng: number): Promise<{
  lat: number;
  lng: number;
  display_name?: string;
  city?: string;
  state?: string;
  pincode?: string;
} | null> {
  const googleHit = await googleReverseGeocode(lat, lng);
  if (googleHit) {
    const parsedFromDisplay = parseCityState(googleHit.display_name);
    const city = googleHit.city ?? parsedFromDisplay.city;
    const state = googleHit.state ?? parsedFromDisplay.state;
    const pincode = googleHit.pincode ?? parseIndianPincode(googleHit.display_name);
    return {
      lat,
      lng,
      ...(googleHit.display_name ? { display_name: googleHit.display_name } : {}),
      ...(city ? { city: canonicalizeCity(city) } : {}),
      ...(state ? { state } : {}),
      ...(pincode && /^\d{6}$/.test(pincode) ? { pincode } : {}),
    };
  }

  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lng));
  url.searchParams.set("zoom", "18");
  url.searchParams.set("addressdetails", "1");

  try {
    const res = await fetch(url.toString(), {
      headers: {
        "User-Agent": "Nutravoe/1.0 (support@nutravoe.in)",
        "Accept-Language": "en",
      },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      display_name?: string;
      address?: Record<string, string | undefined>;
    };
    const address = data.address ?? {};
    const cityRaw =
      address.city ??
      address.city_district ??
      address.town ??
      address.village ??
      address.suburb ??
      address.municipality ??
      address.county ??
      undefined;
    const parsedFromDisplay = parseCityState(data.display_name);
    const stateRaw =
      address.state ??
      address.union_territory ??
      address.region ??
      address.province ??
      address.state_district ??
      parsedFromDisplay.state ??
      undefined;
    const pincode = address.postcode ?? parseIndianPincode(data.display_name);
    return {
      lat,
      lng,
      ...(data.display_name ? { display_name: data.display_name } : {}),
      ...((cityRaw ?? parsedFromDisplay.city) ? { city: canonicalizeCity(cityRaw ?? parsedFromDisplay.city ?? "") } : {}),
      ...(stateRaw ? { state: stateRaw } : {}),
      ...(pincode && /^\d{6}$/.test(pincode) ? { pincode } : {}),
    };
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const limited = await enforceRateLimit(req, "geocode-lookup", 10, 60);
  if (!limited.ok) return limited.response;

  const pincode = req.nextUrl.searchParams.get("pincode")?.trim();
  const latRaw = req.nextUrl.searchParams.get("lat")?.trim();
  const lngRaw = req.nextUrl.searchParams.get("lng")?.trim();

  if (pincode) {
    if (!/^\d{6}$/.test(pincode)) {
      return NextResponse.json({ error: "Valid pincode query param is required" }, { status: 400, headers: limited.headers });
    }

    try {
      const hit = await geocodeIndianPincode(pincode);
      if (!hit) {
        return NextResponse.json({ error: "Location not found" }, { status: 404, headers: limited.headers });
      }

      const parsed = parseCityState(hit.display_name);
      return NextResponse.json(
        {
          lat: hit.lat,
          lng: hit.lng,
          ...(hit.display_name ? { display_name: hit.display_name } : {}),
          ...(parsed.city ? { city: parsed.city } : {}),
          ...(parsed.state ? { state: parsed.state } : {}),
          pincode,
        },
        { headers: limited.headers },
      );
    } catch {
      return NextResponse.json({ error: "Geocoding failed" }, { status: 500, headers: limited.headers });
    }
  }

  const lat = latRaw ? Number(latRaw) : NaN;
  const lng = lngRaw ? Number(lngRaw) : NaN;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return NextResponse.json({ error: "Valid lat and lng query params are required" }, { status: 400, headers: limited.headers });
  }

  const hit = await reverseGeocodeIndia(lat, lng);
  if (!hit) {
    return NextResponse.json({ error: "Location not found" }, { status: 404, headers: limited.headers });
  }
  return NextResponse.json(hit, { headers: limited.headers });
}
