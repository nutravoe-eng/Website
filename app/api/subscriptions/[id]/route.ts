import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminSupabase } from "@/lib/supabase/admin";
import { scheduleDeliveryDates } from "@/lib/subscription";
import { getAllBowls } from "@/lib/sanity";

type DayConfigInput = {
  day: string;
  bowlId: string;
  quantity: number;
};

function parseSlotStartHour(slot: string | null | undefined): number | null {
  if (!slot) return null;
  const first = slot.split("-")[0]?.trim();
  if (!first) return null;
  const match = first.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!match) return null;
  let hour = parseInt(match[1], 10);
  const meridiem = match[3].toUpperCase();
  if (meridiem === "PM" && hour !== 12) hour += 12;
  if (meridiem === "AM" && hour === 12) hour = 0;
  return hour;
}

function daySlugFromDate(dateISO: string): string {
  const d = new Date(`${dateISO}T12:00:00`);
  const map = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  return map[d.getDay()] ?? "mon";
}

function resolveCanonicalBowlSlug(rawBowlId: string, bowlMap: Map<string, string>): string | null {
  return bowlMap.get(rawBowlId) ?? null;
}

function isOrderEditableByCustomer(order: { delivery_date: string; delivery_time_slot: string | null }): boolean {
  const slotHour = parseSlotStartHour(order.delivery_time_slot);
  const deliveryDateTime = new Date(
    `${order.delivery_date}T${String(slotHour ?? 7).padStart(2, "0")}:00:00+05:30`,
  );
  return deliveryDateTime.getTime() - Date.now() >= 24 * 60 * 60 * 1000;
}

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

    const allBowls = await getAllBowls();
    const bowlIdentifierToSlug = new Map<string, string>();
    for (const bowl of allBowls) {
      bowlIdentifierToSlug.set(bowl.slug, bowl.slug);
      bowlIdentifierToSlug.set(bowl._id, bowl.slug);
      bowlIdentifierToSlug.set(`bowl-${bowl.slug}`, bowl.slug);
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
          // Always persist canonical slug regardless of what the client sends.
          bowl_slug: resolveCanonicalBowlSlug(config.bowlId, bowlIdentifierToSlug) ?? config.bowlId,
          subscription_id: id,
          day_of_week: config.day.toLowerCase(),
          quantity: Math.max(1, Math.trunc(config.quantity)),
        })));

      if (insertError) {
        return NextResponse.json({ error: "Failed to replace subscription configuration" }, { status: 500 });
      }
    }

    // Sync upcoming generated orders so customer edits reflect on admin side too.
    // Only orders >=24h away are editable by customers.
    const { data: subRow } = await adminSupabase
      .from("subscriptions")
      .select("id, style, delivery_time_slot")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (subRow?.style === "spread") {
      const { data: upcomingOrders } = await adminSupabase
        .from("orders")
        .select("id, delivery_date, delivery_time_slot, status")
        .eq("subscription_id", id)
        .in("status", ["pending", "confirmed"]);

      const editableOrders = (upcomingOrders ?? [])
        .filter((o) => isOrderEditableByCustomer(o))
        .sort((a, b) => a.delivery_date.localeCompare(b.delivery_date));

      if (editableOrders.length > 0) {
        const daySlotMap = new Map<string, string | null>();
        for (const cfg of dayConfigs) {
          const key = cfg.day.substring(0, 3).toLowerCase();
          if (!daySlotMap.has(key)) {
            daySlotMap.set(key, updates.delivery_time_slot ?? subRow.delivery_time_slot ?? null);
          }
        }

        const desiredDateMap = scheduleDeliveryDates(
          Array.from(daySlotMap.entries()).map(([day, timeSlot]) => ({ day, timeSlot }))
        );

        const desired = Array.from(daySlotMap.entries())
          .map(([day, slot]) => ({ day, date: desiredDateMap[day], slot }))
          .filter((d) => !!d.date)
          .sort((a, b) => a.date.localeCompare(b.date));

        const usedDesired = new Set<number>();
        const updatesToApply: Array<{ id: string; delivery_date: string; delivery_time_slot: string | null }> = [];
        const unmatched: typeof editableOrders = [];

        for (const order of editableOrders) {
          const orderDay = daySlugFromDate(order.delivery_date);
          const idx = desired.findIndex((d, i) => !usedDesired.has(i) && d.day === orderDay);
          if (idx >= 0) {
            usedDesired.add(idx);
            updatesToApply.push({
              id: order.id,
              delivery_date: desired[idx].date,
              delivery_time_slot: desired[idx].slot,
            });
          } else {
            unmatched.push(order);
          }
        }

        for (const order of unmatched) {
          const idx = desired.findIndex((_, i) => !usedDesired.has(i));
          if (idx < 0) break;
          usedDesired.add(idx);
          updatesToApply.push({
            id: order.id,
            delivery_date: desired[idx].date,
            delivery_time_slot: desired[idx].slot,
          });
        }

        for (const ord of updatesToApply) {
          await adminSupabase
            .from("orders")
            .update({
              delivery_date: ord.delivery_date,
              delivery_time_slot: ord.delivery_time_slot,
            })
            .eq("id", ord.id)
            .eq("subscription_id", id);
        }
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
