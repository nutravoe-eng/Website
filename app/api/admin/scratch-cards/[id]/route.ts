import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/admin-auth";
import { adminSupabase } from "@/lib/supabase/admin";
import { scratchCardUrl, whatsappLinkForCard } from "@/lib/scratch-cards";

/** Mark a card paid (with an optional GPay/UPI reference) or undo that. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  if (typeof body?.paid !== "boolean") return NextResponse.json({ error: "paid must be true or false" }, { status: 422 });

  const ref = typeof body?.payment_ref === "string" ? body.payment_ref.trim().slice(0, 120) || null : null;
  const update = body.paid
    ? { paid_at: new Date().toISOString(), paid_by: admin.userId, payment_ref: ref }
    : { paid_at: null, paid_by: null, payment_ref: null };

  const { data, error } = await adminSupabase.from("scratch_cards").update(update).eq("id", id).select("*").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Card not found" }, { status: 404 });
  return NextResponse.json({
    card: { ...data, link: scratchCardUrl(data.code), whatsapp: whatsappLinkForCard(data.customer_phone, data.code, data.customer_name) },
  });
}
