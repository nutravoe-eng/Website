import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createCashfreeOrder } from "@/lib/payments/cashfree";
import { cashfreeCheckoutMode } from "@/lib/payments/env";
import { toMerchantOrderId } from "@/lib/payments/merchant-id";
import { enforceRateLimit } from "@/lib/rate-limit";
import { adminSupabase } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const bodySchema = z.object({
  kind: z.enum(["order", "subscription"]),
  resourceId: z.string().uuid(),
});

function normalizePhone10(raw: string | null | undefined) {
  const phone10 = (raw ?? "").replace(/\D/g, "").slice(-10);
  return /^[6-9]\d{9}$/.test(phone10) ? phone10 : null;
}

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, "payments-create-order", 10, 3600);
  if (!limited.ok) return limited.response;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401, headers: limited.headers });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payment request" }, { status: 400, headers: limited.headers });
  }

  const { kind, resourceId } = parsed.data;

  const { data: profile } = await adminSupabase
    .from("users")
    .select("full_name, phone, email")
    .eq("id", user.id)
    .maybeSingle();

  const phone10 = normalizePhone10(profile?.phone ?? user.user_metadata?.phone);
  if (!phone10) {
    return NextResponse.json(
      { error: "Add a valid Indian mobile number to your account before paying online." },
      { status: 400, headers: limited.headers },
    );
  }

  let amountRs = 0;
  let note = "";

  if (kind === "order") {
    const { data: order } = await adminSupabase
      .from("orders")
      .select("id, user_id, total, payment_status")
      .eq("id", resourceId)
      .maybeSingle();

    if (!order || order.user_id !== user.id) {
      return NextResponse.json({ error: "Order not found" }, { status: 404, headers: limited.headers });
    }
    if (order.payment_status === "paid") {
      return NextResponse.json({ error: "This order is already paid" }, { status: 409, headers: limited.headers });
    }
    amountRs = Number(order.total);
    note = "Nutravoe cart order";
  } else {
    const { data: subscription } = await adminSupabase
      .from("subscriptions")
      .select("id, user_id, total_amount_rs, payment_status")
      .eq("id", resourceId)
      .maybeSingle();

    if (!subscription || subscription.user_id !== user.id) {
      return NextResponse.json({ error: "Subscription not found" }, { status: 404, headers: limited.headers });
    }
    if (subscription.payment_status === "paid") {
      return NextResponse.json({ error: "This subscription is already paid" }, { status: 409, headers: limited.headers });
    }
    amountRs = Number(subscription.total_amount_rs);
    note = "Nutravoe subscription";
  }

  if (!Number.isFinite(amountRs) || amountRs <= 0) {
    return NextResponse.json({ error: "Invalid payable amount" }, { status: 400, headers: limited.headers });
  }

  const merchantOrderId = toMerchantOrderId(kind, resourceId);
  const origin = new URL(req.url).origin;

  try {
    const order = await createCashfreeOrder({
      merchantOrderId,
      amountRs,
      customer: {
        id: user.id,
        phone: phone10,
        ...(profile?.email ? { email: profile.email } : user.email ? { email: user.email } : {}),
        ...(profile?.full_name ? { name: profile.full_name } : {}),
      },
      returnUrl: `${origin}/api/payments/callback?merchantOrderId=${encodeURIComponent(merchantOrderId)}`,
      notifyUrl: `${origin}/api/payments/webhook`,
      note,
    });

    return NextResponse.json(
      {
        merchantOrderId,
        paymentSessionId: order.paymentSessionId,
        checkoutMode: cashfreeCheckoutMode(),
      },
      { headers: limited.headers },
    );
  } catch (err) {
    console.error("Cashfree order creation failed", err);
    return NextResponse.json({ error: "Could not start payment" }, { status: 502, headers: limited.headers });
  }
}
