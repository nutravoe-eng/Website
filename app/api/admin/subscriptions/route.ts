import { NextRequest, NextResponse } from 'next/server';
import { verifyAdmin } from '@/lib/admin-auth';
import { adminSupabase } from '@/lib/supabase/admin';

export async function GET(req: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const paymentStatus = searchParams.get('payment_status');
  const status        = searchParams.get('status') ?? 'active';

  let query = adminSupabase
    .from('subscriptions')
    .select(`
      id, style, status, start_date, end_date,
      delivery_time_slot, bulk_bowls, bulk_delivery_date,
      total_amount_rs, payment_status, payment_reference, admin_notes,
      notes, created_at,
      users!inner ( id, full_name, phone, email ),
      subscription_plans ( id, name, slug, price_per_bowl ),
      addresses ( id, line1, line2, city, pincode ),
      subscription_day_configs ( id, day_of_week, bowl_slug, quantity )
    `)
    .order('created_at', { ascending: false });

  if (status)        query = query.eq('status', status);
  if (paymentStatus) query = query.eq('payment_status', paymentStatus);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

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

  const enriched = (data ?? []).map((s: Record<string, unknown>) => ({
    ...s,
    deliveries_completed: deliveryCounts[s.id as string] ?? 0,
  }));

  return NextResponse.json({ subscriptions: enriched });
}
