import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { geocodeIndianPincode, requestOriginReferrer } from "@/lib/ola-maps";

function parseCityState(displayName?: string): { city?: string; state?: string } {
  if (!displayName) return {};
  const parts = displayName
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (!parts.length) return {};

  const indiaIdx = parts.findIndex((p) => /^india$/i.test(p));
  const withoutCountry = indiaIdx >= 0 ? parts.slice(0, indiaIdx) : parts;
  const cleaned = withoutCountry.filter((p) => !/^\d{6}$/.test(p));
  if (!cleaned.length) return {};

  const state = cleaned[cleaned.length - 1];
  const city = cleaned.length >= 2 ? cleaned[cleaned.length - 2] : cleaned[0];
  return { city, state };
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
