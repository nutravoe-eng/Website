import { NextRequest, NextResponse } from 'next/server';
import { verifyAdmin } from '@/lib/admin-auth';
import { adminSupabase } from '@/lib/supabase/admin';

/**
 * POST /api/admin/subscriptions/[id]/deliver
 *
 * Records a single delivery for a subscription:
 *   1. Validates wallet has sufficient balance
 *   2. Creates an order row (order_type = 'subscription', payment_method = 'wallet')
 *   3. Creates order_items rows from provided bowls
 *   4. Debits the wallet
 *
 * Body: {
 *   delivery_date: string;        // 'YYYY-MM-DD', defaults to today
 *   delivery_time_slot?: string;
 *   bowls: { bowl_slug: string; bowl_name: string; quantity: number; unit_price: number }[]
 * }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id: subscriptionId } = await params;
  const body = await req.json();

  const deliveryDate: string =
    body.delivery_date ?? new Date().toISOString().split('T')[0];
  const deliverySlot: string | null = body.delivery_time_slot ?? null;
  const bowls: { bowl_slug: string; bowl_name: string; quantity: number; unit_price: number }[] =
    body.bowls ?? [];

  if (bowls.length === 0) {
    return NextResponse.json({ error: 'At least one bowl is required' }, { status: 400 });
  }

  // Fetch subscription to get user_id and delivery_address_id
  const { data: sub, error: subErr } = await adminSupabase
    .from('subscriptions')
    .select('id, user_id, delivery_address_id, delivery_fee, payment_status')
    .eq('id', subscriptionId)
    .single();

  if (subErr || !sub) {
    return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });
  }

  if (sub.payment_status !== 'paid') {
    return NextResponse.json(
      { error: 'Subscription payment has not been confirmed yet' },
      { status: 400 }
    );
  }

  // Calculate totals
  const subtotal   = bowls.reduce((s, b) => s + b.unit_price * b.quantity, 0);
  const deliveryFee = Number(sub.delivery_fee ?? 0);
  const total      = subtotal + deliveryFee;

  // Check wallet balance
  const { data: wallet } = await adminSupabase
    .from('wallet_accounts')
    .select('id, balance_rs')
    .eq('user_id', sub.user_id)
    .maybeSingle();

  if (!wallet || Number(wallet.balance_rs) < total) {
    return NextResponse.json(
      { error: `Insufficient wallet balance. Balance: ₹${wallet?.balance_rs ?? 0}, Required: ₹${total}` },
      { status: 400 }
    );
  }

  // Create order
  const { data: order, error: orderErr } = await adminSupabase
    .from('orders')
    .insert({
      user_id:             sub.user_id,
      subscription_id:     subscriptionId,
      order_type:          'subscription',
      status:              'delivered',
      delivery_date:       deliveryDate,
      delivery_time_slot:  deliverySlot,
      delivery_address_id: sub.delivery_address_id,
      delivery_fee:        deliveryFee,
      subtotal,
      total,
      payment_method:  'wallet',
      payment_status:  'paid',
    })
    .select('id')
    .single();

  if (orderErr || !order) {
    return NextResponse.json({ error: orderErr?.message ?? 'Failed to create order' }, { status: 500 });
  }

  // Create order items
  await adminSupabase.from('order_items').insert(
    bowls.map(b => ({
      order_id:    order.id,
      bowl_slug:   b.bowl_slug,
      bowl_name:   b.bowl_name,
      quantity:    b.quantity,
      unit_price:  b.unit_price,
      total_price: b.unit_price * b.quantity,
    }))
  );

  // Debit wallet
  const newBalance = Number(wallet.balance_rs) - total;
  await adminSupabase
    .from('wallet_accounts')
    .update({ balance_rs: newBalance })
    .eq('id', wallet.id);

  await adminSupabase.from('wallet_transactions').insert({
    wallet_id:     wallet.id,
    user_id:       sub.user_id,
    type:          'debit',
    reason:        'order_payment',
    amount_rs:     total,
    balance_after: newBalance,
    reference_id:  order.id,
    note:          `Subscription delivery — ${deliveryDate}`,
  });

  return NextResponse.json({ order_id: order.id, wallet_balance: newBalance });
}
