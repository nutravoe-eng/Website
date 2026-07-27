// app/api/admin/subscriptions/[id]/bowls/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdmin } from '@/lib/admin-auth';
import { adminSupabase } from '@/lib/supabase/admin';
import { buildSubscriptionQuote } from '@/lib/checkout-security';
import { getAllBowls } from '@/lib/sanity';

const DAY_SLUGS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

type ExistingDayConfig = {
  id: string;
  day_of_week: string;
  bowl_slug: string;
  quantity: number;
  customizations: unknown;
};

type EditableOrder = {
  id: string;
  delivery_date: string;
  delivery_time_slot: string | null;
  order_items: Array<{
    id: string;
    bowl_slug: string;
    bowl_name: string | null;
    quantity: number;
    customizations: unknown;
  }> | null;
};

interface DayConfigUpdate {
  id: string;
  bowl_slug: string;
  bowl_name?: string;
}

function parseSlotStartHour(slot: string | null | undefined): number | null {
  if (!slot) return null;
  const first = slot.split('-')[0]?.trim();
  if (!first) return null;
  const match = first.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!match) return null;
  let hour = parseInt(match[1], 10);
  const meridiem = match[3].toUpperCase();
  if (meridiem === 'PM' && hour !== 12) hour += 12;
  if (meridiem === 'AM' && hour === 12) hour = 0;
  return hour;
}

function daySlugFromDate(dateISO: string): string {
  const d = new Date(`${dateISO}T12:00:00`);
  return DAY_SLUGS[d.getDay()] ?? 'mon';
}

function isOrderEditableByCustomer(order: { delivery_date: string; delivery_time_slot: string | null }): boolean {
  const slotHour = parseSlotStartHour(order.delivery_time_slot);
  const deliveryDateTime = new Date(
    `${order.delivery_date}T${String(slotHour ?? 7).padStart(2, '0')}:00:00+05:30`,
  );
  return deliveryDateTime.getTime() - Date.now() >= 24 * 60 * 60 * 1000;
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Stable string for deep equality of customization payloads (order within objects preserved for arrays). */
function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

/**
 * True when the only edits are bowl_slug reassignments across the same day rows: same
 * per-row day, quantity, and customizations; the multiset of (bowl_slug, qty) matches.
 * In that case stored total_amount_rs should not be wallet-adjusted (avoids quote vs DB drift, e.g. ₹125 off).
 */
function isPureBowlPermutation(
  before: ExistingDayConfig[],
  after: ExistingDayConfig[],
  existingById: Map<string, ExistingDayConfig>,
): boolean {
  if (before.length !== after.length) return false;

  const normQty = (q: number | undefined) => Math.max(1, Math.trunc(q ?? 1));

  const samePerRowIdExceptSlug = after.every((row) => {
    const o = existingById.get(row.id);
    if (!o) return false;
    return (
      o.day_of_week === row.day_of_week &&
      normQty(o.quantity) === normQty(row.quantity) &&
      stableStringify(o.customizations) === stableStringify(row.customizations)
    );
  });
  if (!samePerRowIdExceptSlug) return false;

  const signature = (c: ExistingDayConfig) => `${c.bowl_slug}|${normQty(c.quantity)}`;
  const sortSig = (rows: ExistingDayConfig[]) => [...rows.map(signature)].sort().join('||');
  return sortSig(before) === sortSig(after);
}

async function syncEditableUpcomingOrders(params: {
  subscriptionId: string;
  dayConfigs: ExistingDayConfig[];
  bowlNameBySlug: Map<string, string>;
}) {
  const { subscriptionId, dayConfigs, bowlNameBySlug } = params;
  const configsByDay = new Map<string, ExistingDayConfig[]>();
  for (const cfg of dayConfigs) {
    const key = String(cfg.day_of_week ?? '').toLowerCase();
    const bucket = configsByDay.get(key) ?? [];
    bucket.push(cfg);
    configsByDay.set(key, bucket);
  }

  const { data: upcomingOrders, error: ordersErr } = await adminSupabase
    .from('orders')
    .select(`
      id,
      delivery_date,
      delivery_time_slot,
      status,
      order_items ( id, bowl_slug, bowl_name, quantity, customizations )
    `)
    .eq('subscription_id', subscriptionId)
    .in('status', ['pending', 'confirmed']);

  if (ordersErr) {
    throw new Error(`Failed to load upcoming orders for sync: ${ordersErr.message}`);
  }

  const editableOrders = ((upcomingOrders ?? []) as EditableOrder[]).filter((order) =>
    isOrderEditableByCustomer(order),
  );

  for (const order of editableOrders) {
    const daySlug = daySlugFromDate(order.delivery_date);
    const desired = configsByDay.get(daySlug) ?? [];
    const existingItems = Array.isArray(order.order_items) ? order.order_items : [];
    if (!desired.length || !existingItems.length) continue;
    const pairCount = Math.min(existingItems.length, desired.length);

    for (let i = 0; i < pairCount; i += 1) {
      const target = desired[i];
      const item = existingItems[i];
      const bowlSlug = target.bowl_slug;
      const bowlName = bowlNameBySlug.get(bowlSlug) ?? bowlSlug;
      const quantity = Math.max(1, Math.trunc(target.quantity ?? item.quantity ?? 1));

      const { error: itemErr } = await adminSupabase
        .from('order_items')
        .update({
          bowl_slug: bowlSlug,
          bowl_name: bowlName,
          quantity,
          customizations: target.customizations ?? [],
        })
        .eq('id', item.id)
        .eq('order_id', order.id);

      if (itemErr) {
        throw new Error(`Failed to sync order item ${item.id}: ${itemErr.message}`);
      }
    }
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = params;

  const body = await req.json();
  const { dayConfigs }: { dayConfigs: DayConfigUpdate[] } = body;

  // Validate body
  if (!Array.isArray(dayConfigs) || dayConfigs.length === 0) {
    return NextResponse.json({ error: 'dayConfigs must be a non-empty array' }, { status: 422 });
  }
  for (const dc of dayConfigs) {
    if (
      typeof dc.id !== 'string' || !dc.id ||
      typeof dc.bowl_slug !== 'string' || !dc.bowl_slug
    ) {
      return NextResponse.json(
        { error: 'Each dayConfig must have id and bowl_slug as non-empty strings' },
        { status: 422 }
      );
    }
  }

  // Fetch subscription with plan, day configs, and address for repricing
  const { data: sub, error: fetchErr } = await adminSupabase
    .from('subscriptions')
    .select(`
      id,
      plan_id,
      payment_status,
      total_amount_rs,
      subscription_plans:plan_id (name, slug, price_per_bowl),
      subscription_day_configs (*),
      addresses:delivery_address_id (pincode, lat, lng)
    `)
    .eq('id', id)
    .single();

  if (fetchErr || !sub) {
    return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });
  }

  const existingConfigs = (sub.subscription_day_configs as ExistingDayConfig[]) ?? [];
  if (!existingConfigs.length) {
    return NextResponse.json({ error: 'No day configs found for subscription' }, { status: 400 });
  }

  // Validate ids and canonicalize incoming slugs against existing rows.
  const existingById = new Map(existingConfigs.map((c) => [c.id, c]));
  const requestedUpdates: Array<{ id: string; bowl_slug: string }> = [];
  for (const dc of dayConfigs) {
    const existing = existingById.get(dc.id);
    if (!existing) {
      return NextResponse.json({ error: `Day config ${dc.id} does not belong to this subscription` }, { status: 422 });
    }
    requestedUpdates.push({ id: dc.id, bowl_slug: dc.bowl_slug.trim() });
  }

  const updateMap = new Map(requestedUpdates.map((dc) => [dc.id, dc.bowl_slug]));
  const updatedConfigRows: ExistingDayConfig[] = existingConfigs.map((c) => ({
    ...c,
    bowl_slug: updateMap.get(c.id) ?? c.bowl_slug,
  }));

  // Build updated day configs for repricing (merge edits into existing configs)
  const updatedConfigs = updatedConfigRows.map((c) => ({
    bowlId: c.bowl_slug,
    day: c.day_of_week,
    quantity: c.quantity,
    customizations: Array.isArray(c.customizations) ? c.customizations : [],
  }));

  // Reprice FIRST — fail fast before writing anything to the DB
  let newTotal: number;
  try {
    const addr = sub.addresses as any;
    const addrRecord = addr
      ? { pincode: addr.pincode ?? null, lat: addr.lat ?? null, lng: addr.lng ?? null }
      : {};
    const planSlug = (sub.subscription_plans as any)?.slug ?? sub.plan_id;

    const quote = await buildSubscriptionQuote(planSlug, addrRecord, updatedConfigs);
    newTotal = roundCurrency(quote.totalAmountRs);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to calculate new price';
    return NextResponse.json({ error: `Repricing failed: ${message}` }, { status: 500 });
  }

  const oldTotal = roundCurrency(Number(sub.total_amount_rs ?? 0));
  const quotedTotal = newTotal;
  const pureBowlPermutation = isPureBowlPermutation(existingConfigs, updatedConfigRows, existingById);
  // Same bowl inventory across days (only slugs permuted on fixed rows): do not wallet-adjust;
  // live quote can differ from stored total due to delivery/pricing drift.
  if (pureBowlPermutation) {
    newTotal = oldTotal;
  }
  const delta = roundCurrency(newTotal - oldTotal);
  const shouldAdjustWallet = Math.abs(delta) >= 0.01;

  console.info('[admin/subscription bowls] repricing diagnostics', {
    subscriptionId: id,
    paymentStatus: sub.payment_status,
    oldTotalRs: oldTotal,
    quotedTotalRs: quotedTotal,
    newTotalRs: newTotal,
    deltaRs: delta,
    pure_bowl_permutation: pureBowlPermutation,
    wallet_skipped_reason: pureBowlPermutation ? 'same_bowl_inventory_per_row_cust_unchanged' : null,
    updatedDayConfigs: updatedConfigRows.map((cfg) => ({
      id: cfg.id,
      day: cfg.day_of_week,
      bowl_slug: cfg.bowl_slug,
      quantity: cfg.quantity,
      hasCustomizations: Array.isArray(cfg.customizations) && cfg.customizations.length > 0,
    })),
  });

  // Update each day config row; rollback if pricing RPC fails later.
  const rollbackRows = requestedUpdates.map((dc) => ({
    id: dc.id,
    bowl_slug: existingById.get(dc.id)?.bowl_slug ?? dc.bowl_slug,
  }));

  for (const dc of requestedUpdates) {
    const { error: updateErr } = await adminSupabase
      .from('subscription_day_configs')
      // Persist only columns that exist in subscription_day_configs.
      .update({ bowl_slug: dc.bowl_slug })
      .eq('id', dc.id)
      .eq('subscription_id', id);

    if (updateErr) {
      return NextResponse.json(
        { error: `Failed to update day config ${dc.id}: ${updateErr.message}` },
        { status: 500 }
      );
    }
  }

  if (shouldAdjustWallet) {
    const { error: rpcErr } = await adminSupabase.rpc('adjust_subscription_bowl_pricing', {
      p_subscription_id: id,
      p_new_total_rs: newTotal,
    });

    if (rpcErr) {
      for (const row of rollbackRows) {
        await adminSupabase
          .from('subscription_day_configs')
          .update({ bowl_slug: row.bowl_slug })
          .eq('id', row.id)
          .eq('subscription_id', id);
      }
      return NextResponse.json({
        error: rpcErr.message,
        context: {
          old_total_rs: oldTotal,
          new_total_rs: newTotal,
          delta_rs: delta,
          rollback_applied: true,
        },
      }, { status: 400 });
    }
  } else {
    console.info('[admin/subscription bowls] skipped wallet repricing (near-zero delta)', {
      subscriptionId: id,
      oldTotalRs: oldTotal,
      newTotalRs: newTotal,
      deltaRs: delta,
    });
  }

  let syncWarning: string | null = null;
  // Keep generated future orders aligned with latest day-config bowl mapping.
  try {
    const allBowls = await getAllBowls();
    const bowlNameBySlug = new Map(allBowls.map((b) => [b.slug, b.name]));
    await syncEditableUpcomingOrders({
      subscriptionId: id,
      dayConfigs: updatedConfigRows,
      bowlNameBySlug,
    });
  } catch (syncErr) {
    syncWarning = syncErr instanceof Error ? syncErr.message : 'Failed to sync upcoming orders';
    console.error('[admin/subscription bowls] order sync warning', { subscriptionId: id, warning: syncWarning });
  }

  // Re-fetch final state including plan for UI merge
  const { data: updated, error: refetchErr } = await adminSupabase
    .from('subscriptions')
    .select('*, subscription_plans:plan_id (name, slug, price_per_bowl), subscription_day_configs (*)')
    .eq('id', id)
    .single();

  if (refetchErr || !updated) {
    return NextResponse.json({ error: 'Could not re-fetch subscription' }, { status: 500 });
  }

  return NextResponse.json({
    subscription: updated,
    pricing: {
      old_total_rs: oldTotal,
      new_total_rs: newTotal,
      quoted_total_rs: quotedTotal,
      delta_rs: delta,
      wallet_adjusted: shouldAdjustWallet,
      pure_bowl_permutation: pureBowlPermutation,
    },
    ...(syncWarning ? { sync_warning: syncWarning } : {}),
  });
}
