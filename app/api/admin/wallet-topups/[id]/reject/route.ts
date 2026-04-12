import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/admin-auth";
import { adminSupabase } from "@/lib/supabase/admin";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const adminNotes = typeof body?.admin_notes === "string" ? body.admin_notes.trim().slice(0, 2000) : null;

  const { data: row, error: fetchErr } = await adminSupabase
    .from("wallet_topup_requests")
    .select("id, status")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr || !row) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }

  if (row.status !== "pending") {
    return NextResponse.json({ error: "Request is not pending" }, { status: 409 });
  }

  const { error: updErr } = await adminSupabase
    .from("wallet_topup_requests")
    .update({
      status: "rejected",
      admin_notes: adminNotes,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "pending");

  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
