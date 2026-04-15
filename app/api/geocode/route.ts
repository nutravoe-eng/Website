import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { geocodeIndianPincode, requestOriginReferrer } from "@/lib/ola-maps";

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

export async function GET(req: NextRequest) {
  const limited = await enforceRateLimit(req, "geocode-pincode", 10, 60);
  if (!limited.ok) return limited.response;

  const pincode = req.nextUrl.searchParams.get("pincode")?.trim();
  if (!pincode || !/^\d{6}$/.test(pincode)) {
    return NextResponse.json({ error: "Valid pincode query param is required" }, { status: 400, headers: limited.headers });
  }

  try {
    const hit = await geocodeIndianPincode(pincode, requestOriginReferrer(req));
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
      },
      { headers: limited.headers },
    );
  } catch {
    return NextResponse.json({ error: "Geocoding failed" }, { status: 500, headers: limited.headers });
  }
}
