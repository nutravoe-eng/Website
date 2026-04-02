import { NextRequest, NextResponse } from 'next/server';
import { verifyAdmin } from '@/lib/admin-auth';
import { adminSupabase } from '@/lib/supabase/admin';

const ALLOWED_PAYMENT_STATUSES = new Set(['pending', 'paid', 'failed', 'refunded']);
const ALLOWED_SUBSCRIPTION_STATUSES = new Set(['pending', 'active', 'paused', 'cancelled', 'expired']);

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  const body = await req.json();
  const {
    payment_status,
    payment_reference,
    admin_notes,
    status,
  }: {
    payment_status?: string;
    payment_reference?: string | null;
    admin_notes?: string | null;
    status?: string;
  } = body;

  if (payment_status !== undefined && !ALLOWED_PAYMENT_STATUSES.has(payment_status)) {
    return NextResponse.json({ error: 'Invalid payment status' }, { status: 422 });
  }

  if (status !== undefined && !ALLOWED_SUBSCRIPTION_STATUSES.has(status)) {
    return NextResponse.json({ error: 'Invalid subscription status' }, { status: 422 });
  }

  if (payment_reference !== undefined && payment_reference !== null && (typeof payment_reference !== 'string' || payment_reference.length > 200)) {
    return NextResponse.json({ error: 'payment_reference must be a string under 200 characters' }, { status: 422 });
  }

  if (admin_notes !== undefined && admin_notes !== null && (typeof admin_notes !== 'string' || admin_notes.length > 2000)) {
    return NextResponse.json({ error: 'admin_notes must be a string under 2000 characters' }, { status: 422 });
  }

  if (payment_status === 'paid') {
    const { data: approval, error: approvalError } = await adminSupabase.rpc('approve_subscription_payment', {
      p_subscription_id: id,
      p_payment_reference: payment_reference ?? null,
      p_admin_notes: admin_notes ?? null,
    });

    if (approvalError) {
      const statusCode = approvalError.message.includes('already approved') ? 409 : 400;
      return NextResponse.json({ error: approvalError.message }, { status: statusCode });
    }
  }

  const updates: Record<string, unknown> = {};

  if (payment_status !== undefined && payment_status !== 'paid') updates.payment_status = payment_status;
  if (payment_reference !== undefined && payment_status !== 'paid') updates.payment_reference = payment_reference;
  if (admin_notes !== undefined && payment_status !== 'paid') updates.admin_notes = admin_notes;
  if (status !== undefined) updates.status = status;

  if (Object.keys(updates).length > 0) {
    const { error: updateError } = await adminSupabase
      .from('subscriptions')
      .update(updates)
      .eq('id', id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }
  }

  const { data: subscription, error: fetchError } = await adminSupabase
    .from('subscriptions')
    .select('*')
    .eq('id', id)
    .single();

  if (fetchError || !subscription) {
    return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });
  }

  return NextResponse.json({ subscription });
}
