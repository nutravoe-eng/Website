import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/admin-auth";
import { adminSupabase } from "@/lib/supabase/admin";

function expiresAtFromPeriodEnd(periodEndDate: string | null): string | null {
  if (!periodEndDate) return null;
  return `${periodEndDate}T23:59:59+05:30`;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const paymentReference =
    typeof body?.payment_reference === "string" ? body.payment_reference.trim().slice(0, 200) : null;

  const { data: row, error: fetchErr } = await adminSupabase
    .from("wallet_topup_requests")
    .select("id, public_ref, user_id, subscription_id, amount_rs, status")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr || !row) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }

  if (row.status !== "pending") {
    return NextResponse.json({ error: "Request is not pending" }, { status: 409 });
  }

  const { data: sub, error: subErr } = await adminSupabase
    .from("subscriptions")
    .select("id, user_id, period_end_date, wallet_balance_rs")
    .eq("id", row.subscription_id)
    .maybeSingle();

  if (subErr || !sub || sub.user_id !== row.user_id) {
    return NextResponse.json({ error: "Invalid subscription data" }, { status: 500 });
  }

  const amount = Number(row.amount_rs);
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "Invalid amount on request" }, { status: 500 });
  }

  const note = `Top-up approved (${row.public_ref})`;

  const { data: newBalance, error: creditErr } = await adminSupabase.rpc("credit_wallet_lot", {
    p_user_id: sub.user_id,
    p_amount_rs: amount,
    p_reason: "top_up",
    p_reference_id: row.id,
    p_note: note,
    p_expires_at: expiresAtFromPeriodEnd(sub.period_end_date),
    p_source_type: "top_up",
  });

  if (creditErr) {
    console.error("[approve top-up] credit_wallet_lot", creditErr);
    return NextResponse.json({ error: creditErr.message }, { status: 400 });
  }

  const balance = Number(newBalance);
  await adminSupabase.from("subscriptions").update({ wallet_balance_rs: balance }).eq("id", sub.id);

  const { error: updErr } = await adminSupabase
    .from("wallet_topup_requests")
    .update({
      status: "approved",
      payment_reference: paymentReference,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "pending");

  if (updErr) {
    console.error("[approve top-up] request update failed after credit", updErr);
    return NextResponse.json(
      { error: "Wallet credited but failed to update request — contact engineering", wallet_balance_rs: balance },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, wallet_balance_rs: balance });
}
