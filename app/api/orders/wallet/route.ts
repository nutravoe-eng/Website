import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminSupabase } from "@/lib/supabase/admin";
import { buildAuthoritativeOrder, type CheckoutItemInput } from "@/lib/checkout-security";
import { enforceRateLimit } from "@/lib/rate-limit";

function getDeliveryDateFromSlot(slot: string): string {
  const normalized = slot.trim();
  const nowIST = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  if (/^tomorrow\b/i.test(normalized)) {
    nowIST.setDate(nowIST.getDate() + 1);
  }
  const y = nowIST.getFullYear();
  const m = String(nowIST.getMonth() + 1).padStart(2, "0");
  const d = String(nowIST.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

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
  const incomingItems: unknown[] = Array.isArray(body?.items) ? body.items : [];

  if (!selectedSlot) {
    return NextResponse.json({ error: "Delivery slot is required" }, { status: 400, headers: limited.headers });
  }
  if (selectedSlot.length > 64 || !/^[\w\s\-–:.,]+$/.test(selectedSlot)) {
    return NextResponse.json({ error: "Invalid delivery slot" }, { status: 400, headers: limited.headers });
  }
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
    };
  });

  if (items.some((item) => !item.bowlSlug || item.quantity <= 0)) {
    return NextResponse.json({ error: "Invalid order items" }, { status: 400, headers: limited.headers });
  }

  // Require an active, paid subscription
  const { data: subscription, error: subscriptionError } = await adminSupabase
    .from("subscriptions")
    .select("id, billing_cycle, start_date, period_end_date, subscription_plans ( slug, min_bowls )")
    .eq("user_id", user.id)
    .eq("status", "active")
    .eq("payment_status", "paid")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (subscriptionError) {
    console.error("[wallet-order] subscription fetch failed", subscriptionError.message);
    return NextResponse.json({ error: "Failed to verify subscription" }, { status: 500, headers: limited.headers });
  }

  if (!subscription) {
    return NextResponse.json(
      { error: "An active subscription with wallet funds is required to pay from wallet" },
      { status: 400, headers: limited.headers }
    );
  }

  // Get delivery address
  const { data: address, error: addressError } = await adminSupabase
    .from("addresses")
    .select("id, pincode, lat, lng")
    .eq("user_id", user.id)
    .order("is_default", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (addressError || !address) {
    return NextResponse.json(
      { error: "A delivery address is required before ordering" },
      { status: 400, headers: limited.headers }
    );
  }

  // Calculate current cycle usage to determine if we use sub price or retail price
  let isOverQuota = false;
  const planLimit = Number((subscription.subscription_plans as { min_bowls?: number } | null)?.min_bowls ?? 0);

  if (planLimit > 0) {
    // Determine period bounds: prefer period_end_date if set, otherwise derive from start_date
    const isWeekly = subscription.billing_cycle !== 'monthly';
    const cycleDays = isWeekly ? 7 : 30;
    let periodEndStr = (subscription.period_end_date as string) || "";
    let periodStartStr: string;

    if (periodEndStr) {
      const periodEndDate = new Date(periodEndStr);
      const periodStartDate = new Date(periodEndDate.getTime() - cycleDays * 24 * 60 * 60 * 1000);
      periodStartStr = periodStartDate.toISOString().split('T')[0];
    } else {
      // Fallback: count all orders ever placed on this subscription (conservative — always enforce quota)
      periodStartStr = (subscription.start_date as string) || "2000-01-01";
      periodEndStr = new Date(Date.now() + cycleDays * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    }

    const { data: orderedData } = await adminSupabase
      .from("orders")
      .select("id, order_items ( quantity )")
      .eq("subscription_id", subscription.id)
      .in("status", ["confirmed", "delivered"])
      .gte("delivery_date", periodStartStr)
      .lte("delivery_date", periodEndStr);

    const alreadyOrderedCount = (orderedData ?? []).reduce((acc, order: any) => {
      const items = Array.isArray(order.order_items) ? order.order_items : [];
      return acc + items.reduce((sum: number, item: any) => sum + (item?.quantity ?? 0), 0);
    }, 0);

    isOverQuota = alreadyOrderedCount >= planLimit;
  }

  // Build authoritative pricing
  let quote;
  try {
    const plan = subscription.subscription_plans as { slug?: string } | null;
    // If over quota, pass null for plan slug to use standard retail pricing
    quote = await buildAuthoritativeOrder(items, address, isOverQuota ? null : (plan?.slug ?? null));
  } catch {
    return NextResponse.json({ error: "Unable to price this order" }, { status: 400, headers: limited.headers });
  }

  // Balance check is done inside consume_wallet_balance (refreshes from credit lots first).

  // Create order (confirmed + paid immediately)
  const deliveryDate = getDeliveryDateFromSlot(selectedSlot);
  const { data: order, error: orderError } = await adminSupabase
    .from("orders")
    .insert({
      user_id: user.id,
      subscription_id: subscription.id,
      order_type: "subscription",
      status: "confirmed",
      delivery_date: deliveryDate,
      delivery_time_slot: selectedSlot,
      delivery_address_id: address.id,
      delivery_fee: quote.deliveryFee,
      subtotal: quote.subtotal,
      total: quote.total,
      payment_method: "wallet",
      payment_status: "paid",
    })
    .select("id")
    .single();

  if (orderError) {
    // Unique constraint violation = already ordered for this date on this subscription
    if (orderError.code === "23505") {
      return NextResponse.json(
        { error: "You already have a wallet order for this delivery date" },
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
    p_note: `Self-served order on ${deliveryDate}, ${selectedSlot}`,
  });

  if (walletError) {
    await adminSupabase.from("order_items").delete().eq("order_id", order.id);
    await adminSupabase.from("orders").delete().eq("id", order.id);
    return NextResponse.json(
      { error: walletError.message.includes("insufficient") ? "Insufficient wallet balance" : "Failed to debit wallet. Please try again." },
      { status: 400, headers: limited.headers }
    );
  }

  return NextResponse.json(
    { id: order.id, subtotal: quote.subtotal, total: quote.total },
    { headers: limited.headers }
  );
}
