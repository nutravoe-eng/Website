import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminSupabase } from "@/lib/supabase/admin";
import { buildAuthoritativeOrder, type CheckoutItemInput } from "@/lib/checkout-security";
import { enforceRateLimit } from "@/lib/rate-limit";
import {
  isPaidFlexibleWalletEligible,
  planSlugForCheckoutPricing,
  preferActiveSubscription,
} from "@/lib/flexible-subscription";
import { resolveRequestedDelivery } from "@/lib/order-delivery";
import { BENGALURU_NOT_SERVICEABLE_MESSAGE, isBengaluruServiceableAddress } from "@/lib/serviceability";
import { sendOrderRequestNotificationEmail } from "@/lib/request-notification-email";

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, "order-request-create", 10, 60);
  if (!limited.ok) return limited.response;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401, headers: limited.headers });
  }

  const body = await req.json().catch(() => null);
  const selectedSlot = typeof body?.selectedSlot === "string" ? body.selectedSlot.trim() : "";
  const addressId = typeof body?.addressId === "string" ? body.addressId.trim() : "";
  const deliveryMode = body?.deliveryMode;
  const incomingItems: unknown[] = Array.isArray(body?.items) ? body.items : [];
  const rawNotes = typeof body?.notes === "string" ? body.notes.trim() : null;
  const awaitOnlinePayment = body?.awaitOnlinePayment === true;
  if (rawNotes && rawNotes.length > 300) {
    return NextResponse.json({ error: "Notes must be 300 characters or fewer" }, { status: 422, headers: limited.headers });
  }
  const notes = rawNotes || null;

  if (!incomingItems.length) {
    return NextResponse.json({ error: "At least one item is required" }, { status: 400, headers: limited.headers });
  }

  const items: CheckoutItemInput[] = incomingItems.map((raw: unknown) => {
    const item = raw as Record<string, unknown>;
    return {
      bowlSlug: typeof item?.bowlSlug === "string" ? item.bowlSlug : "",
      quantity: Number.isFinite(item?.quantity) ? Number(item.quantity) : 0,
      customizations: Array.isArray(item?.customizations) ? (item.customizations as CheckoutItemInput["customizations"]) : [],
      presetOptions:
        item?.presetOptions && typeof item.presetOptions === "object"
          ? (item.presetOptions as CheckoutItemInput["presetOptions"])
          : undefined,
    };
  });

  if (items.some((item) => !item.bowlSlug || item.quantity <= 0)) {
    return NextResponse.json({ error: "Invalid order items" }, { status: 400, headers: limited.headers });
  }

  const addressQuery = adminSupabase
    .from("addresses")
    .select("id, line1, line2, pincode, city, state, lat, lng, distance_km, distance_source")
    .eq("user_id", user.id);

  const { data: resolvedAddress, error: resolvedAddressError } = await (addressId
    ? addressQuery.eq("id", addressId)
    : addressQuery.order("is_default", { ascending: false }).limit(1))
    .maybeSingle();

  if (resolvedAddressError || !resolvedAddress) {
    return NextResponse.json({ error: "A delivery address is required before ordering" }, { status: 400, headers: limited.headers });
  }
  if (!isBengaluruServiceableAddress(resolvedAddress)) {
    return NextResponse.json({ error: BENGALURU_NOT_SERVICEABLE_MESSAGE }, { status: 422, headers: limited.headers });
  }

  const { data: customer, error: customerError } = await adminSupabase
    .from("users")
    .select("full_name, phone, email")
    .eq("id", user.id)
    .maybeSingle();

  if (customerError || !customer) {
    return NextResponse.json({ error: "Unable to load customer profile" }, { status: 500, headers: limited.headers });
  }

  const { data: subRows } = await adminSupabase
    .from("subscriptions")
    .select(
      "id, status, style, billing_cycle, start_date, period_end_date, payment_status, created_at, subscription_plans ( slug, min_bowls )",
    )
    .eq("user_id", user.id)
    .eq("payment_status", "paid")
    .order("created_at", { ascending: false });

  const pricedCandidates = (subRows ?? []).filter(
    (s) =>
      s.status === "active" ||
      (s.style === "flexible" &&
        isPaidFlexibleWalletEligible({
          style: s.style,
          status: s.status,
          payment_status: s.payment_status,
          period_end_date: s.period_end_date,
        })),
  );
  const pricedSub = preferActiveSubscription(pricedCandidates);

  let quote;
  try {
    const activePlanSlug = await planSlugForCheckoutPricing(adminSupabase, pricedSub ?? undefined);
    quote = await buildAuthoritativeOrder(items, resolvedAddress, activePlanSlug);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unable to price this order";
    return NextResponse.json({ error: message }, { status: 400, headers: limited.headers });
  }

  let resolvedDelivery;
  try {
    resolvedDelivery = await resolveRequestedDelivery(deliveryMode, selectedSlot);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid delivery selection";
    return NextResponse.json({ error: message }, { status: 400, headers: limited.headers });
  }

  const { data: order, error: orderError } = await adminSupabase
    .from("orders")
    .insert({
      user_id: user.id,
      order_type: "one_time",
      status: "pending",
      delivery_date: resolvedDelivery.deliveryDate,
      delivery_time_slot: resolvedDelivery.selectedSlot,
      delivery_address_id: resolvedAddress.id,
      delivery_fee: quote.deliveryFee,
      subtotal: quote.subtotal,
      total: quote.total,
      payment_method: awaitOnlinePayment ? "razorpay" : "whatsapp_cod",
      payment_status: "pending",
      notes,
    })
    .select("id, created_at")
    .single();

  if (orderError || !order) {
    return NextResponse.json({ error: "Failed to create order" }, { status: 500, headers: limited.headers });
  }

  const { error: itemsError } = await adminSupabase
    .from("order_items")
    .insert(quote.lineItems.map((item) => ({ order_id: order.id, ...item })));

  if (itemsError) {
    await adminSupabase.from("orders").delete().eq("id", order.id);
    return NextResponse.json({ error: "Failed to save order items" }, { status: 500, headers: limited.headers });
  }

  if (!awaitOnlinePayment) {
    await sendOrderRequestNotificationEmail({
    requestId: order.id,
    createdAt: order.created_at,
    customer: {
      name: customer.full_name || user.user_metadata?.full_name || user.email?.split("@")[0] || "Customer",
      phone: customer.phone || user.user_metadata?.phone || "NA",
      email: customer.email || user.email,
    },
    address: resolvedAddress,
    orderLabel: "Order request",
    deliveryDate: resolvedDelivery.deliveryDate,
    deliveryTimeSlot: resolvedDelivery.selectedSlot,
    subtotal: quote.subtotal,
    deliveryFee: quote.deliveryFee,
    total: quote.total,
    items: quote.lineItems,
    notes,
  });
  }

  return NextResponse.json({ id: order.id, subtotal: quote.subtotal, total: quote.total }, { headers: limited.headers });
}
