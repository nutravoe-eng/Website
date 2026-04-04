import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminSupabase } from "@/lib/supabase/admin";

type DayConfigInput = {
  day: string;
  bowlId: string;
  quantity: number;
};

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const { data: subscription } = await adminSupabase
    .from("subscriptions")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!subscription) {
    return NextResponse.json({ error: "Subscription not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const updates: Record<string, string | null> = {};

  if (typeof body?.status === "string") {
    if (!["active", "paused", "cancelled"].includes(body.status)) {
      return NextResponse.json({ error: "Invalid subscription status" }, { status: 400 });
    }
    updates.status = body.status;
  }

  if (typeof body?.deliveryTimeSlot === "string") {
    updates.delivery_time_slot = body.deliveryTimeSlot.trim() || null;
  }

  if (Object.keys(updates).length > 0) {
    const { error: updateError } = await adminSupabase
      .from("subscriptions")
      .update(updates)
      .eq("id", id)
      .eq("user_id", user.id);

    if (updateError) {
      return NextResponse.json({ error: "Failed to update subscription" }, { status: 500 });
    }
  }

  if (Array.isArray(body?.dayConfigs)) {
    const dayConfigs = body.dayConfigs as DayConfigInput[];
    const VALID_DAYS = new Set(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']);

    if (dayConfigs.some((config) => !config?.day || !config?.bowlId || !Number.isFinite(config?.quantity) || Number(config.quantity) <= 0)) {
      return NextResponse.json({ error: 'Invalid day configuration' }, { status: 400 });
    }

    const invalidDay = dayConfigs.find((config) => !VALID_DAYS.has(config.day.toLowerCase()));
    if (invalidDay) {
      return NextResponse.json({ error: `Invalid day "${invalidDay.day}". Must be one of: Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday.` }, { status: 400 });
    }

    const { error: deleteError } = await adminSupabase
      .from("subscription_day_configs")
      .delete()
      .eq("subscription_id", id);

    if (deleteError) {
      return NextResponse.json({ error: "Failed to replace subscription configuration" }, { status: 500 });
    }

    if (dayConfigs.length > 0) {
      const { error: insertError } = await adminSupabase
        .from("subscription_day_configs")
        .insert(dayConfigs.map((config) => ({
          subscription_id: id,
          day_of_week: config.day.toLowerCase(),
          bowl_slug: config.bowlId,
          quantity: Math.max(1, Math.trunc(config.quantity)),
        })));

      if (insertError) {
        return NextResponse.json({ error: "Failed to replace subscription configuration" }, { status: 500 });
      }
    }
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  // Only allow deleting pending or cancelled subscriptions owned by the user
  const { data: subscription } = await adminSupabase
    .from("subscriptions")
    .select("status")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!subscription) {
    return NextResponse.json({ error: "Subscription not found" }, { status: 404 });
  }

  if (!["pending", "cancelled"].includes(subscription.status)) {
    return NextResponse.json({ error: "Active subscriptions cannot be deleted" }, { status: 400 });
  }

  // Delete associated day configs first (to be safe, though DB should cascade)
  await adminSupabase.from("subscription_day_configs").delete().eq("subscription_id", id);

  const { error } = await adminSupabase.from("subscriptions").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: "Failed to delete subscription" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
