import { NextRequest, NextResponse } from 'next/server';
import { verifyAdmin } from '@/lib/admin-auth';
import { adminSupabase } from '@/lib/supabase/admin';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  const body = await req.json();
  const { payment_status, payment_reference, admin_notes, status } = body;

  // Fetch current subscription to get user_id and total_amount_rs
  const { data: sub, error: fetchError } = await adminSupabase
    .from('subscriptions')
    .select('id, user_id, total_amount_rs, payment_status')
    .eq('id', id)
    .single();

  if (fetchError || !sub) {
    return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });
  }

  const updates: Record<string, unknown> = {};
  if (payment_status    !== undefined) updates.payment_status    = payment_status;
  if (payment_reference !== undefined) updates.payment_reference = payment_reference;
  if (admin_notes       !== undefined) updates.admin_notes       = admin_notes;
  if (status            !== undefined) updates.status            = status;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  const { data, error } = await adminSupabase
    .from('subscriptions')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // ── Credit wallet when admin marks subscription as paid ──────────────────────
  // Only trigger when transitioning from non-paid → paid and amount is known
  if (
    payment_status === 'paid' &&
    sub.payment_status !== 'paid' &&
    sub.total_amount_rs
  ) {
    const amountRs = Number(sub.total_amount_rs);

    // Get or create wallet account
    const { data: wallet } = await adminSupabase
      .from('wallet_accounts')
      .select('id, balance_rs')
      .eq('user_id', sub.user_id)
      .maybeSingle();

    if (wallet) {
      const newBalance = Number(wallet.balance_rs) + amountRs;

      await adminSupabase
        .from('wallet_accounts')
        .update({ balance_rs: newBalance })
        .eq('id', wallet.id);

      await adminSupabase.from('wallet_transactions').insert({
        wallet_id:     wallet.id,
        user_id:       sub.user_id,
        type:          'credit',
        reason:        'top_up',
        amount_rs:     amountRs,
        balance_after: newBalance,
        reference_id:  id,
        note:          `Subscription payment confirmed — ref: ${payment_reference ?? 'N/A'}`,
      });
    }
  }

  return NextResponse.json({ subscription: data });
}
