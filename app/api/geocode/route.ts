import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { geocodeIndianPincode, requestOriginReferrer } from "@/lib/ola-maps";

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

    return NextResponse.json(
      {
        lat: hit.lat,
        lng: hit.lng,
        ...(hit.display_name ? { display_name: hit.display_name } : {}),
      },
      { headers: limited.headers },
    );
  } catch {
    return NextResponse.json({ error: "Geocoding failed" }, { status: 500, headers: limited.headers });
  }
}
