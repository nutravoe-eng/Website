import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminSupabase } from "@/lib/supabase/admin";
import { buildSubscriptionQuote } from "@/lib/checkout-security";
import { enforceRateLimit } from "@/lib/rate-limit";

type DayConfigInput = {
  day: string;
  bowlId: string;
  quantity: number;
  customizations?: Array<{ ingredientId: string; option: string }>;
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

function getTomorrowDayEnum(): string {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dayNames = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  return dayNames[tomorrow.getDay()]!;
}

function normalizeDayConfigDay(day: string, deliveryStyle: string): string | null {
  if (deliveryStyle === "bulk" && day === "next-day") {
    return getTomorrowDayEnum();
  }

  return DAY_NAME_TO_ENUM[day] ?? null;
}

function countCustomisedBowls(dayConfigs: DayConfigInput[]): number {
  return dayConfigs.reduce((sum, config) => {
    const hasCustomizations = Array.isArray(config.customizations) && config.customizations.some((item) => item?.option === "extra" || item?.option === "remove");
    return sum + (hasCustomizations ? 1 : 0);
  }, 0);
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
  const bulkDeliveryDay = typeof body?.bulkDeliveryDay === "string" ? body.bulkDeliveryDay : null;
  const dayConfigs = Array.isArray(body?.dayConfigs) ? body.dayConfigs as DayConfigInput[] : [];

  if (!planId || !["spread", "bulk", "flexible"].includes(deliveryStyle)) {
    return NextResponse.json({ error: "Invalid subscription request" }, { status: 400, headers: limited.headers });
  }

  if (deliveryStyle !== "flexible" && !deliveryTimeSlot) {
    return NextResponse.json({ error: "Delivery time slot is required" }, { status: 400, headers: limited.headers });
  }

  if (dayConfigs.some((config) => !config?.bowlId || !Number.isFinite(config?.quantity) || Number(config.quantity) <= 0)) {
    return NextResponse.json({ error: "Invalid subscription bowl configuration" }, { status: 400, headers: limited.headers });
  }

  const { data: existingActive } = await adminSupabase
    .from("subscriptions")
    .select("id")
    .eq("user_id", user.id)
    .in("status", ["active", "pending"])
    .limit(1)
    .maybeSingle();

  if (existingActive) {
    return NextResponse.json({ error: "You already have an active or pending subscription" }, { status: 409, headers: limited.headers });
  }

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
    quote = await buildSubscriptionQuote(planId, address, countCustomisedBowls(dayConfigs));
  } catch {
    return NextResponse.json({ error: "Unable to price this subscription" }, { status: 400, headers: limited.headers });
  }

  const nowIso = new Date().toISOString();
  const { data: subscription, error: subscriptionError } = await adminSupabase
    .from("subscriptions")
    .insert({
      user_id: user.id,
      plan_id: dbPlan.id,
      style: deliveryStyle,
      billing_cycle: quote.billingCycle,
      status: deliveryStyle === "flexible" ? "pending" : "active",
      start_date: nowIso,
      delivery_time_slot: deliveryStyle !== "flexible" ? deliveryTimeSlot : null,
      bulk_bowls: deliveryStyle === "bulk"
        ? dayConfigs.reduce((sum, config) => sum + Math.max(1, Math.trunc(config.quantity)), 0)
        : null,
      bulk_delivery_date: deliveryStyle === "bulk" ? bulkDeliveryDay : null,
      wallet_balance_rs: 0,
      total_amount_rs: quote.totalAmountRs,
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
    const configRows = dayConfigs.map((config) => {
      const normalizedDay = normalizeDayConfigDay(config.day, deliveryStyle);
      if (!normalizedDay) {
        throw new Error(`Invalid delivery day: ${config.day}`);
      }

      return {
        subscription_id: subscription.id,
        day_of_week: normalizedDay,
        bowl_slug: config.bowlId,
        quantity: Math.max(1, Math.trunc(config.quantity)),
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
  }, { headers: limited.headers });
}
