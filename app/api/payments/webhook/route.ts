import { NextRequest, NextResponse } from "next/server";
import { verifyCashfreeWebhook } from "@/lib/payments/cashfree";
import { confirmCashfreePaymentFromWebhook } from "@/lib/payments/fulfill";

export const runtime = "nodejs";

export function GET() {
  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  try {
    const event = verifyCashfreeWebhook({
      rawBody,
      signature: req.headers.get("x-webhook-signature") ?? "",
      timestamp: req.headers.get("x-webhook-timestamp") ?? "",
    });

    await confirmCashfreePaymentFromWebhook(
      event.merchantOrderId,
      event.status,
      event.providerOrderId,
      event.providerPaymentId,
      event.amountRs,
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Invalid or unprocessable Cashfree webhook", err);
    return NextResponse.json({ error: "Invalid webhook" }, { status: 401 });
  }
}
