import { NextRequest, NextResponse } from 'next/server';
import { verifyAdmin } from '@/lib/admin-auth';
import { adminSupabase } from '@/lib/supabase/admin';
import { sendBrevoEmail } from '@/lib/brevo';
import { getNextDateForDayOfWeek, scheduleDeliveryDates } from '@/lib/subscription';

const ALLOWED_PAYMENT_STATUSES = new Set(['pending', 'paid', 'failed', 'refunded']);
const ALLOWED_SUBSCRIPTION_STATUSES = new Set(['pending', 'active', 'paused', 'cancelled', 'expired']);

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
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
  const { data: oldSub } = await adminSupabase
    .from('subscriptions')
    .select(`
      *,
      users:user_id (email, full_name),
      subscription_plans:plan_id (name, price_per_bowl),
      subscription_day_configs (*)
    `)
    .eq('id', id)
    .single();

  if (!oldSub) {
    return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });
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
      const unitPrice = oldSub.subscription_plans?.price_per_bowl ?? 0;

      // Compute all delivery dates together with rolling-window cutoff logic.
      // This ensures a Monday approved at 10 PM skips Monday and starts from Tuesday,
      // with the missed Monday pushed to next Monday instead of being lost.
      const daySlugList = oldSub.subscription_day_configs.map((c: { day_of_week: string }) => c.day_of_week);
      const dateMap = scheduleDeliveryDates(daySlugList);

      for (const config of oldSub.subscription_day_configs) {
        try {
          const deliveryDate = dateMap[config.day_of_week] ?? getNextDateForDayOfWeek(config.day_of_week);
          const bowls = [{
            bowl_slug: config.bowl_slug,
            bowl_name: config.bowl_slug,
            quantity: config.quantity,
            unit_price: unitPrice
          }];

          await adminSupabase.rpc('create_subscription_delivery', {
            p_subscription_id: id,
            p_delivery_date: deliveryDate,
            p_delivery_time_slot: config.delivery_time_slot ?? oldSub.delivery_time_slot,
            p_bowls: bowls
          });
        } catch (autoGenErr) {
          console.error(`Failed to auto-generate spread order for day config: ${config.id}`, autoGenErr);
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
