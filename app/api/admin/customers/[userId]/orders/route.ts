import { NextRequest, NextResponse } from 'next/server';
import { verifyAdmin } from '@/lib/admin-auth';
import { adminSupabase } from '@/lib/supabase/admin';
import { buildAuthoritativeOrder, type CheckoutItemInput } from '@/lib/checkout-security';
import { requestOriginReferrer } from '@/lib/ola-maps';

export async function POST(req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { userId } = await params;

  const { data: targetUser } = await adminSupabase
    .from('users')
    .select('id')
    .eq('id', userId)
    .maybeSingle();

  if (!targetUser) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const body = await req.json().catch(() => null);
  const deliveryDate = typeof body?.deliveryDate === 'string' ? body.deliveryDate : '';
  const deliveryTimeSlot = typeof body?.deliveryTimeSlot === 'string' ? body.deliveryTimeSlot.trim() : '';
  const incomingItems: unknown[] = Array.isArray(body?.items) ? body.items : [];

  if (!deliveryDate || !deliveryTimeSlot || !incomingItems.length) {
    return NextResponse.json({ error: 'deliveryDate, deliveryTimeSlot, and items are required' }, { status: 400 });
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(deliveryDate)) {
    return NextResponse.json({ error: 'deliveryDate must be YYYY-MM-DD' }, { status: 400 });
  }

  const items: CheckoutItemInput[] = incomingItems.map((raw: unknown) => {
    const item = raw as Record<string, unknown>;
    return {
      bowlSlug: typeof item?.bowlSlug === 'string' ? item.bowlSlug : '',
      quantity: Number.isFinite(item?.quantity) ? Number(item.quantity) : 0,
      customizations: Array.isArray(item?.customizations)
        ? (item.customizations as CheckoutItemInput['customizations'])
        : [],
      presetOptions:
        item?.presetOptions && typeof item.presetOptions === 'object'
          ? (item.presetOptions as CheckoutItemInput['presetOptions'])
          : undefined,
    };
  });

  if (items.some(item => !item.bowlSlug || item.quantity <= 0)) {
    return NextResponse.json({ error: 'Invalid order items' }, { status: 400 });
  }

  const { data: address, error: addressError } = await adminSupabase
    .from('addresses')
    .select('id, pincode, lat, lng, distance_km')
    .eq('user_id', userId)
    .order('is_default', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (addressError || !address) {
    return NextResponse.json({ error: 'Customer has no delivery address on file' }, { status: 400 });
  }

  let quote;
  try {
    quote = await buildAuthoritativeOrder(items, address, null, {
      httpReferrer: requestOriginReferrer(req),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unable to price order';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const { data: order, error: orderError } = await adminSupabase
    .from('orders')
    .insert({
      user_id: userId,
      order_type: 'one_time',
      status: 'pending',
      delivery_date: deliveryDate,
      delivery_time_slot: deliveryTimeSlot,
      delivery_address_id: address.id,
      delivery_fee: quote.deliveryFee,
      subtotal: quote.subtotal,
      total: quote.total,
      payment_method: 'cash',
      payment_status: 'pending',
      notes: 'requested_via_whatsapp',
    })
    .select('id')
    .single();

  if (orderError) {
    return NextResponse.json({ error: 'Failed to create order' }, { status: 500 });
  }

  const { error: itemsError } = await adminSupabase
    .from('order_items')
    .insert(quote.lineItems.map(item => ({ order_id: order.id, ...item })));

  if (itemsError) {
    await adminSupabase.from('orders').delete().eq('id', order.id);
    return NextResponse.json({ error: 'Failed to save order items' }, { status: 500 });
  }

  return NextResponse.json({ id: order.id, subtotal: quote.subtotal, total: quote.total });
}
