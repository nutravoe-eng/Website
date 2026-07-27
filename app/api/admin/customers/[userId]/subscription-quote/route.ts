import { NextRequest, NextResponse } from 'next/server';
import { verifyAdmin } from '@/lib/admin-auth';
import { adminSupabase } from '@/lib/supabase/admin';
import { buildSubscriptionQuote } from '@/lib/checkout-security';
import { getAllBowls } from '@/lib/sanity';
import type { IngredientCustomization } from '@/types';

type DayConfigInput = {
  day: string;
  bowlId: string;
  quantity: number;
  customizations?: IngredientCustomization[] | IngredientCustomization[][];
  deliveryTimeSlot?: string;
};

const DAY_NAME_TO_ENUM: Record<string, string> = {
  Sun: 'sun', Mon: 'mon', Tue: 'tue', Wed: 'wed', Thu: 'thu', Fri: 'fri', Sat: 'sat',
  sun: 'sun', mon: 'mon', tue: 'tue', wed: 'wed', thu: 'thu', fri: 'fri', sat: 'sat',
};

/**
 * Server-authoritative subscription cycle quote (bowls, extras, weekly delivery) for admin preview.
 * Same `buildSubscriptionQuote` path as create + customer subscribe.
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
  const planId = typeof body?.planId === 'string' ? body.planId : '';
  const deliveryStyle = typeof body?.deliveryStyle === 'string' ? body.deliveryStyle : '';
  const deliveryTimeSlot = typeof body?.deliveryTimeSlot === 'string' ? body.deliveryTimeSlot.trim() : '';
  const dayConfigs = Array.isArray(body?.dayConfigs) ? (body.dayConfigs as DayConfigInput[]) : [];

  if (!planId || !['spread', 'flexible'].includes(deliveryStyle)) {
    return NextResponse.json({ error: 'Invalid subscription request' }, { status: 400 });
  }

  const hasGlobalTimeSlot = !!deliveryTimeSlot;
  const hasDailyTimeSlots = dayConfigs.length > 0 && dayConfigs.every((dc) => !!dc.deliveryTimeSlot);

  if (deliveryStyle !== 'flexible' && !hasGlobalTimeSlot && !hasDailyTimeSlots) {
    return NextResponse.json({ error: 'Delivery time slot is required' }, { status: 400 });
  }

  if (deliveryStyle === 'spread' && dayConfigs.length === 0) {
    return NextResponse.json({ error: 'Spread plans require at least one delivery day' }, { status: 400 });
  }

  if (deliveryStyle === 'flexible' && dayConfigs.length > 0) {
    return NextResponse.json({ error: 'Flexible subscriptions cannot include day configs' }, { status: 400 });
  }

  if (dayConfigs.some((c) => !c?.bowlId || !Number.isFinite(c?.quantity) || Number(c.quantity) <= 0)) {
    return NextResponse.json({ error: 'Invalid bowl configuration' }, { status: 400 });
  }

  const invalidDay = dayConfigs.find((c) => !DAY_NAME_TO_ENUM[c.day]);
  if (invalidDay) {
    return NextResponse.json({ error: `Invalid day: "${invalidDay.day}". Use Mon–Sun.` }, { status: 400 });
  }

  const { data: dbPlan, error: planFetchError } = await adminSupabase
    .from('subscription_plans')
    .select('id')
    .eq('slug', planId)
    .maybeSingle();

  if (planFetchError || !dbPlan) {
    return NextResponse.json({ error: 'Invalid subscription plan' }, { status: 400 });
  }

  const { data: address, error: addressError } = await adminSupabase
    .from('addresses')
    .select('id, pincode, lat, lng, distance_km, distance_source')
    .eq('user_id', userId)
    .order('is_default', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (addressError || !address) {
    return NextResponse.json({ error: 'Customer has no delivery address on file' }, { status: 400 });
  }

  const allBowls = await getAllBowls();
  const bowlIdentifierToSlug = new Map<string, string>();
  for (const bowl of allBowls) {
    bowlIdentifierToSlug.set(bowl.slug, bowl.slug);
    bowlIdentifierToSlug.set(bowl._id, bowl.slug);
    bowlIdentifierToSlug.set(`bowl-${bowl.slug}`, bowl.slug);
  }

  const normalizedDayConfigs = dayConfigs.map((c) => ({
    ...c,
    bowlId: bowlIdentifierToSlug.get(c.bowlId) ?? c.bowlId,
  }));

  let quote: Awaited<ReturnType<typeof buildSubscriptionQuote>>;
  try {
    const configs = deliveryStyle === 'spread' ? normalizedDayConfigs : [];
    quote = await buildSubscriptionQuote(planId, address, configs);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unable to price subscription';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const baseBowlSubtotalRs = Math.max(0, quote.bowlsAmountRs - quote.totalIngredientExtrasRs);

  return NextResponse.json({
    billingCycle: quote.billingCycle,
    perBowl: quote.perBowl,
    bowlsPerCycle: quote.bowlsPerCycle,
    bowlsAmountRs: quote.bowlsAmountRs,
    baseBowlSubtotalRs,
    totalIngredientExtrasRs: quote.totalIngredientExtrasRs,
    weeklyDeliveryFeeRs: quote.weeklyDeliveryFeeRs,
    totalAmountRs: quote.totalAmountRs,
  });
}
