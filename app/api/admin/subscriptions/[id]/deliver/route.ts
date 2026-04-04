import { NextRequest, NextResponse } from 'next/server';
import { verifyAdmin } from '@/lib/admin-auth';
import { adminSupabase } from '@/lib/supabase/admin';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id: subscriptionId } = await params;
  const body = await req.json();

  const deliveryDate: string = body.delivery_date ?? new Date().toISOString().split('T')[0];
  const deliverySlot: string | null = body.delivery_time_slot ?? null;
  const bowls: { bowl_slug: string; bowl_name: string; quantity: number; unit_price: number }[] = body.bowls ?? [];

  // Validate date is in YYYY-MM-DD format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(deliveryDate)) {
    return NextResponse.json({ error: 'delivery_date must be in YYYY-MM-DD format' }, { status: 400 });
  }

  if (bowls.length === 0) {
    return NextResponse.json({ error: 'At least one bowl is required' }, { status: 400 });
  }

  // Explicitly check wallet hasn't expired before calling the RPC.
  // The RPC would catch this too, but gives a cryptic DB error. We return a clear message here.
  const { data: walletLoads } = await adminSupabase
    .from('wallet_loads')
    .select('expires_at, remaining_amount_rs')
    .eq('subscription_id', subscriptionId)
    .gt('remaining_amount_rs', 0)
    .order('expires_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (walletLoads && walletLoads.expires_at && new Date(walletLoads.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Wallet balance has expired. Please renew the subscription.' }, { status: 400 });
  }

  const { data, error } = await adminSupabase.rpc('create_subscription_delivery', {
    p_subscription_id: subscriptionId,
    p_delivery_date: deliveryDate,
    p_delivery_time_slot: deliverySlot,
    p_bowls: bowls,
  });

  if (error) {
    const status =
      error.message.includes('insufficient wallet balance') || error.message.includes('already recorded')
        ? 400
        : 500;

    return NextResponse.json({ error: error.message }, { status });
  }

  const row = Array.isArray(data) ? data[0] : data;
  return NextResponse.json({
    order_id: row?.order_id ?? null,
    debited_amount_rs: row?.debited_amount_rs ?? null,
    wallet_balance: row?.wallet_balance_rs ?? null,
  });
}
