import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { syncAddressDeliveryMetadataById } from "@/lib/address-delivery-sync";

/**
 * Recompute and store `nearest_hub_id` + `distance_km` for the signed-in user's address
 * (same road-distance logic as /api/delivery-distance). Clears `delivery_fee` on the row.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const addressId = typeof body?.addressId === "string" ? body.addressId : "";
  if (!addressId) {
    return NextResponse.json({ error: "addressId is required" }, { status: 400 });
  }

  const { data: row, error: ownErr } = await supabase
    .from("addresses")
    .select("id, user_id")
    .eq("id", addressId)
    .maybeSingle();

  if (ownErr || !row) {
    return NextResponse.json({ error: "Address not found" }, { status: 404 });
  }
  if (row.user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const result = await syncAddressDeliveryMetadataById(supabase, addressId);
    return NextResponse.json({
      ...result,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Sync failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
