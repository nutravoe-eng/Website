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

function getDeliveryDateFromSlot(slot: string): string {
  const normalized = slot.trim();
  // Use IST (UTC+5:30) so orders placed between midnight–5:30 AM IST get the correct local date
  const nowIST = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  if (/^tomorrow\b/i.test(normalized)) {
    nowIST.setDate(nowIST.getDate() + 1);
  }
  const y = nowIST.getFullYear();
  const m = String(nowIST.getMonth() + 1).padStart(2, '0');
  const d = String(nowIST.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, "whatsapp-order-create", 10, 60);
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
      customizations: Array.isArray(item?.customizations) ? (item.customizations as CheckoutItemInput['customizations']) : [],
    };
  });

  if (items.some((item) => !item.bowlSlug || item.quantity <= 0)) {
    return NextResponse.json({ error: "Invalid order items" }, { status: 400, headers: limited.headers });
  }

  const { data: address, error: addressError } = await adminSupabase
    .from("addresses")
    .select("id, pincode, lat, lng")
    .eq("user_id", user.id)
    .order("is_default", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (addressError || !address) {
    return NextResponse.json({ error: "A delivery address is required before ordering" }, { status: 400, headers: limited.headers });
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
    quote = await buildAuthoritativeOrder(items, address, activePlanSlug);
  } catch {
    return NextResponse.json({ error: "Unable to price this order" }, { status: 400, headers: limited.headers });
  }

  const deliveryDate = getDeliveryDateFromSlot(selectedSlot);
  const { data: order, error: orderError } = await adminSupabase
    .from("orders")
    .insert({
      user_id: user.id,
      order_type: "one_time",
      status: "pending",
      delivery_date: deliveryDate,
      delivery_time_slot: selectedSlot,
      delivery_address_id: address.id,
      delivery_fee: quote.deliveryFee,
      subtotal: quote.subtotal,
      total: quote.total,
      payment_method: "whatsapp_cod",
      payment_status: "pending",
    })
    .select("id")
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

  return NextResponse.json({ id: order.id, subtotal: quote.subtotal, total: quote.total }, { headers: limited.headers });
}
