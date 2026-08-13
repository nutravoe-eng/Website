import { load as loadCashfree } from "@cashfreepayments/cashfree-js";

const CONFIRM_POLL_ATTEMPTS = 4;
const CONFIRM_POLL_DELAY_MS = 1500;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type CashfreeCheckoutKind = "order" | "subscription";

export async function runCashfreeCheckout(input: {
  kind: CashfreeCheckoutKind;
  resourceId: string;
}): Promise<{ paid: boolean; error?: string }> {
  const createRes = await fetch("/api/payments/create-order", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  const createData = await createRes.json().catch(() => null);
  if (!createRes.ok) {
    return {
      paid: false,
      error: typeof createData?.error === "string" ? createData.error : "Could not start payment",
    };
  }

  const cashfree = await loadCashfree({ mode: createData.checkoutMode });
  if (!cashfree) {
    return { paid: false, error: "Payment checkout could not load. Please try again." };
  }

  const checkoutResult = await cashfree.checkout({
    paymentSessionId: createData.paymentSessionId,
    redirectTarget: "_modal",
  });

  if (checkoutResult.error) {
    return { paid: false, error: "Payment was not completed." };
  }

  for (let attempt = 0; attempt < CONFIRM_POLL_ATTEMPTS; attempt += 1) {
    if (attempt > 0) await sleep(CONFIRM_POLL_DELAY_MS);

    const confirmRes = await fetch("/api/payments/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ merchantOrderId: createData.merchantOrderId }),
    });

    const confirmData = await confirmRes.json().catch(() => null);
    if (confirmRes.ok && confirmData?.paid) {
      return { paid: true };
    }
  }

  return { paid: false, error: "Payment is still processing. Check your orders or subscriptions in a minute." };
}
