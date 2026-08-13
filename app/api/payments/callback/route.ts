import { NextRequest, NextResponse } from "next/server";
import { confirmCashfreePaymentForUser } from "@/lib/payments/fulfill";
import { parseMerchantOrderId } from "@/lib/payments/merchant-id";
import { enforceRateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const limited = await enforceRateLimit(req, "payments-callback", 20, 300);
  if (!limited.ok) return limited.response;

  const url = new URL(req.url);
  const merchantOrderId = url.searchParams.get("merchantOrderId");
  if (!merchantOrderId) {
    return NextResponse.redirect(`${url.origin}/confirmation?paid=0`);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(`${url.origin}/signin?next=${encodeURIComponent(url.pathname + url.search)}`);
  }

  try {
    const result = await confirmCashfreePaymentForUser(merchantOrderId, user.id);
    const parsed = parseMerchantOrderId(merchantOrderId);
    if (result.paid && parsed?.kind === "subscription") {
      return NextResponse.redirect(`${url.origin}/subscribe?paid=1`);
    }
    if (result.paid && parsed?.kind === "order") {
      return NextResponse.redirect(`${url.origin}/confirmation?source=online`);
    }
    return NextResponse.redirect(`${url.origin}/confirmation?paid=0`);
  } catch (err) {
    console.error("Payment callback confirmation failed", err);
    return NextResponse.redirect(`${url.origin}/confirmation?paid=0`);
  }
}
