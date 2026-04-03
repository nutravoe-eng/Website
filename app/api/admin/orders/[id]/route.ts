import { NextRequest, NextResponse } from 'next/server';
import { verifyAdmin } from '@/lib/admin-auth';
import { adminSupabase } from '@/lib/supabase/admin';

const ALLOWED_PAYMENT_STATUSES = new Set(['pending', 'paid', 'failed', 'refunded']);
const ALLOWED_ORDER_STATUSES = new Set(['pending', 'confirmed', 'out_for_delivery', 'delivered', 'cancelled']);

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  const body = await req.json();
  const { payment_status, payment_reference, status, admin_notes, delivery_date, delivery_time_slot } = body;

  if (payment_status !== undefined && !ALLOWED_PAYMENT_STATUSES.has(payment_status)) {
    return NextResponse.json({ error: 'Invalid payment status' }, { status: 422 });
  }

  if (status !== undefined && !ALLOWED_ORDER_STATUSES.has(status)) {
    return NextResponse.json({ error: 'Invalid order status' }, { status: 422 });
  }

  if (payment_reference !== undefined && (typeof payment_reference !== 'string' || payment_reference.length > 200)) {
    return NextResponse.json({ error: 'payment_reference must be a string under 200 characters' }, { status: 422 });
  }

  if (admin_notes !== undefined && (typeof admin_notes !== 'string' || admin_notes.length > 2000)) {
    return NextResponse.json({ error: 'admin_notes must be a string under 2000 characters' }, { status: 422 });
  }
  
  if (delivery_date !== undefined && (typeof delivery_date !== 'string')) {
    return NextResponse.json({ error: 'delivery_date must be a string' }, { status: 422 });
  }

  const updates: Record<string, unknown> = {};
  if (payment_status    !== undefined) updates.payment_status    = payment_status;
  if (payment_reference !== undefined) updates.payment_reference = payment_reference;
  if (status            !== undefined) updates.status            = status;
  if (admin_notes       !== undefined) updates.admin_notes       = admin_notes;
  if (delivery_date     !== undefined) updates.delivery_date     = delivery_date;
  if (delivery_time_slot !== undefined) updates.delivery_time_slot = delivery_time_slot;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  const { data, error } = await adminSupabase
    .from('orders')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ order: data });
}
