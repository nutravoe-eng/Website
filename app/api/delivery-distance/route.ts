import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { deliveryPricingFromDistanceKm } from "@/lib/delivery";
import { requestOriginReferrer } from "@/lib/ola-maps";
import { resolveDeliveryDistanceKm } from "@/lib/road-distance";

/**
 * GET ?lat=&lng=
 * Returns driving distance (when OLA_MAPS_API_KEY / OLAMAPS_API_KEY is set) or straight-line fallback,
 * plus pricing breakdown for the cart / navbar / subscribe UI.
 */
export async function GET(req: NextRequest) {
  const limited = await enforceRateLimit(req, "delivery-distance", 30, 60);
  if (!limited.ok) return limited.response;

  const lat = Number.parseFloat(req.nextUrl.searchParams.get("lat") ?? "");
  const lng = Number.parseFloat(req.nextUrl.searchParams.get("lng") ?? "");
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return NextResponse.json({ error: "Valid lat and lng query params are required" }, { status: 400, headers: limited.headers });
  }

  try {
    const { hub, distanceKm, source } = await resolveDeliveryDistanceKm(lat, lng, {
      httpReferrer: requestOriginReferrer(req),
    });
    const breakdown = deliveryPricingFromDistanceKm(distanceKm);
    const deliveryFee = breakdown.isFree ? 0 : breakdown.customerPaysRs;
    return NextResponse.json(
      {
        hub,
        distanceKm,
        distanceSource: source,
        breakdown,
        deliveryFee,
      },
      { headers: limited.headers },
    );
  } catch (e) {
    console.error("delivery-distance:", e);
    return NextResponse.json({ error: "Distance lookup failed" }, { status: 500, headers: limited.headers });
  }
}
