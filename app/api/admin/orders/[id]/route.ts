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
  const { payment_status, payment_reference, status, admin_notes } = body;

  const updates: Record<string, unknown> = {};
  if (payment_status    !== undefined) updates.payment_status    = payment_status;
  if (payment_reference !== undefined) updates.payment_reference = payment_reference;
  if (status            !== undefined) updates.status            = status;
  if (admin_notes       !== undefined) updates.admin_notes       = admin_notes;

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
