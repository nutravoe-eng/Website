import { NextRequest, NextResponse } from 'next/server';
import { verifyAdmin } from '@/lib/admin-auth';
import { adminSupabase } from '@/lib/supabase/admin';
import { getSubscriptionPlans } from '@/lib/sanity';

const LIVE_ORDER_STATUSES = ['pending', 'confirmed', 'out_for_delivery', 'delivered'] as const;

type OrderItemRow = {
  id: string;
  bowl_slug: string;
  bowl_name: string | null;
  quantity: number;
  customizations: unknown;
};

type SubscriptionOrderRow = {
  id: string;
  subscription_id: string;
  delivery_date: string;
  delivery_time_slot: string | null;
  status: string;
  order_items: OrderItemRow[] | null;
};

function inPeriod(
  deliveryDate: string,
  startDate: string | null | undefined,
  periodEnd: string | null | undefined,
): boolean {
  if (startDate && deliveryDate < startDate) return false;
  void periodEnd; // Intentionally ignored: admin reschedules can validly go beyond cycle end.
  return true;
}

export async function GET(req: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const paymentStatus = searchParams.get('payment_status');
  const status        = searchParams.get('status') ?? 'active';

  let query = adminSupabase
    .from('subscriptions')
    .select(`
      id, style, status, start_date, period_end_date,
      delivery_time_slot,
      delivery_fee,
      total_amount_rs, payment_status, payment_reference, admin_notes,
      notes, created_at,
      users!inner ( id, full_name, phone, email ),
      subscription_plans ( id, name, slug, price_per_bowl ),
      addresses ( id, line1, line2, city, pincode, lat, lng ),
      subscription_day_configs ( id, day_of_week, bowl_slug, quantity, delivery_time_slot, customizations, customization_cost_rs )
    `)
    .order('created_at', { ascending: false });

  if (status)        query = query.eq('status', status);
  if (paymentStatus) query = query.eq('payment_status', paymentStatus);

  const [{ data, error }, sanityPlans] = await Promise.all([
    query,
    getSubscriptionPlans().catch(() => []),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const standardPriceBySlug = new Map(
    sanityPlans.map(p => [p.slug, p.pricePerBowl ?? null])
  );
  const premiumPriceBySlug = new Map(
    sanityPlans.map(p => [p.slug, p.pricePerBowlPremium ?? null])
  );

  // Attach delivery count per subscription
  const subIds = (data ?? []).map((s: { id: string }) => s.id);
  let deliveryCounts: Record<string, number> = {};

  let ordersBySubscription = new Map<string, SubscriptionOrderRow[]>();
  if (subIds.length > 0) {
    const { data: orders } = await adminSupabase
      .from('orders')
      .select('subscription_id')
      .in('subscription_id', subIds)
      .eq('status', 'delivered');

    (orders ?? []).forEach((o: { subscription_id: string }) => {
      deliveryCounts[o.subscription_id] = (deliveryCounts[o.subscription_id] ?? 0) + 1;
    });

    const { data: scheduleRows, error: scheduleErr } = await adminSupabase
      .from('orders')
      .select(`
        id,
        subscription_id,
        delivery_date,
        delivery_time_slot,
        status,
        order_items ( id, bowl_slug, bowl_name, quantity, customizations )
      `)
      .in('subscription_id', subIds)
      .in('status', [...LIVE_ORDER_STATUSES])
      .order('delivery_date', { ascending: true })
      .order('id', { ascending: true });

    if (scheduleErr) {
      console.error('[admin/subscriptions] schedule order query failed', scheduleErr.message);
    } else if (Array.isArray(scheduleRows)) {
      for (const row of scheduleRows as SubscriptionOrderRow[]) {
        const sid = row.subscription_id;
        const list = ordersBySubscription.get(sid) ?? [];
        list.push(row);
        ordersBySubscription.set(sid, list);
      }
    }
  }

  const enriched = (data ?? []).map((s: Record<string, unknown>) => {
    const plan = s.subscription_plans as { slug?: string; price_per_bowl?: number } | null;
    const subId = s.id as string;
    const startDate = s.start_date as string | null | undefined;
    const periodEnd = s.period_end_date as string | null | undefined;
    const allOrders = [...(ordersBySubscription.get(subId) ?? [])].sort(
      (a, b) => a.delivery_date.localeCompare(b.delivery_date) || a.id.localeCompare(b.id),
    );
    const periodOrders = allOrders.filter((o) => inPeriod(o.delivery_date, startDate ?? undefined, periodEnd ?? undefined));
    const scheduleSource = periodOrders.length > 0 ? periodOrders : allOrders;

    let first_scheduled_delivery_date: string | null = null;
    if (scheduleSource.length > 0) {
      first_scheduled_delivery_date = scheduleSource.reduce(
        (min, o) => (o.delivery_date < min ? o.delivery_date : min),
        scheduleSource[0].delivery_date,
      );
    }

    return {
      ...s,
      deliveries_completed: deliveryCounts[subId] ?? 0,
      /** First calendar delivery in the current cycle (from live orders), for display instead of subscription.start_date when set. */
      first_scheduled_delivery_date,
      /** Current-reality schedule from orders (same period window as cycle), sorted by date. */
      subscription_delivery_schedule: scheduleSource,
      subscription_plans: plan
        ? {
            ...plan,
            price_per_bowl: standardPriceBySlug.get(plan.slug ?? '') ?? plan.price_per_bowl,
            price_per_bowl_premium: premiumPriceBySlug.get(plan.slug ?? '') ?? null,
          }
        : null,
    };
  });

  return NextResponse.json({ subscriptions: enriched });
}
