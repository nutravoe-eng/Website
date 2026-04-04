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


// Cutoff hour in IST: if the current time is at or past this hour,
// today's delivery cannot be accommodated — start from the next eligible day.
const DELIVERY_CUTOFF_HOUR_IST = 21; // 9:00 PM

/**
 * Given a list of delivery day slugs (e.g. ['mon', 'wed', 'fri']),
 * returns a sorted list of YYYY-MM-DD dates using a rolling window:
 *
 * 1. Find the first eligible day from now, respecting the 9 PM cutoff.
 * 2. From that anchor, walk the sorted days forward, wrapping into
 *    the next week as needed.
 *
 * Example: Days = [Mon, Wed, Fri]. Approved Sunday 10 PM.
 *   - Monday is tomorrow but after cutoff for same-day → still eligible (tomorrow)
 *   - Result: Mon this week, Wed, Fri, (no wrap needed)
 *
 * Example: Days = [Mon, Wed, Fri]. Approved Monday 10 PM.
 *   - Monday has passed cutoff today → skip to Wed
 *   - Result: Wed this week, Fri, Mon next week
 */
export function scheduleDeliveryDates(daySlugList: string[]): Record<string, string> {
  const DAY_INDEX: Record<string, number> = {
    sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
  };

  // Normalise and sort the day slugs by their weekday index
  const sortedDays = [...daySlugList]
    .map(d => d.substring(0, 3).toLowerCase())
    .filter(d => d in DAY_INDEX)
    .sort((a, b) => DAY_INDEX[a] - DAY_INDEX[b]);

  if (sortedDays.length === 0) return {};

  // Current IST time
  const nowIST = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const todayIdx = nowIST.getDay(); // 0=Sun, 1=Mon, ...
  const currentHour = nowIST.getHours();

  // Determine the earliest date we can schedule:
  // - If current hour < cutoff → today is still eligible
  // - If current hour >= cutoff → earliest is tomorrow
  const earliestOffset = currentHour >= DELIVERY_CUTOFF_HOUR_IST ? 1 : 0;
  const earliestDate = new Date(nowIST);
  earliestDate.setDate(nowIST.getDate() + earliestOffset);
  const earliestDayIdx = earliestDate.getDay();

  // Find which of the sorted days to start from (first day >= earliestDayIdx IN THIS WEEK)
  // If none qualify this week, wrap to next week starting from the first day.
  let startPos = sortedDays.findIndex(d => DAY_INDEX[d] >= earliestDayIdx);
  let weekOffset = 0;
  if (startPos === -1) {
    // All days are earlier in the week than today's cutoff — wrap to next week
    startPos = 0;
    weekOffset = 1;
  }

  // Generate one date per day, rolling forward from the anchor
  const result: Record<string, string> = {};
  for (let i = 0; i < sortedDays.length; i++) {
    const daySlug = sortedDays[(startPos + i) % sortedDays.length];
    // After we've wrapped past the end of the sortedDays array, we're in next week
    if ((startPos + i) >= sortedDays.length) weekOffset = 1;

    const targetDayIdx = DAY_INDEX[daySlug];
    // Days from today's date (not earliestDate) to the target in this calendar week
    let daysFromToday = targetDayIdx - todayIdx + weekOffset * 7;
    // Handle the case where targetDayIdx is earlier in the week but weekOffset hasn't fired yet
    if (daysFromToday < earliestOffset) daysFromToday += 7;

    const deliveryDate = new Date(nowIST);
    deliveryDate.setDate(nowIST.getDate() + daysFromToday);

    const y = deliveryDate.getFullYear();
    const m = String(deliveryDate.getMonth() + 1).padStart(2, '0');
    const d = String(deliveryDate.getDate()).padStart(2, '0');
    result[daySlug] = `${y}-${m}-${d}`;
  }

  return result;
}

/**
 * @deprecated Use scheduleDeliveryDates() for new spread subscription generation.
 * Kept for backward compatibility with any single-day callers.
 */
export function getNextDateForDayOfWeek(daySlug: string): string {
  const dates = scheduleDeliveryDates([daySlug]);
  const key = daySlug.substring(0, 3).toLowerCase();
  return dates[key] ?? (() => { throw new Error(`Invalid day slug: ${daySlug}`); })();
}

