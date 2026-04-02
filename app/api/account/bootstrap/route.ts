import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminSupabase } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const fullName = typeof body?.full_name === "string" ? body.full_name.trim() : "";
  const phoneRaw = typeof body?.phone === "string" ? body.phone.replace(/\D/g, "") : "";
  const touchLastLogin = body?.touch_last_login === true;
  const address = body?.address && typeof body.address === "object" ? body.address : null;

  if (phoneRaw && !/^\d{10}$/.test(phoneRaw)) {
    return NextResponse.json({ error: "Valid phone number required" }, { status: 400 });
  }

  const userUpdates: Record<string, string | null> = {};
  if (fullName) userUpdates.full_name = fullName;
  if (phoneRaw) userUpdates.phone = phoneRaw;
  if (touchLastLogin) userUpdates.last_login_at = new Date().toISOString();

  if (Object.keys(userUpdates).length > 0) {
    const { error: profileError } = await adminSupabase
      .from("users")
      .update(userUpdates)
      .eq("id", user.id);

    if (profileError) {
      return NextResponse.json({ error: "Failed to update account profile" }, { status: 500 });
    }
  }

  if (address) {
    const line1 = typeof address.line1 === "string" ? address.line1.trim() : "";
    const line2 = typeof address.line2 === "string" ? address.line2.trim() : "";
    const city = typeof address.city === "string" ? address.city.trim() : "";
    const state = typeof address.state === "string" ? address.state.trim() : "";
    const pincode = typeof address.pincode === "string" ? address.pincode.replace(/\D/g, "") : "";
    const lat = typeof address.lat === "number" ? address.lat : null;
    const lng = typeof address.lng === "number" ? address.lng : null;

    if (!line1 || !city || !state || !/^\d{6}$/.test(pincode)) {
      return NextResponse.json({ error: "Valid address required" }, { status: 400 });
    }

    const { error: unsetDefaultError } = await adminSupabase
      .from("addresses")
      .update({ is_default: false })
      .eq("user_id", user.id)
      .eq("is_default", true);

    if (unsetDefaultError) {
      return NextResponse.json({ error: "Failed to save default address" }, { status: 500 });
    }

    const { error: addressError } = await adminSupabase
      .from("addresses")
      .insert({
        user_id: user.id,
        label: "Home",
        line1,
        line2: line2 || null,
        city,
        state,
        pincode,
        is_default: true,
        ...(lat !== null && lng !== null ? { lat, lng } : {}),
      });

    if (addressError) {
      return NextResponse.json({ error: "Failed to save default address" }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true });
}
