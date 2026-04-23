// app/api/admin/subscriptions/[id]/bowls/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdmin } from '@/lib/admin-auth';
import { adminSupabase } from '@/lib/supabase/admin';
import { buildSubscriptionQuote } from '@/lib/checkout-security';
import { requestOriginReferrer } from '@/lib/ola-maps';

interface DayConfigUpdate {
  id: string;
  bowl_slug: string;
  bowl_name: string;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = params;

  const body = await req.json();
  const { dayConfigs }: { dayConfigs: DayConfigUpdate[] } = body;

  // Validate body
  if (!Array.isArray(dayConfigs) || dayConfigs.length === 0) {
    return NextResponse.json({ error: 'dayConfigs must be a non-empty array' }, { status: 422 });
  }
  for (const dc of dayConfigs) {
    if (
      typeof dc.id !== 'string' || !dc.id ||
      typeof dc.bowl_slug !== 'string' || !dc.bowl_slug ||
      typeof dc.bowl_name !== 'string' || !dc.bowl_name
    ) {
      return NextResponse.json(
        { error: 'Each dayConfig must have id, bowl_slug, and bowl_name as non-empty strings' },
        { status: 422 }
      );
    }
  }

  // Fetch subscription with plan, day configs, and address for repricing
  const { data: sub, error: fetchErr } = await adminSupabase
    .from('subscriptions')
    .select(`
      *,
      subscription_plans:plan_id (name, slug, price_per_bowl),
      subscription_day_configs (*),
      addresses:delivery_address_id (pincode, lat, lng)
    `)
    .eq('id', id)
    .single();

  if (fetchErr || !sub) {
    return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });
  }

  // Build updated day configs for repricing (merge edits into existing configs)
  const updateMap = new Map(dayConfigs.map(dc => [dc.id, dc.bowl_slug]));
  const updatedConfigs = (sub.subscription_day_configs as any[]).map((c: any) => ({
    bowlId: updateMap.get(c.id) ?? c.bowl_slug,
    day: c.day_of_week,
    quantity: c.quantity,
    customizations: Array.isArray(c.customizations) ? c.customizations : [],
  }));

  // Reprice FIRST — fail fast before writing anything to the DB
  let newTotal: number;
  try {
    const addr = sub.addresses as any;
    const addrRecord = addr
      ? { pincode: addr.pincode ?? null, lat: addr.lat ?? null, lng: addr.lng ?? null }
      : {};
    const planSlug = (sub.subscription_plans as any)?.slug ?? sub.plan_id;

    const quote = await buildSubscriptionQuote(planSlug, addrRecord, updatedConfigs, {
      httpReferrer: requestOriginReferrer(req),
    });
    newTotal = quote.totalAmountRs;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to calculate new price';
    return NextResponse.json({ error: `Repricing failed: ${message}` }, { status: 500 });
  }

  // Update each day config row (repricing succeeded — safe to write)
  for (const dc of dayConfigs) {
    const { error: updateErr } = await adminSupabase
      .from('subscription_day_configs')
      .update({ bowl_slug: dc.bowl_slug, bowl_name: dc.bowl_name })
      .eq('id', dc.id)
      .eq('subscription_id', id);

    if (updateErr) {
      return NextResponse.json(
        { error: `Failed to update day config ${dc.id}: ${updateErr.message}` },
        { status: 500 }
      );
    }
  }

  // Adjust total (and wallet if already paid) via RPC
  const { error: rpcErr } = await adminSupabase.rpc('adjust_subscription_bowl_pricing', {
    p_subscription_id: id,
    p_new_total_rs: newTotal,
  });

  if (rpcErr) {
    return NextResponse.json({ error: rpcErr.message }, { status: 400 });
  }

  // Re-fetch final state including plan for UI merge
  const { data: updated, error: refetchErr } = await adminSupabase
    .from('subscriptions')
    .select('*, subscription_plans:plan_id (name, slug, price_per_bowl), subscription_day_configs (*)')
    .eq('id', id)
    .single();

  if (refetchErr || !updated) {
    return NextResponse.json({ error: 'Could not re-fetch subscription' }, { status: 500 });
  }

  return NextResponse.json({ subscription: updated });
}
