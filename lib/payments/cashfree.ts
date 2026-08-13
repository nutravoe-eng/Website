import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { cashfreeEnv } from "@/lib/payments/env";

const API_VERSION = "2025-01-01";

export type CashfreeOrderStatus = "PAID" | "FAILED" | "ACTIVE" | "EXPIRED" | "TERMINATED";

const cashfreeOrderSchema = z.object({
  cf_order_id: z.union([z.string(), z.number()]).transform(String),
  order_id: z.string(),
  payment_session_id: z.string(),
  order_status: z.enum(["ACTIVE", "PAID", "EXPIRED", "TERMINATED", "TERMINATION_REQUESTED"]),
});

const webhookSchema = z.object({
  data: z.object({
    order: z.object({
      order_id: z.string(),
      cf_order_id: z.union([z.string(), z.number()]).optional().transform((value) =>
        value === undefined ? undefined : String(value),
      ),
      order_amount: z.number().optional(),
    }),
    payment: z.object({
      cf_payment_id: z.union([z.string(), z.number()]).optional().transform((value) =>
        value === undefined ? undefined : String(value),
      ),
      payment_status: z.string(),
    }),
  }),
});

export type CashfreeWebhookEvent = {
  merchantOrderId: string;
  providerOrderId?: string;
  providerPaymentId?: string;
  status: CashfreeOrderStatus;
  amountRs?: number;
};

function normaliseStatus(status: string): CashfreeOrderStatus {
  if (status === "PAID" || status === "SUCCESS") return "PAID";
  if (status === "EXPIRED") return "EXPIRED";
  if (status === "TERMINATED" || status === "TERMINATION_REQUESTED") return "TERMINATED";
  if (status === "ACTIVE") return "ACTIVE";
  return "FAILED";
}

function baseUrl() {
  return cashfreeEnv().CASHFREE_ENV === "PRODUCTION"
    ? "https://api.cashfree.com/pg"
    : "https://sandbox.cashfree.com/pg";
}

async function cashfreeRequest(path: string, init: RequestInit) {
  const env = cashfreeEnv();
  const response = await fetch(`${baseUrl()}${path}`, {
    ...init,
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "x-api-version": API_VERSION,
      "x-client-id": env.CASHFREE_APP_ID,
      "x-client-secret": env.CASHFREE_SECRET_KEY,
      ...init.headers,
    },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Cashfree API ${response.status}: ${await response.text()}`);
  }
  return response.json() as Promise<unknown>;
}

export async function createCashfreeOrder(input: {
  merchantOrderId: string;
  amountRs: number;
  customer: { id: string; phone: string; email?: string; name?: string };
  returnUrl: string;
  notifyUrl: string;
  note?: string;
}) {
  const response = cashfreeOrderSchema.parse(
    await cashfreeRequest("/orders", {
      method: "POST",
      headers: { "x-idempotency-key": randomUUID() },
      body: JSON.stringify({
        order_id: input.merchantOrderId,
        order_amount: Number(input.amountRs.toFixed(2)),
        order_currency: "INR",
        customer_details: {
          customer_id: input.customer.id,
          customer_phone: input.customer.phone,
          ...(input.customer.email ? { customer_email: input.customer.email } : {}),
          ...(input.customer.name ? { customer_name: input.customer.name } : {}),
        },
        order_meta: { return_url: input.returnUrl, notify_url: input.notifyUrl },
        ...(input.note ? { order_note: input.note } : {}),
      }),
    }),
  );

  return {
    merchantOrderId: response.order_id,
    providerOrderId: response.cf_order_id,
    paymentSessionId: response.payment_session_id,
    status: normaliseStatus(response.order_status),
  };
}

export async function getCashfreeOrderStatus(merchantOrderId: string) {
  const response = cashfreeOrderSchema.parse(
    await cashfreeRequest(`/orders/${encodeURIComponent(merchantOrderId)}`, { method: "GET" }),
  );
  return {
    status: normaliseStatus(response.order_status),
    providerOrderId: response.cf_order_id,
  };
}

export function verifyCashfreeWebhook(input: {
  rawBody: string;
  signature: string;
  timestamp: string;
}): CashfreeWebhookEvent {
  assertCashfreeWebhookSignature(input);
  const payload = webhookSchema.parse(JSON.parse(input.rawBody));
  return {
    merchantOrderId: payload.data.order.order_id,
    providerOrderId: payload.data.order.cf_order_id,
    providerPaymentId: payload.data.payment.cf_payment_id,
    status: normaliseStatus(payload.data.payment.payment_status),
    amountRs: payload.data.order.order_amount,
  };
}

export function assertCashfreeWebhookSignature(input: {
  rawBody: string;
  signature: string;
  timestamp: string;
  secret?: string;
}) {
  const secret = input.secret ?? cashfreeEnv().CASHFREE_SECRET_KEY;
  const expected = createHmac("sha256", secret)
    .update(`${input.timestamp}${input.rawBody}`)
    .digest("base64");
  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(input.signature);
  if (
    expectedBuffer.length !== signatureBuffer.length ||
    !timingSafeEqual(expectedBuffer, signatureBuffer)
  ) {
    throw new Error("Cashfree webhook signature is invalid");
  }
}
