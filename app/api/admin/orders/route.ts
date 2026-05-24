import { NextRequest, NextResponse } from 'next/server';
import { verifyAdmin } from '@/lib/admin-auth';
import { adminSupabase } from '@/lib/supabase/admin';
import { getTodayIstYmd } from '@/lib/datetime-ist';

export async function GET(req: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const date = searchParams.get('date');           // 'today' | 'YYYY-MM-DD'
  const paymentStatus = searchParams.get('payment_status');
  const orderStatus = searchParams.get('status');

  let query = adminSupabase
    .from('orders')
    .select(`
      id, subscription_id, order_type, status, payment_status, payment_method, payment_reference,
      delivery_date, delivery_time_slot, delivery_fee,
      subtotal, total, notes, admin_notes, created_at,
      subscriptions ( style ),
      users!inner ( id, full_name, phone, email ),
      addresses ( id, line1, line2, city, pincode, lat, lng ),
      order_items ( id, bowl_slug, bowl_name, quantity, unit_price, total_price, customizations )
    `)
    .order('delivery_date', { ascending: false })
    .order('created_at', { ascending: false });

  if (date === 'today') {
    const today = getTodayIstYmd();
    query = query.eq('delivery_date', today);
  } else if (date) {
    query = query.eq('delivery_date', date);
  }

  if (paymentStatus) query = query.eq('payment_status', paymentStatus);
  if (orderStatus)   query = query.eq('status', orderStatus);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const orders = data ?? [];
  const needFallback = orders.some((order) =>
    order.order_type === "subscription" &&
    order.subscription_id &&
    Array.isArray(order.order_items) &&
    order.order_items.some((item) => item?.customizations == null)
  );

  if (!needFallback) {
    return NextResponse.json({ orders });
  }

  const subscriptionIds = Array.from(
    new Set(
      orders
        .filter((order) => order.order_type === "subscription" && typeof order.subscription_id === "string")
        .map((order) => order.subscription_id as string),
    ),
  );

  const { data: configRows } = await adminSupabase
    .from("subscription_day_configs")
    .select("subscription_id, day_of_week, bowl_slug, customizations")
    .in("subscription_id", subscriptionIds);

  const configMap = new Map<string, { customizations: unknown }[]>();
  for (const row of configRows ?? []) {
    const key = `${row.subscription_id}|${row.day_of_week}|${row.bowl_slug}`;
    const bucket = configMap.get(key) ?? [];
    bucket.push({ customizations: row.customizations });
    configMap.set(key, bucket);
  }

  const daySlugByIndex = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  const enriched = orders.map((order) => {
    if (order.order_type !== "subscription" || !order.subscription_id || !Array.isArray(order.order_items)) {
      return order;
    }
    const dayIdx = new Date(`${order.delivery_date}T12:00:00`).getDay();
    const daySlug = daySlugByIndex[dayIdx] ?? "mon";
    const usageCountByBowl = new Map<string, number>();

    const order_items = order.order_items.map((item) => {
      if (item?.customizations != null || !item?.bowl_slug) return item;
      const key = `${order.subscription_id}|${daySlug}|${item.bowl_slug}`;
      const bucket = configMap.get(key) ?? [];
      const idx = usageCountByBowl.get(item.bowl_slug) ?? 0;
      usageCountByBowl.set(item.bowl_slug, idx + 1);
      const fallback = bucket[idx] ?? bucket[0];
      if (!fallback?.customizations) return item;
      return { ...item, customizations: fallback.customizations };
    });

    return { ...order, order_items };
  });

  return NextResponse.json({ orders: enriched });
}
