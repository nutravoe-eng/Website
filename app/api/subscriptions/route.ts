import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminSupabase } from "@/lib/supabase/admin";
import { buildSubscriptionQuote, getCustomizationUpcharge } from "@/lib/checkout-security";
import { FREE_ZONE_RADIUS_KM, getNearestHub } from "@/lib/delivery";
import { getAllBowls } from "@/lib/sanity";
import { enforceRateLimit } from "@/lib/rate-limit";

type DayConfigInput = {
  day: string;
  bowlId: string;
  quantity: number;
  customizations?: Array<{ ingredientId: string; option: "default" | "remove" | "extra" }>;
  deliveryTimeSlot?: string;
};

const DAY_NAME_TO_ENUM: Record<string, string> = {
  Sun: "sun",
  Mon: "mon",
  Tue: "tue",
  Wed: "wed",
  Thu: "thu",
  Fri: "fri",
  Sat: "sat",
  sun: "sun",
  mon: "mon",
  tue: "tue",
  wed: "wed",
  thu: "thu",
  fri: "fri",
  sat: "sat",
};

function normalizeDayConfigDay(day: string): string | null {
  return DAY_NAME_TO_ENUM[day] ?? null;
}



export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, "subscription-create", 5, 60);
  if (!limited.ok) return limited.response;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401, headers: limited.headers });
  }

  const body = await req.json().catch(() => null);
  const planId = typeof body?.planId === "string" ? body.planId : "";
  const deliveryStyle = typeof body?.deliveryStyle === "string" ? body.deliveryStyle : "";
  const deliveryTimeSlot = typeof body?.deliveryTimeSlot === "string" ? body.deliveryTimeSlot.trim() : "";
  const dayConfigs = Array.isArray(body?.dayConfigs) ? body.dayConfigs as DayConfigInput[] : [];
  const requestedStartDate = typeof body?.startDate === "string" ? body.startDate : null;

  if (!planId || !["spread", "flexible"].includes(deliveryStyle)) {
    return NextResponse.json({ error: "Invalid subscription request" }, { status: 400, headers: limited.headers });
  }

  const hasGlobalTimeSlot = !!deliveryTimeSlot;
  const hasDailyTimeSlots = dayConfigs.length > 0 && dayConfigs.every(dc => !!dc.deliveryTimeSlot);

  if (deliveryStyle !== "flexible" && !hasGlobalTimeSlot && !hasDailyTimeSlots) {
    return NextResponse.json({ error: "Delivery time slot is required" }, { status: 400, headers: limited.headers });
  }

  if (deliveryStyle === "spread" && dayConfigs.length === 0) {
    return NextResponse.json({ error: "Spread plans require at least one delivery day" }, { status: 400, headers: limited.headers });
  }

  if (dayConfigs.some((config) => !config?.bowlId || !Number.isFinite(config?.quantity) || Number(config.quantity) <= 0)) {
    return NextResponse.json({ error: "Invalid subscription bowl configuration" }, { status: 400, headers: limited.headers });
  }

  // Validate all day names BEFORE touching the DB.
  // If validation throws after the subscription row is inserted, the user gets locked
  // out because they'd have a pending subscription with no day configs.
  const invalidDay = dayConfigs.find((config) => !normalizeDayConfigDay(config.day));
  if (invalidDay) {
    return NextResponse.json({ error: `Invalid delivery day: "${invalidDay.day}". Use Mon, Tue, Wed, Thu, Fri, Sat, or Sun.` }, { status: 400, headers: limited.headers });
  }

  // Check for existing subscriptions
  const { data: existingSubs } = await adminSupabase
    .from("subscriptions")
    .select("id, status, period_end_date")
    .eq("user_id", user.id)
    .in("status", ["active", "pending"]);

  if (existingSubs && existingSubs.length > 0) {
    // If there's already a pending one, block. User must discard first.
    if (existingSubs.some(s => s.status === 'pending')) {
      return NextResponse.json({ error: "You already have a pending subscription request. Please discard it before starting a new one." }, { status: 409, headers: limited.headers });
    }

    // If there's an active one, check for overlap
    const activeSub = existingSubs.find(s => s.status === 'active');
    if (activeSub && activeSub.period_end_date) {
      if (!requestedStartDate) {
        return NextResponse.json({ error: "You already have an active subscription. To schedule a new one, please provide a start date after the current period ends." }, { status: 409, headers: limited.headers });
      }

      const activeEnd = new Date(activeSub.period_end_date);
      const newStart = new Date(requestedStartDate);
      if (newStart <= activeEnd) {
        return NextResponse.json({ error: `Your new subscription must start after your current one ends (after ${activeSub.period_end_date}).` }, { status: 409, headers: limited.headers });
      }
    } else if (activeSub) {
      // Active but no period_end_date (edge case for manual subs)
      return NextResponse.json({ error: "You already have an active subscription." }, { status: 409, headers: limited.headers });
    }
  }

  // Determine actual start date
  // If not provided, use tomorrow (standard for first-time)
  const finalStartDate = requestedStartDate || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const { data: address, error: addressError } = await adminSupabase
    .from("addresses")
    .select("id, pincode, lat, lng")
    .eq("user_id", user.id)
    .order("is_default", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (addressError || !address) {
    return NextResponse.json({ error: "A default delivery address is required" }, { status: 400, headers: limited.headers });
  }

  const { data: dbPlan, error: planFetchError } = await adminSupabase
    .from("subscription_plans")
    .select("id")
    .eq("slug", planId)
    .single();

  if (planFetchError || !dbPlan) {
    return NextResponse.json({ error: "Invalid subscription plan" }, { status: 400, headers: limited.headers });
  }

  let quote;
  try {
    quote = await buildSubscriptionQuote(planId, address, dayConfigs);
  } catch (e) {
    console.error("Quote error:", e);
    return NextResponse.json({ error: "Unable to price this subscription" }, { status: 400, headers: limited.headers });
  }

  // Compute per-trip delivery fee to store in subscriptions.delivery_fee
  // (used by create_subscription_delivery when generating individual delivery orders)
  const addrCoords = (typeof address.lat === "number" && typeof address.lng === "number")
    ? { lat: address.lat, lng: address.lng }
    : null;
  const addrDistanceKm = addrCoords ? getNearestHub(addrCoords.lat, addrCoords.lng).distanceKm : 12;
  const perTripDeliveryFee = addrDistanceKm <= FREE_ZONE_RADIUS_KM ? 0 : Math.ceil(addrDistanceKm) * 5;

  const nowIso = new Date().toISOString();
  const { data: subscription, error: subscriptionError } = await adminSupabase
    .from("subscriptions")
    .insert({
      user_id: user.id,
      plan_id: dbPlan.id,
      style: deliveryStyle,
      billing_cycle: quote.billingCycle,
      status: "pending",
      start_date: finalStartDate,
      delivery_time_slot: deliveryStyle !== "flexible" ? deliveryTimeSlot : null,
      wallet_balance_rs: 0,
      total_amount_rs: quote.totalAmountRs,
      delivery_fee: perTripDeliveryFee,
      payment_status: "pending",
      delivery_address_id: address.id,
      notes: "requested_via_whatsapp",
    })
    .select("id")
    .single();

  if (subscriptionError || !subscription) {
    return NextResponse.json({ error: "Failed to create subscription" }, { status: 500, headers: limited.headers });
  }

  if (dayConfigs.length > 0) {
    const allBowls = await getAllBowls();
    const bowlMap = new Map(allBowls.map(b => [b.slug, b]));

    const configRows = dayConfigs.map((config) => {
      const normalizedDay = normalizeDayConfigDay(config.day);
      if (!normalizedDay) {
        throw new Error(`Invalid delivery day: ${config.day}`);
      }

      const bowl = bowlMap.get(config.bowlId);
      const extraCost = bowl ? getCustomizationUpcharge(bowl, (config.customizations as any)) : 0;

      return {
        subscription_id: subscription.id,
        day_of_week: normalizedDay,
        bowl_slug: config.bowlId,
        quantity: Math.max(1, Math.trunc(config.quantity)),
        delivery_time_slot: config.deliveryTimeSlot ?? null,
        customizations: config.customizations ?? [],
        customization_cost_rs: extraCost,
      };
    });

    const { error: configError } = await adminSupabase
      .from("subscription_day_configs")
      .insert(configRows);

    if (configError) {
      await adminSupabase.from("subscriptions").delete().eq("id", subscription.id);
      return NextResponse.json({ error: configError.message }, { status: 500, headers: limited.headers });
    }
  }

  return NextResponse.json({
    id: subscription.id,
    billingCycle: quote.billingCycle,
    bowlsPerCycle: quote.bowlsPerCycle,
    perBowl: quote.perBowl,
    totalAmountRs: quote.totalAmountRs,
    weeklyDeliveryFeeRs: quote.weeklyDeliveryFeeRs,
  }, { headers: limited.headers });
}
