import { NextRequest, NextResponse } from 'next/server';
import { verifyAdmin } from '@/lib/admin-auth';
import { adminSupabase } from '@/lib/supabase/admin';
import { buildAuthoritativeOrder, type CheckoutItemInput } from '@/lib/checkout-security';
import { requestOriginReferrer } from '@/lib/ola-maps';

/**
 * Server-authoritative one-time order quote (subtotal, delivery, line items) for admin preview.
 * Uses the same pricing as customer checkout and admin order creation.
 */
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
  const incomingItems: unknown[] = Array.isArray(body?.items) ? body.items : [];

  if (!incomingItems.length) {
    return NextResponse.json({ error: 'items are required' }, { status: 400 });
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

  if (items.some((item) => !item.bowlSlug || item.quantity <= 0)) {
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

  try {
    const quote = await buildAuthoritativeOrder(items, address, null, {
      httpReferrer: requestOriginReferrer(req),
    });
    return NextResponse.json({
      subtotal: quote.subtotal,
      deliveryFee: quote.deliveryFee,
      total: quote.total,
      lineItems: quote.lineItems,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unable to price order';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
