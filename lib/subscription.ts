import { createClient } from '@/lib/supabase/client';
import type { Subscription, DayBowlConfig } from '@/types';
import { STUB_PLANS as PLANS, type PlanConfig } from '@/app/subscribe/PlanCard';

// Map Supabase day_of_week enum to the app's DayBowlConfig day type
function mapDay(d: string): DayBowlConfig['day'] {
  const map: Record<string, DayBowlConfig['day']> = {
    mon: 'Mon',
    tue: 'Tue',
    wed: 'Wed',
    thu: 'Thu',
    fri: 'Fri',
    sat: 'Sat',
    sun: 'Sun',
  };
  return map[d] ?? 'Mon';
}

export async function getActiveSubscription(): Promise<Subscription | null> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: sub, error } = await supabase
    .from('subscriptions')
    .select('*, subscription_plans ( slug )')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !sub) return null;

  const { data: dayConfigRows } = await supabase
    .from('subscription_day_configs')
    .select('*')
    .eq('subscription_id', sub.id);

  const dayConfigs: DayBowlConfig[] = (dayConfigRows ?? []).map(row => ({
    day: mapDay(row.day_of_week),
    bowlId: row.bowl_slug,
    bowlName: row.bowl_slug,
    quantity: row.quantity,
  }));

  const planSlug = sub.subscription_plans?.slug ?? sub.plan_id;

  const subscription: Subscription = {
    id: sub.id,
    planId: planSlug,
    deliveryStyle: sub.style,
    billingCycle: sub.billing_cycle ?? 'weekly',
    status: sub.status,
    weeklyPrice: 0,
    nextDelivery: sub.start_date ?? new Date().toISOString(),
    startDate: sub.start_date,
    deliveryTimeSlot: sub.delivery_time_slot ?? undefined,
    dayConfigs,
    bulkDeliveryDay: sub.bulk_delivery_date ?? undefined,
    walletBalancePaise: sub.wallet_balance_rs != null ? sub.wallet_balance_rs * 100 : 0,
    deliveryAddress: '',
    createdAt: sub.created_at,
  } as Subscription;

  return subscription;
}

export async function getActivePlanConfig(): Promise<PlanConfig | null> {
  const sub = await getActiveSubscription();
  if (!sub) return null;
  return PLANS.find(p => p.id === sub.planId) ?? null;
}
