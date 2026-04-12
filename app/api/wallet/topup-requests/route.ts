import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/rate-limit";

const MIN_RS = 100;
const MAX_RS = 50_000;

function makePublicRef(): string {
  return `NV-TU-${randomBytes(4).toString("hex").toUpperCase()}`;
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const { data, error } = await supabase
    .from("wallet_topup_requests")
    .select(
      "id, public_ref, subscription_id, amount_rs, status, user_note, admin_notes, payment_reference, created_at, resolved_at",
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("[wallet-topup GET]", error);
    return NextResponse.json({ error: "Failed to load requests" }, { status: 500 });
  }

  return NextResponse.json({ requests: data ?? [] });
}

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, "wallet-topup-create", 10, 60);
  if (!limited.ok) return limited.response;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401, headers: limited.headers });
  }

  const body = await req.json().catch(() => null);
  const amount = Number(body?.amount_rs ?? body?.amount);
  const userNote = typeof body?.user_note === "string" ? body.user_note.slice(0, 500) : null;
  const subscriptionId = typeof body?.subscription_id === "string" ? body.subscription_id : null;

  if (!Number.isFinite(amount) || amount < MIN_RS || amount > MAX_RS) {
    return NextResponse.json(
      { error: `Amount must be between ₹${MIN_RS} and ₹${MAX_RS.toLocaleString("en-IN")}` },
      { status: 422, headers: limited.headers },
    );
  }

  let subId = subscriptionId;
  if (!subId) {
    const { data: sub } = await supabase
      .from("subscriptions")
      .select("id")
      .eq("user_id", user.id)
      .eq("style", "flexible")
      .eq("status", "active")
      .eq("payment_status", "paid")
      .maybeSingle();
    if (!sub) {
      return NextResponse.json(
        { error: "No active flexible subscription found" },
        { status: 400, headers: limited.headers },
      );
    }
    subId = sub.id;
  } else {
    const { data: sub } = await supabase
      .from("subscriptions")
      .select("id")
      .eq("id", subId)
      .eq("user_id", user.id)
      .eq("style", "flexible")
      .eq("status", "active")
      .eq("payment_status", "paid")
      .maybeSingle();
    if (!sub) {
      return NextResponse.json({ error: "Invalid subscription for top-up" }, { status: 400, headers: limited.headers });
    }
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    const publicRef = makePublicRef();
    const { data: row, error } = await supabase
      .from("wallet_topup_requests")
      .insert({
        public_ref: publicRef,
        user_id: user.id,
        subscription_id: subId,
        amount_rs: amount,
        user_note: userNote,
        status: "pending",
      })
      .select("id, public_ref, status, amount_rs, created_at")
      .single();

    if (!error && row) {
      return NextResponse.json(row, { headers: limited.headers });
    }

    if (error?.code === "23505") {
      if (error.message?.includes("public_ref") || error.details?.includes("public_ref")) {
        continue;
      }
      return NextResponse.json(
        {
          error:
            "You already have a pending top-up for this subscription. Wait for it to be processed or cancel it first.",
        },
        { status: 409, headers: limited.headers },
      );
    }

    console.error("[wallet-topup POST]", error);
    return NextResponse.json(
      { error: error?.message ?? "Failed to create request" },
      { status: 400, headers: limited.headers },
    );
  }

  return NextResponse.json({ error: "Could not allocate a reference. Try again." }, { status: 503, headers: limited.headers });
}
