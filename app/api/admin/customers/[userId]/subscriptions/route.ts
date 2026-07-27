import { NextRequest, NextResponse } from 'next/server';
import { verifyAdmin } from '@/lib/admin-auth';
import { adminSupabase } from '@/lib/supabase/admin';
import { buildSubscriptionQuote, getCustomizationUpcharge } from '@/lib/checkout-security';
import { DELIVERY_FEE_RS, deliveryFeeFromDistanceKm } from '@/lib/delivery';
import { resolveDeliveryDistanceKm } from '@/lib/road-distance';
import { getAllBowls } from '@/lib/sanity';

type SingleCustomization = { ingredientId: string; option: 'default' | 'remove' | 'extra' };
type DayConfigInput = {
  day: string;
  bowlId: string;
  quantity: number;
  customizations?: SingleCustomization[] | SingleCustomization[][];
  presetOptions?: { baseChoice: 'yogurt' | 'milk'; oatsChoice: 'soaked' | 'roasted'; noSugar: boolean };
  deliveryTimeSlot?: string;
};

const DAY_NAME_TO_ENUM: Record<string, string> = {
  Sun: 'sun', Mon: 'mon', Tue: 'tue', Wed: 'wed', Thu: 'thu', Fri: 'fri', Sat: 'sat',
  sun: 'sun', mon: 'mon', tue: 'tue', wed: 'wed', thu: 'thu', fri: 'fri', sat: 'sat',
};

export async function POST(req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { userId } = await params;

  // Verify target user exists
  const { data: targetUser } = await adminSupabase
    .from('users')
    .select('id')
    .eq('id', userId)
    .maybeSingle();

  if (!targetUser) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  // Ensure this customer id is a real auth account id (same id must exist in auth.users).
  const { data: authUserResult, error: authUserError } = await adminSupabase.auth.admin.getUserById(userId);
  if (authUserError || !authUserResult?.user) {
    return NextResponse.json(
      { error: 'Selected customer account is not linked to a login account. Please use a valid customer profile.' },
      { status: 409 },
    );
  }

  const body = await req.json().catch(() => null);
  const planId = typeof body?.planId === 'string' ? body.planId : '';
  const deliveryStyle = typeof body?.deliveryStyle === 'string' ? body.deliveryStyle : '';
  const deliveryTimeSlot = typeof body?.deliveryTimeSlot === 'string' ? body.deliveryTimeSlot.trim() : '';
  const dayConfigs = Array.isArray(body?.dayConfigs) ? body.dayConfigs as DayConfigInput[] : [];
  const requestedStartDate = typeof body?.startDate === 'string' ? body.startDate : null;

  if (!planId || !['spread', 'flexible'].includes(deliveryStyle)) {
    return NextResponse.json({ error: 'Invalid subscription request' }, { status: 400 });
  }

  const hasGlobalTimeSlot = !!deliveryTimeSlot;
  const hasDailyTimeSlots = dayConfigs.length > 0 && dayConfigs.every(dc => !!dc.deliveryTimeSlot);

  if (deliveryStyle !== 'flexible' && !hasGlobalTimeSlot && !hasDailyTimeSlots) {
    return NextResponse.json({ error: 'Delivery time slot is required' }, { status: 400 });
  }

  if (deliveryStyle === 'spread' && dayConfigs.length === 0) {
    return NextResponse.json({ error: 'Spread plans require at least one delivery day' }, { status: 400 });
  }

  if (deliveryStyle === 'flexible' && dayConfigs.length > 0) {
    return NextResponse.json({ error: 'Flexible subscriptions cannot include day configs' }, { status: 400 });
  }

  if (dayConfigs.some(c => !c?.bowlId || !Number.isFinite(c?.quantity) || Number(c.quantity) <= 0)) {
    return NextResponse.json({ error: 'Invalid bowl configuration' }, { status: 400 });
  }

  const invalidDay = dayConfigs.find(c => !DAY_NAME_TO_ENUM[c.day]);
  if (invalidDay) {
    return NextResponse.json({ error: `Invalid day: "${invalidDay.day}". Use Mon–Sun.` }, { status: 400 });
  }

  // Check for existing pending subscription (block) or active (require startDate)
  const { data: existingSubs } = await adminSupabase
    .from('subscriptions')
    .select('id, status, period_end_date')
    .eq('user_id', userId)
    .in('status', ['active', 'pending']);

  if (existingSubs && existingSubs.length > 0) {
    if (existingSubs.some(s => s.status === 'pending')) {
      return NextResponse.json({ error: 'Customer already has a pending subscription.' }, { status: 409 });
    }
    const activeSub = existingSubs.find(s => s.status === 'active');
    if (activeSub && activeSub.period_end_date) {
      if (!requestedStartDate) {
        return NextResponse.json({ error: 'Customer has an active subscription. Provide a start date after it ends.' }, { status: 409 });
      }
      const activeEnd = new Date(activeSub.period_end_date);
      const newStart = new Date(requestedStartDate);
      if (newStart <= activeEnd) {
        return NextResponse.json({ error: `Start date must be after current subscription ends (${activeSub.period_end_date}).` }, { status: 409 });
      }
    } else if (activeSub) {
      return NextResponse.json({ error: 'Customer already has an active subscription.' }, { status: 409 });
    }
  }

  const finalStartDate = requestedStartDate || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

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

  const { data: dbPlan, error: planFetchError } = await adminSupabase
    .from('subscription_plans')
    .select('id')
    .eq('slug', planId)
    .maybeSingle();

  if (planFetchError || !dbPlan) {
    return NextResponse.json({ error: 'Invalid subscription plan' }, { status: 400 });
  }

  const allBowls = await getAllBowls();
  const bowlIdentifierToSlug = new Map<string, string>();
  for (const bowl of allBowls) {
    bowlIdentifierToSlug.set(bowl.slug, bowl.slug);
    bowlIdentifierToSlug.set(bowl._id, bowl.slug);
    bowlIdentifierToSlug.set(`bowl-${bowl.slug}`, bowl.slug);
  }

  const normalizedDayConfigs = dayConfigs.map(c => ({
    ...c,
    bowlId: bowlIdentifierToSlug.get(c.bowlId) ?? c.bowlId,
  }));

  const unresolvedBowl = normalizedDayConfigs.find((c) => !bowlIdentifierToSlug.has(c.bowlId));
  if (unresolvedBowl) {
    return NextResponse.json(
      { error: `Invalid bowl selection: "${unresolvedBowl.bowlId}". Please reselect bowls and try again.` },
      { status: 400 },
    );
  }

  let quote;
  try {
    quote = await buildSubscriptionQuote(planId, address, normalizedDayConfigs);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unable to price subscription';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const addrCoords = (typeof address.lat === 'number' && typeof address.lng === 'number')
    ? { lat: address.lat, lng: address.lng } : null;
  const hasCachedRoadDistanceAdmin =
    typeof address.distance_km === 'number' &&
    Number.isFinite(address.distance_km) &&
    address.distance_source === 'road';
  const perTripDeliveryFee = hasCachedRoadDistanceAdmin
    ? deliveryFeeFromDistanceKm(address.distance_km as number)
    : addrCoords
      ? deliveryFeeFromDistanceKm(
          (await resolveDeliveryDistanceKm(addrCoords.lat, addrCoords.lng)).distanceKm
        )
      : DELIVERY_FEE_RS;

  const { data: subscription, error: subError } = await adminSupabase
    .from('subscriptions')
    .insert({
      user_id: userId,
      plan_id: dbPlan.id,
      style: deliveryStyle,
      billing_cycle: quote.billingCycle,
      status: 'pending',
      start_date: finalStartDate,
      delivery_time_slot: deliveryStyle !== 'flexible' ? deliveryTimeSlot : null,
      wallet_balance_rs: 0,
      total_amount_rs: quote.totalAmountRs,
      delivery_fee: perTripDeliveryFee,
      payment_status: 'pending',
      delivery_address_id: address.id,
      notes: 'requested_via_whatsapp',
    })
    .select('id')
    .single();

  if (subError || !subscription) {
    return NextResponse.json({ error: 'Failed to create subscription' }, { status: 500 });
  }

  if (normalizedDayConfigs.length > 0) {
    const bowlMap = new Map(allBowls.map(b => [b.slug, b]));
    const configRows = normalizedDayConfigs.map(config => {
      const canonicalSlug = bowlIdentifierToSlug.get(config.bowlId) ?? config.bowlId;
      const bowl = bowlMap.get(canonicalSlug);
      const customsRaw = config.customizations;
      const isPerInstance = Array.isArray(customsRaw?.[0]);
      const extraCost = bowl
        ? isPerInstance
          ? (customsRaw as SingleCustomization[][]).reduce((sum, inst) => sum + getCustomizationUpcharge(bowl, inst), 0)
          : getCustomizationUpcharge(bowl, customsRaw as SingleCustomization[])
        : 0;
      return {
        subscription_id: subscription.id,
        day_of_week: DAY_NAME_TO_ENUM[config.day],
        bowl_slug: canonicalSlug,
        quantity: Math.max(1, Math.trunc(config.quantity)),
        // Persist per-day slot when provided, else inherit global slot.
        delivery_time_slot: (config.deliveryTimeSlot ?? deliveryTimeSlot) || null,
        customizations: customsRaw ?? [],
        customization_cost_rs: extraCost,
      };
    });

    const { error: configError } = await adminSupabase
      .from('subscription_day_configs')
      .insert(configRows);

    if (configError) {
      const { error: cleanupDeleteError } = await adminSupabase
        .from('subscriptions')
        .delete()
        .eq('id', subscription.id);

      if (cleanupDeleteError) {
        // Last-resort safeguard: never leave this row appearing as actionable pending.
        await adminSupabase
          .from('subscriptions')
          .update({
            status: 'cancelled',
            payment_status: 'failed',
            admin_notes: `Auto-cancelled after config save failure: ${configError.message}`,
          })
          .eq('id', subscription.id);
      }

      return NextResponse.json(
        { error: `Failed to save subscription day configuration: ${configError.message}` },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({
    id: subscription.id,
    billingCycle: quote.billingCycle,
    bowlsPerCycle: quote.bowlsPerCycle,
    perBowl: quote.perBowl,
    totalAmountRs: quote.totalAmountRs,
    weeklyDeliveryFeeRs: quote.weeklyDeliveryFeeRs,
  });
}
