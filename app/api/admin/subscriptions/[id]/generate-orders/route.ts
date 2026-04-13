import { NextRequest, NextResponse } from 'next/server';
import { verifyAdmin } from '@/lib/admin-auth';
import { adminSupabase } from '@/lib/supabase/admin';
import { getNextDateForDayOfWeek, scheduleDeliveryDates } from '@/lib/subscription';

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = params;

  const { data: sub } = await adminSupabase
    .from('subscriptions')
    .select(`
      *,
      subscription_plans:plan_id (name, price_per_bowl, slug),
      subscription_day_configs (*)
    `)
    .eq('id', id)
    .single();

  if (!sub) {
    return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });
  }

  if (sub.style !== 'spread') {
    return NextResponse.json({ error: 'Only spread subscriptions can have orders auto-generated' }, { status: 400 });
  }

  if (sub.status !== 'active') {
    return NextResponse.json({ error: 'Subscription must be active to generate orders' }, { status: 400 });
  }

  if (!Array.isArray(sub.subscription_day_configs) || sub.subscription_day_configs.length === 0) {
    return NextResponse.json({ error: 'No day configurations found for this subscription' }, { status: 400 });
  }

  const unitPrice = (sub.subscription_plans as any)?.price_per_bowl ?? 0;

  const daySlugList = sub.subscription_day_configs.map((c: { day_of_week: string; delivery_time_slot: string | null }) => ({
    day: c.day_of_week,
    timeSlot: c.delivery_time_slot ?? sub.delivery_time_slot ?? null,
  }));
  const dateMap = scheduleDeliveryDates(daySlugList);

  // Group configs by day_of_week — one order per delivery day, all bowls as line items
  const configsByDay: Record<string, typeof sub.subscription_day_configs> = {};
  for (const config of sub.subscription_day_configs) {
    const key = config.day_of_week;
    if (!configsByDay[key]) configsByDay[key] = [];
    configsByDay[key].push(config);
  }

  const results: { day: string; date: string; success: boolean; error?: string }[] = [];

  for (const [daySlug, dayConfigs] of Object.entries(configsByDay)) {
    const deliveryDate = dateMap[daySlug] ?? getNextDateForDayOfWeek(daySlug);
    const bowls = (dayConfigs as any[]).map((config: any) => ({
      bowl_slug: config.bowl_slug,
      bowl_name: config.bowl_name ?? config.bowl_slug,
      quantity: config.quantity,
      unit_price: unitPrice,
      customization_unit_price: config.customization_cost_rs ?? 0,
      customizations: config.customizations ?? [],
    }));
    const deliveryTimeSlot = (dayConfigs as any[])[0].delivery_time_slot ?? sub.delivery_time_slot;

    const { error: rpcError } = await adminSupabase.rpc('create_subscription_delivery', {
      p_subscription_id: id,
      p_delivery_date: deliveryDate,
      p_delivery_time_slot: deliveryTimeSlot,
      p_bowls: bowls,
      p_status: 'confirmed',
    });

    results.push({
      day: daySlug,
      date: deliveryDate,
      success: !rpcError,
      ...(rpcError ? { error: rpcError.message } : {}),
    });
  }

  const created = results.filter(r => r.success).length;
  const skipped = results.filter(r => !r.success).length;

  return NextResponse.json({ results, created, skipped });
}
