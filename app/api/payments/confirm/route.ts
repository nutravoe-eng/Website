import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { confirmCashfreePaymentForUser } from "@/lib/payments/fulfill";
import { enforceRateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const bodySchema = z.object({
  merchantOrderId: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, "payments-confirm", 20, 300);
  if (!limited.ok) return limited.response;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payment" }, { status: 400, headers: limited.headers });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401, headers: limited.headers });
  }

  try {
    const result = await confirmCashfreePaymentForUser(parsed.data.merchantOrderId, user.id);
    return NextResponse.json(
      { paid: result.paid, kind: result.kind ?? null },
      { headers: limited.headers },
    );
  } catch (err) {
    console.error("Payment confirmation failed", err);
    return NextResponse.json({ error: "Could not confirm payment" }, { status: 502, headers: limited.headers });
  }
}
