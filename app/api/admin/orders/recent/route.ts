import { NextResponse } from 'next/server';
import { verifyAdmin } from '@/lib/admin-auth';
import { adminSupabase } from '@/lib/supabase/admin';

/**
 * Orders placed in the last 36 hours that the kitchen should act on, for the
 * new-order alert in the admin panel. Read-only.
 *
 * An order counts once it is real:
 *   - Razorpay orders: only after payment_status becomes 'paid'
 *   - COD, WhatsApp-COD, wallet and other methods: as soon as they are placed
 *   - cancelled orders never count
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const since = new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString();

  const { data, error } = await adminSupabase
    .from('orders')
    .select(`
      id, order_type, status, payment_status, payment_method,
      delivery_date, delivery_time_slot, total, notes, created_at,
      users ( full_name ),
      order_items ( bowl_name, quantity, customizations )
    `)
    .gte('created_at', since)
    .neq('status', 'cancelled')
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const orders = (data ?? []).filter(
    (o) => o.payment_method !== 'razorpay' || o.payment_status === 'paid',
  );

  return NextResponse.json(
    { orders },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
