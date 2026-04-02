import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { adminSupabase } from '@/lib/supabase/admin';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const { refundMethod }: { refundMethod?: 'wallet' | 'original' } = await req.json();

  if (!refundMethod || !['wallet', 'original'].includes(refundMethod)) {
    return NextResponse.json({ error: 'Invalid refund method' }, { status: 400 });
  }

  const { data: order, error: orderError } = await adminSupabase
    .from('orders')
    .select('id, user_id, status, total')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (orderError || !order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }

  if (order.status === 'cancelled') {
    return NextResponse.json({ error: 'Order is already cancelled' }, { status: 409 });
  }

  const { data: existingCancellation } = await adminSupabase
    .from('cancellations')
    .select('id')
    .eq('order_id', id)
    .maybeSingle();

  if (existingCancellation) {
    return NextResponse.json({ error: 'Cancellation already processed' }, { status: 409 });
  }

  const { error: updateError } = await adminSupabase
    .from('orders')
    .update({ status: 'cancelled' })
    .eq('id', id)
    .eq('user_id', user.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  const { error: cancellationError } = await adminSupabase
    .from('cancellations')
    .insert({
      order_id: id,
      user_id: user.id,
      refund_amount: order.total,
      refund_destination: refundMethod === 'wallet' ? 'wallet' : 'original_payment_method',
      refund_status: refundMethod === 'wallet' ? 'completed' : 'processing',
    });

  if (cancellationError) {
    return NextResponse.json({ error: cancellationError.message }, { status: 500 });
  }

  let walletBalance = null;

  if (refundMethod === 'wallet') {
    const { data, error } = await adminSupabase.rpc('credit_wallet_lot', {
      p_user_id: user.id,
      p_amount_rs: order.total,
      p_reason: 'order_refund',
      p_reference_id: id,
      p_note: `Refund for Order #${id.slice(-6)}`,
      p_expires_at: null,
      p_source_type: 'refund',
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    walletBalance = data;
  }

  return NextResponse.json({ success: true, walletBalance });
}
