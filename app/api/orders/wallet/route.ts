import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminSupabase } from "@/lib/supabase/admin";
import { buildAuthoritativeOrder, type CheckoutItemInput } from "@/lib/checkout-security";
import { enforceRateLimit } from "@/lib/rate-limit";
import { requestOriginReferrer } from "@/lib/ola-maps";
import {
  isPaidFlexibleWalletEligible,
  planSlugForCheckoutPricing,
  preferActiveSubscription,
} from "@/lib/flexible-subscription";
import { resolveRequestedDelivery } from "@/lib/order-delivery";
import { BENGALURU_NOT_SERVICEABLE_MESSAGE, isBengaluruServiceableAddress } from "@/lib/serviceability";
import { sendOrderRequestNotificationEmail } from "@/lib/request-notification-email";

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, "wallet-order-create", 10, 60);
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
      customizations: Array.isArray(item?.customizations)
        ? (item.customizations as CheckoutItemInput["customizations"])
        : [],
      presetOptions:
        item?.presetOptions && typeof item.presetOptions === "object"
          ? (item.presetOptions as CheckoutItemInput["presetOptions"])
          : undefined,
    };
  });

  if (items.some((item) => !item.bowlSlug || item.quantity <= 0)) {
    return NextResponse.json({ error: "Invalid order items" }, { status: 400, headers: limited.headers });
  }

  const todayIst = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

  const { data: subRows, error: subscriptionError } = await adminSupabase
    .from("subscriptions")
    .select(
      "id, billing_cycle, start_date, period_end_date, status, created_at, style, payment_status, subscription_plans ( slug, min_bowls )",
    )
    .eq("user_id", user.id)
    .eq("style", "flexible")
    .eq("payment_status", "paid")
    .or(`status.eq.active,and(status.eq.completed,period_end_date.gte.${todayIst})`)
    .order("created_at", { ascending: false });

  if (subscriptionError) {
    console.error("[wallet-order] subscription fetch failed", subscriptionError.message);
    return NextResponse.json({ error: "Failed to verify subscription" }, { status: 500, headers: limited.headers });
  }

  const eligible = (subRows ?? []).filter((r) =>
    isPaidFlexibleWalletEligible({
      style: r.style as string,
      status: r.status as string,
      payment_status: r.payment_status as string,
      period_end_date: r.period_end_date as string | null,
    }),
  );

  const subscription = preferActiveSubscription(eligible);

  if (!subscription) {
    return NextResponse.json(
      { error: "An active subscription with wallet funds is required to pay from wallet" },
      { status: 400, headers: limited.headers }
    );
  }

  // Get delivery address
  const addressQuery = adminSupabase
    .from("addresses")
    .select("id, line1, line2, pincode, city, state, lat, lng, distance_km, distance_source")
    .eq("user_id", user.id);

  const { data: address, error: addressError } = await (addressId
    ? addressQuery.eq("id", addressId)
    : addressQuery.order("is_default", { ascending: false }).limit(1))
    .maybeSingle();

  if (addressError || !address) {
    return NextResponse.json(
      { error: "A delivery address is required before ordering" },
      { status: 400, headers: limited.headers }
    );
  }
  if (!isBengaluruServiceableAddress(address)) {
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

  // Build authoritative pricing (same flexible quota / completed rules as request checkout)
  let quote;
  try {
    const planSlug = await planSlugForCheckoutPricing(adminSupabase, subscription);
    quote = await buildAuthoritativeOrder(items, address, planSlug, {
      httpReferrer: requestOriginReferrer(req),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unable to price this order";
    return NextResponse.json({ error: message }, { status: 400, headers: limited.headers });
  }

  // Balance check is done inside consume_wallet_balance (refreshes from credit lots first).

  // Create order (confirmed + paid immediately)
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
      subscription_id: subscription.id,
      order_type: "subscription",
      status: "confirmed",
      delivery_date: resolvedDelivery.deliveryDate,
      delivery_time_slot: resolvedDelivery.selectedSlot,
      delivery_address_id: address.id,
      delivery_fee: quote.deliveryFee,
      subtotal: quote.subtotal,
      total: quote.total,
      payment_method: "wallet",
      payment_status: "paid",
      notes,
    })
    .select("id, created_at")
    .single();

  if (orderError) {
    // Unique constraint violation = already ordered for this date on this subscription
    if (orderError.code === "23505") {
      return NextResponse.json(
        { error: "You already have a wallet order for this delivery slot. Choose a different time slot." },
        { status: 409, headers: limited.headers }
      );
    }
    return NextResponse.json({ error: "Failed to create order" }, { status: 500, headers: limited.headers });
  }

  // Insert order items
  const { error: itemsError } = await adminSupabase
    .from("order_items")
    .insert(quote.lineItems.map((item) => ({ order_id: order.id, ...item })));

  if (itemsError) {
    await adminSupabase.from("orders").delete().eq("id", order.id);
    return NextResponse.json({ error: "Failed to save order items" }, { status: 500, headers: limited.headers });
  }

  // Debit wallet — rollback order if this fails
  const { error: walletError } = await adminSupabase.rpc("consume_wallet_balance", {
    p_user_id: user.id,
    p_amount_rs: quote.total,
    p_reason: "order_payment",
    p_reference_id: order.id,
    p_note: `Self-served order on ${resolvedDelivery.deliveryDate}, ${resolvedDelivery.selectedSlot}`,
  });

  if (walletError) {
    await adminSupabase.from("order_items").delete().eq("order_id", order.id);
    await adminSupabase.from("orders").delete().eq("id", order.id);
    return NextResponse.json(
      { error: walletError.message.includes("insufficient") ? "Insufficient wallet balance" : "Failed to debit wallet. Please try again." },
      { status: 400, headers: limited.headers }
    );
  }

  const { error: completeErr } = await adminSupabase.rpc("maybe_complete_flexible_subscription", {
    p_subscription_id: subscription.id,
  });
  if (completeErr) {
    console.error("[wallet-order] maybe_complete_flexible_subscription", completeErr.message);
  }

  await sendOrderRequestNotificationEmail({
    requestId: order.id,
    createdAt: order.created_at,
    customer: {
      name: customer.full_name || user.user_metadata?.full_name || user.email?.split("@")[0] || "Customer",
      phone: customer.phone || user.user_metadata?.phone || "NA",
      email: customer.email || user.email,
    },
    address,
    orderLabel: "Wallet order",
    deliveryDate: resolvedDelivery.deliveryDate,
    deliveryTimeSlot: resolvedDelivery.selectedSlot,
    subtotal: quote.subtotal,
    deliveryFee: quote.deliveryFee,
    total: quote.total,
    items: quote.lineItems,
    notes,
  });

  return NextResponse.json(
    { id: order.id, subtotal: quote.subtotal, total: quote.total },
    { headers: limited.headers }
  );
}
