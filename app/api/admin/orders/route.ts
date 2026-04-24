import { NextRequest, NextResponse } from 'next/server';
import { verifyAdmin } from '@/lib/admin-auth';
import { adminSupabase } from '@/lib/supabase/admin';

export async function GET(req: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const date = searchParams.get('date');           // 'today' | 'YYYY-MM-DD'
  const paymentStatus = searchParams.get('payment_status');
  const orderStatus = searchParams.get('status');

  let query = adminSupabase
    .from('orders')
    .select(`
      id, order_type, status, payment_status, payment_method, payment_reference,
      delivery_date, delivery_time_slot, delivery_fee,
      subtotal, total, notes, admin_notes, created_at,
      subscriptions ( style ),
      users!inner ( id, full_name, phone, email ),
      addresses ( id, line1, line2, city, pincode, lat, lng ),
      order_items ( id, bowl_slug, bowl_name, quantity, unit_price, total_price, customizations )
    `)
    .order('delivery_date', { ascending: false })
    .order('created_at', { ascending: false });

  if (date === 'today') {
    const nowIST = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
    const y = nowIST.getFullYear();
    const m = String(nowIST.getMonth() + 1).padStart(2, "0");
    const d = String(nowIST.getDate()).padStart(2, "0");
    const today = `${y}-${m}-${d}`;
    query = query.eq('delivery_date', today);
  } else if (date) {
    query = query.eq('delivery_date', date);
  }

  if (paymentStatus) query = query.eq('payment_status', paymentStatus);
  if (orderStatus)   query = query.eq('status', orderStatus);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ orders: data ?? [] });
}
