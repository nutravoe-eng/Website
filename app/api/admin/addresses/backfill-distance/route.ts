import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/admin-auth";
import { adminSupabase } from "@/lib/supabase/admin";
import { requestOriginReferrer } from "@/lib/ola-maps";
import { resolveDeliveryDistanceKm } from "@/lib/road-distance";
import { syncAddressDeliveryMetadata } from "@/lib/address-delivery-sync";

type BackfillRow = {
  id: string;
  lat: number;
  lng: number;
};

function parseBatchSize(value: string | null): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) return 100;
  return Math.max(1, Math.min(500, parsed));
}

function parseDryRun(value: string | null): boolean {
  if (!value) return false;
  const v = value.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/**
 * POST /api/admin/addresses/backfill-distance?limit=100&dryRun=false
 *
 * For rows with lat/lng that are missing route metadata, runs the same
 * {@link syncAddressDeliveryMetadata} path as the dashboard: `distance_km`,
 * `nearest_hub_id`, and clears legacy `delivery_fee` (fee is derived in app).
 */
export async function POST(req: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const limit = parseBatchSize(req.nextUrl.searchParams.get("limit"));
  const dryRun = parseDryRun(req.nextUrl.searchParams.get("dryRun"));

  const { data, error } = await adminSupabase
    .from("addresses")
    .select("id, lat, lng")
    .not("lat", "is", null)
    .not("lng", "is", null)
    .or("distance_km.is.null,nearest_hub_id.is.null")
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as BackfillRow[];
  const failures: Array<{ id: string; error: string }> = [];
  let updated = 0;
  const referrer = requestOriginReferrer(req);

  for (const row of rows) {
    try {
      if (dryRun) {
        await resolveDeliveryDistanceKm(row.lat, row.lng, { httpReferrer: referrer });
        updated += 1;
        continue;
      }
      await syncAddressDeliveryMetadata(adminSupabase, row.id, row.lat, row.lng, {
        httpReferrer: referrer,
      });
      updated += 1;
    } catch (err) {
      failures.push({
        id: row.id,
        error: err instanceof Error ? err.message : "Distance resolution failed",
      });
    }
  }

  return NextResponse.json({
    dryRun,
    scanned: rows.length,
    updated,
    failed: failures.length,
    failures: failures.slice(0, 25),
    nextStep:
      rows.length === limit
        ? "More rows may remain. Run this endpoint again."
        : "Backfill batch completed.",
  });
}
