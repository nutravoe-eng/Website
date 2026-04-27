import { NextRequest, NextResponse } from 'next/server';
import { verifyAdmin } from '@/lib/admin-auth';
import { adminSupabase } from '@/lib/supabase/admin';
import { getSubscriptionPlans } from '@/lib/sanity';

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

  if (subIds.length > 0) {
    const { data: orders } = await adminSupabase
      .from('orders')
      .select('subscription_id')
      .in('subscription_id', subIds)
      .eq('status', 'delivered');

    (orders ?? []).forEach((o: { subscription_id: string }) => {
      deliveryCounts[o.subscription_id] = (deliveryCounts[o.subscription_id] ?? 0) + 1;
    });
  }

  const enriched = (data ?? []).map((s: Record<string, unknown>) => {
    const plan = s.subscription_plans as { slug?: string; price_per_bowl?: number } | null;
    return {
      ...s,
      deliveries_completed: deliveryCounts[s.id as string] ?? 0,
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
