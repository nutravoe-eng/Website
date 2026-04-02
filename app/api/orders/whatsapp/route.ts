import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminSupabase } from "@/lib/supabase/admin";
import { buildAuthoritativeOrder, type CheckoutItemInput } from "@/lib/checkout-security";
import { enforceRateLimit } from "@/lib/rate-limit";

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

  if (selectedSlot.length > 64 || !/^[\w\s\-–:.]+$/.test(selectedSlot)) {
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

  const { data: activeSubscription } = await adminSupabase
    .from("subscriptions")
    .select("subscription_plans ( slug )")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let quote;
  try {
    const relatedPlans = activeSubscription?.subscription_plans as Array<{ slug?: string }> | undefined;
    const activePlanSlug = relatedPlans?.[0]?.slug ?? null;
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
