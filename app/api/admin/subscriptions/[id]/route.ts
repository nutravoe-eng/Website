import { NextRequest, NextResponse } from 'next/server';
import { verifyAdmin } from '@/lib/admin-auth';
import { adminSupabase } from '@/lib/supabase/admin';
import { sendBrevoEmail } from '@/lib/brevo';
import { getNextDateForDayOfWeek, scheduleDeliveryDates } from '@/lib/subscription';
import { buildSubscriptionQuote } from '@/lib/checkout-security';
import { getAllBowls } from '@/lib/sanity';
import { requestOriginReferrer } from '@/lib/ola-maps';

const ALLOWED_PAYMENT_STATUSES = new Set(['pending', 'paid', 'failed', 'refunded']);
const ALLOWED_SUBSCRIPTION_STATUSES = new Set(['pending', 'active', 'paused', 'cancelled', 'expired']);

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = params;
  const body = await req.json();
  const {
    payment_status,
    payment_reference,
    admin_notes,
    status,
  }: {
    payment_status?: string;
    payment_reference?: string | null;
    admin_notes?: string | null;
    status?: string;
  } = body;

  if (payment_status !== undefined && !ALLOWED_PAYMENT_STATUSES.has(payment_status)) {
    return NextResponse.json({ error: 'Invalid payment status' }, { status: 422 });
  }

  if (status !== undefined && !ALLOWED_SUBSCRIPTION_STATUSES.has(status)) {
    return NextResponse.json({ error: 'Invalid subscription status' }, { status: 422 });
  }

  if (payment_reference !== undefined && payment_reference !== null && (typeof payment_reference !== 'string' || payment_reference.length > 200)) {
    return NextResponse.json({ error: 'payment_reference must be a string under 200 characters' }, { status: 422 });
  }

  if (admin_notes !== undefined && admin_notes !== null && (typeof admin_notes !== 'string' || admin_notes.length > 2000)) {
    return NextResponse.json({ error: 'admin_notes must be a string under 2000 characters' }, { status: 422 });
  }

  // Pre-fetch old subscription to detect status changes for emails and get configs for auto-generation
  // NOTE: we also join addresses so the re-pricing step uses the correct delivery zone.
  const { data: oldSub } = await adminSupabase
    .from('subscriptions')
    .select(`
      *,
      users:user_id (email, full_name),
      subscription_plans:plan_id (name, price_per_bowl, slug),
      subscription_day_configs (*),
      addresses:delivery_address_id (pincode, lat, lng)
    `)
    .eq('id', id)
    .single();

  if (!oldSub) {
    return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });
  }

  /** Paid subscription being cancelled: reverse subscription_payment + linked top-up wallet lots, cancel top-up requests */
  const isCancellingPaidSubscription =
    status === 'cancelled' && oldSub.payment_status === 'paid';

  if (isCancellingPaidSubscription) {
    const { data: revRows, error: revError } = await adminSupabase.rpc('reverse_subscription_payment_credit', {
      p_subscription_id: id,
      p_note: typeof admin_notes === 'string' ? admin_notes : null,
    });

    if (revError) {
      return NextResponse.json({ error: revError.message }, { status: 400 });
    }

    const rev = (Array.isArray(revRows) ? revRows[0] : revRows) as {
      reversed_rs?: number | string;
      new_wallet_balance_rs?: number | string;
    } | null;

    const reversedRs = rev?.reversed_rs != null ? Number(rev.reversed_rs) : 0;
    const newWalletBalanceRs = rev?.new_wallet_balance_rs != null ? Number(rev.new_wallet_balance_rs) : 0;

    if (admin_notes !== undefined || payment_reference !== undefined) {
      const extra: Record<string, unknown> = {};
      if (admin_notes !== undefined) extra.admin_notes = admin_notes;
      if (payment_reference !== undefined) extra.payment_reference = payment_reference;
      if (Object.keys(extra).length > 0) {
        await adminSupabase.from('subscriptions').update(extra).eq('id', id);
      }
    }

    const { data: subscription, error: fetchErr } = await adminSupabase
      .from('subscriptions')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchErr || !subscription) {
      return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });
    }

    return NextResponse.json({
      subscription,
      wallet_reversal: {
        reversed_rs: reversedRs,
        new_wallet_balance_rs: newWalletBalanceRs,
      },
    });
  }

  // 1. Apply non-payment updates immediately (notes, status changes that aren't approval)
  const safeUpdates: Record<string, unknown> = {};
  if (payment_reference !== undefined) safeUpdates.payment_reference = payment_reference;
  if (admin_notes !== undefined) safeUpdates.admin_notes = admin_notes;
  // Only persist status if it's NOT a payment approval (that's handled below with the RPC guard)
  if (status !== undefined && payment_status !== 'paid') safeUpdates.status = status;

  if (Object.keys(safeUpdates).length > 0) {
    const { error: updateError } = await adminSupabase
      .from('subscriptions')
      .update(safeUpdates)
      .eq('id', id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }
  }

  // 2. Run payment approval RPC FIRST, then commit paid status only on success
  if (payment_status === 'paid' && oldSub.payment_status !== 'paid') {
    // RE-CALCULATE PRICING — always recompute before crediting the wallet
    // so total_amount_rs reflects the real payable amount including ingredient extras.
    // addresses is now joined above, so zone detection is accurate.
    try {
      const addr = oldSub.addresses as any;
      const addrRecord = addr
        ? { pincode: addr.pincode ?? null, lat: addr.lat ?? null, lng: addr.lng ?? null }
        : {};

      const planSlug = (oldSub.subscription_plans as any)?.slug ?? oldSub.plan_id;
      const dayConfigs = (oldSub.subscription_day_configs || []).map((c: any) => ({
        day: c.day_of_week ?? undefined,
        bowlId: c.bowl_slug,
        customizations: Array.isArray(c.customizations) ? c.customizations : [],
      }));

      const quote = await buildSubscriptionQuote(planSlug, addrRecord, dayConfigs, {
        httpReferrer: requestOriginReferrer(req),
      });

      if (quote.totalAmountRs !== oldSub.total_amount_rs) {
        console.log(`Correcting sub ${id} total_amount_rs: ${oldSub.total_amount_rs} → ${quote.totalAmountRs}`);
        await adminSupabase
          .from('subscriptions')
          .update({ total_amount_rs: quote.totalAmountRs })
          .eq('id', id);
        oldSub.total_amount_rs = quote.totalAmountRs;
      }
    } catch (err) {
      console.error('Failed to recompute quote before approval:', err);
      // Non-fatal: proceed with stored total_amount_rs
    }

    const { data: approval, error: approvalError } = await adminSupabase.rpc('approve_subscription_payment', {
      p_subscription_id: id,
      p_payment_reference: payment_reference ?? null,
      p_admin_notes: admin_notes ?? null,
    });

    if (approvalError) {
      const statusCode = approvalError.message.includes('already approved') ? 409 : 400;
      return NextResponse.json({ error: approvalError.message }, { status: statusCode });
    }

    void approval; // used by RPC, suppress unused warning

    // The RPC already sets payment_status='paid' and status='active' internally.
    // Only persist additional admin-supplied status override if it differs.
    if (status !== undefined && status !== 'active') {
      await adminSupabase
        .from('subscriptions')
        .update({ status })
        .eq('id', id);
    }

    // --- SPREAD AUTOGENERATION LOGIC ---
    if (oldSub.style === 'spread' && Array.isArray(oldSub.subscription_day_configs) && oldSub.subscription_day_configs.length > 0) {
      const unitPrice = (oldSub.subscription_plans as any)?.price_per_bowl ?? 0;

      // Compute all delivery dates together with rolling-window cutoff logic.
      const daySlugList = oldSub.subscription_day_configs.map((c: { day_of_week: string; delivery_time_slot: string | null }) => ({
        day: c.day_of_week,
        timeSlot: c.delivery_time_slot ?? oldSub.delivery_time_slot ?? null,
      }));
      const dateMap = scheduleDeliveryDates(daySlugList);

      // Group configs by day_of_week — one order per delivery day, all bowls as line items.
      // Without this, multiple bowl types on the same day each try to create a separate order
      // and every one after the first fails with "delivery already recorded".
      const configsByDay: Record<string, typeof oldSub.subscription_day_configs> = {};
      for (const config of oldSub.subscription_day_configs) {
        const key = config.day_of_week;
        if (!configsByDay[key]) configsByDay[key] = [];
        configsByDay[key].push(config);
      }

      for (const [daySlug, dayConfigs] of Object.entries(configsByDay)) {
        const deliveryDate = dateMap[daySlug] ?? getNextDateForDayOfWeek(daySlug);
        const bowls = dayConfigs.map((config: any) => ({
          bowl_slug: config.bowl_slug,
          bowl_name: config.bowl_name ?? config.bowl_slug,
          quantity: config.quantity,
          unit_price: unitPrice,
          customization_unit_price: config.customization_cost_rs ?? 0,
          customizations: config.customizations ?? [],
        }));
        // Use time slot from first config for this day (they share a day so same slot)
        const deliveryTimeSlot = dayConfigs[0].delivery_time_slot ?? oldSub.delivery_time_slot;

        const { error: rpcError } = await adminSupabase.rpc('create_subscription_delivery', {
          p_subscription_id: id,
          p_delivery_date: deliveryDate,
          p_delivery_time_slot: deliveryTimeSlot,
          p_bowls: bowls,
          p_status: 'confirmed',
        });

        if (rpcError) {
          console.error(`Auto-gen failed for ${daySlug} (${deliveryDate}): ${rpcError.message}`);
          // Non-fatal — continue creating other days
        }
      }
    }
    // ------------------------------------
  }

  // Re-fetch the final state

  const { data: subscription, error: fetchError } = await adminSupabase
    .from('subscriptions')
    .select('*')
    .eq('id', id)
    .single();

  if (fetchError || !subscription) {
    return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });
  }

  // Trigger Brevo approval email if status changed to active
  if (oldSub.status !== 'active' && subscription.status === 'active' && process.env.BREVO_SUBSCRIPTION_APPROVED_TEMPLATE_ID) {
    // Note: The users join returns an object but TS thinks it could be an array due to Supabase type generation quirks without generics. Use 'any' cast for safety here.
    const user = oldSub.users as any;
    const plan = oldSub.subscription_plans as any;
    if (user && user.email) {
      await sendBrevoEmail({
        toEmail: user.email,
        toName: user.full_name || 'Nutritionist',
        templateId: Number(process.env.BREVO_SUBSCRIPTION_APPROVED_TEMPLATE_ID),
        params: {
          subscription_id: subscription.id,
          user_name: user.full_name ? user.full_name.split(' ')[0] : 'there',
          plan_name: plan?.name || 'Custom Plan',
          total_amount: subscription.total_amount_rs,
          delivery_style: subscription.style,
          style_message: subscription.style === 'flexible'
            ? "Your wallet balance has been updated! You can now place orders flexibly according to your needs."
            : "Sit back and relax, we'll deliver the bowls at your scheduled day and time."
        }
      });
    }
  }

  return NextResponse.json({ subscription });
}
