import type { SupabaseClient } from "@supabase/supabase-js";
import { adminSupabase } from "@/lib/supabase/admin";
import { getCashfreeOrderStatus } from "@/lib/payments/cashfree";
import { parseMerchantOrderId } from "@/lib/payments/merchant-id";
import { getNextDateForDayOfWeek, scheduleDeliveryDates } from "@/lib/subscription";
import { sendOrderRequestNotificationEmail } from "@/lib/request-notification-email";
import type { CashfreeOrderStatus } from "@/lib/payments/cashfree";

export type FulfillmentResult = {
  paid: boolean;
  found: boolean;
  kind?: "order" | "subscription";
};

async function generateSpreadOrders(admin: SupabaseClient, subscriptionId: string) {
  const { data: sub } = await admin
    .from("subscriptions")
    .select(`
      id,
      style,
      delivery_time_slot,
      notes,
      subscription_day_configs (*),
      subscription_plans:plan_id (price_per_bowl)
    `)
    .eq("id", subscriptionId)
    .single();

  if (!sub || sub.style !== "spread" || !Array.isArray(sub.subscription_day_configs) || sub.subscription_day_configs.length === 0) {
    return;
  }

  const unitPrice = (sub.subscription_plans as { price_per_bowl?: number } | null)?.price_per_bowl ?? 0;
  const customerNote =
    typeof sub.notes === "string" && sub.notes.trim().length > 0
      ? `Customer: ${sub.notes.trim()}`
      : null;

  const daySlugList = sub.subscription_day_configs.map((c: { day_of_week: string; delivery_time_slot: string | null }) => ({
    day: c.day_of_week,
    timeSlot: c.delivery_time_slot ?? sub.delivery_time_slot ?? null,
  }));
  const dateMap = scheduleDeliveryDates(daySlugList);

  const configsByDay: Record<string, typeof sub.subscription_day_configs> = {};
  for (const config of sub.subscription_day_configs) {
    const key = config.day_of_week;
    if (!configsByDay[key]) configsByDay[key] = [];
    configsByDay[key].push(config);
  }

  for (const [daySlug, dayConfigs] of Object.entries(configsByDay)) {
    const deliveryDate = dateMap[daySlug] ?? getNextDateForDayOfWeek(daySlug);
    const bowls = dayConfigs.map((config: {
      bowl_slug: string;
      quantity: number;
      customization_cost_rs?: number;
      customizations?: unknown;
    }) => ({
      bowl_slug: config.bowl_slug,
      bowl_name: config.bowl_slug,
      quantity: config.quantity,
      unit_price: unitPrice,
      customization_unit_price: config.customization_cost_rs ?? 0,
      customizations: config.customizations ?? [],
    }));
    const deliveryTimeSlot = dayConfigs[0].delivery_time_slot ?? sub.delivery_time_slot;

    const { data: rpcData, error: rpcError } = await admin.rpc("create_subscription_delivery", {
      p_subscription_id: subscriptionId,
      p_delivery_date: deliveryDate,
      p_delivery_time_slot: deliveryTimeSlot,
      p_bowls: bowls,
      p_status: "confirmed",
    });

    if (rpcError) {
      console.error(`Spread auto-gen failed for ${daySlug} (${deliveryDate}): ${rpcError.message}`);
      continue;
    }

    if (customerNote) {
      const orderId = Array.isArray(rpcData) ? rpcData[0]?.order_id : (rpcData as { order_id?: string })?.order_id;
      if (orderId) {
        await admin.from("orders").update({ notes: customerNote }).eq("id", orderId);
      }
    }
  }
}

async function fulfillOrderPayment(
  admin: SupabaseClient,
  orderId: string,
  paymentReference: string | null,
): Promise<boolean> {
  const { data: order } = await admin
    .from("orders")
    .select("id, user_id, payment_status, status, total, delivery_fee, subtotal, notes, delivery_date, delivery_time_slot, created_at, delivery_address_id")
    .eq("id", orderId)
    .maybeSingle();

  if (!order || order.payment_status === "paid") {
    return order?.payment_status === "paid";
  }

  const { data: updated, error } = await admin
    .from("orders")
    .update({
      payment_status: "paid",
      payment_method: "razorpay",
      payment_reference: paymentReference,
      status: order.status === "pending" ? "confirmed" : order.status,
    })
    .eq("id", orderId)
    .eq("payment_status", "pending")
    .select("id")
    .maybeSingle();

  if (error || !updated) {
    return order.payment_status === "paid";
  }

  const [{ data: customer }, { data: address }, { data: items }] = await Promise.all([
    admin.from("users").select("full_name, phone, email").eq("id", order.user_id).maybeSingle(),
    admin.from("addresses").select("line1, line2, pincode, city, state").eq("id", order.delivery_address_id).maybeSingle(),
    admin.from("order_items").select("bowl_name, bowl_slug, quantity, unit_price, total_price, customization_unit_price, customizations").eq("order_id", orderId),
  ]);

  if (customer && address && items) {
    await sendOrderRequestNotificationEmail({
      requestId: order.id,
      createdAt: order.created_at,
      customer: {
        name: customer.full_name || "Customer",
        phone: customer.phone || "NA",
        email: customer.email,
      },
      address,
      orderLabel: "Paid order",
      deliveryDate: order.delivery_date,
      deliveryTimeSlot: order.delivery_time_slot,
      subtotal: order.subtotal,
      deliveryFee: order.delivery_fee,
      total: order.total,
      items: items.map((item) => ({
        bowl_name: item.bowl_name,
        bowl_slug: item.bowl_slug,
        quantity: item.quantity,
        unit_price: item.unit_price,
        total_price: item.total_price ?? item.unit_price * item.quantity,
        customization_unit_price: item.customization_unit_price ?? 0,
        customizations: item.customizations,
      })),
      notes: order.notes,
    });
  }

  return true;
}

async function fulfillSubscriptionPayment(
  admin: SupabaseClient,
  subscriptionId: string,
  paymentReference: string | null,
): Promise<boolean> {
  const { data: sub } = await admin
    .from("subscriptions")
    .select("id, payment_status")
    .eq("id", subscriptionId)
    .maybeSingle();

  if (!sub) return false;
  if (sub.payment_status === "paid") return true;

  const { error } = await admin.rpc("approve_subscription_payment", {
    p_subscription_id: subscriptionId,
    p_payment_reference: paymentReference,
    p_admin_notes: "Paid via Cashfree",
  });

  if (error) {
    if (error.message.includes("already approved")) return true;
    throw error;
  }

  await generateSpreadOrders(admin, subscriptionId);
  return true;
}

export async function applyCashfreePaymentState(input: {
  merchantOrderId: string;
  providerStatus: CashfreeOrderStatus;
  providerOrderId?: string;
  providerPaymentId?: string;
}): Promise<FulfillmentResult> {
  const parsed = parseMerchantOrderId(input.merchantOrderId);
  if (!parsed) return { paid: false, found: false };

  if (input.providerStatus !== "PAID") {
    return { paid: false, found: true, kind: parsed.kind };
  }

  const paymentReference = input.providerPaymentId ?? input.providerOrderId ?? null;
  const admin = adminSupabase;

  if (parsed.kind === "order") {
    const paid = await fulfillOrderPayment(admin, parsed.id, paymentReference);
    return { paid, found: true, kind: "order" };
  }

  const paid = await fulfillSubscriptionPayment(admin, parsed.id, paymentReference);
  return { paid, found: true, kind: "subscription" };
}

export async function confirmCashfreePaymentForUser(
  merchantOrderId: string,
  userId: string,
): Promise<FulfillmentResult> {
  const parsed = parseMerchantOrderId(merchantOrderId);
  if (!parsed) return { paid: false, found: false };

  const admin = adminSupabase;
  if (parsed.kind === "order") {
    const { data: order } = await admin
      .from("orders")
      .select("id, user_id, payment_status")
      .eq("id", parsed.id)
      .maybeSingle();
    if (!order || order.user_id !== userId) return { paid: false, found: false };
    if (order.payment_status === "paid") return { paid: true, found: true, kind: "order" };
  } else {
    const { data: sub } = await admin
      .from("subscriptions")
      .select("id, user_id, payment_status")
      .eq("id", parsed.id)
      .maybeSingle();
    if (!sub || sub.user_id !== userId) return { paid: false, found: false };
    if (sub.payment_status === "paid") return { paid: true, found: true, kind: "subscription" };
  }

  const gatewayStatus = await getCashfreeOrderStatus(merchantOrderId);
  return applyCashfreePaymentState({
    merchantOrderId,
    providerStatus: gatewayStatus.status,
    providerOrderId: gatewayStatus.providerOrderId,
  });
}

export async function confirmCashfreePaymentFromWebhook(
  merchantOrderId: string,
  providerStatus: CashfreeOrderStatus,
  providerOrderId?: string,
  providerPaymentId?: string,
  expectedAmountRs?: number,
): Promise<FulfillmentResult> {
  const parsed = parseMerchantOrderId(merchantOrderId);
  if (!parsed) return { paid: false, found: false };

  const admin = adminSupabase;
  if (expectedAmountRs !== undefined) {
    if (parsed.kind === "order") {
      const { data: order } = await admin.from("orders").select("total").eq("id", parsed.id).maybeSingle();
      if (!order || Number(order.total) !== expectedAmountRs) {
        throw new Error("Cashfree webhook amount does not match order total");
      }
    } else {
      const { data: sub } = await admin.from("subscriptions").select("total_amount_rs").eq("id", parsed.id).maybeSingle();
      if (!sub || Number(sub.total_amount_rs) !== expectedAmountRs) {
        throw new Error("Cashfree webhook amount does not match subscription total");
      }
    }
  }

  return applyCashfreePaymentState({
    merchantOrderId,
    providerStatus,
    providerOrderId,
    providerPaymentId,
  });
}
