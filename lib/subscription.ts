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


// End of morning delivery window. After this hour, morning (7–10 AM) deliveries
// for today are no longer achievable. Used for same-day eligibility checks.
const MORNING_WINDOW_END_HOUR = 10;

// Hours of prep needed for same-day non-morning delivery slots.
const SAME_DAY_PREP_HOURS = 2;

/**
 * Parse the start hour from a time slot string like "2:00 PM - 3:00 PM" → 14.
 * Returns null if the slot string cannot be parsed.
 */
function parseSlotStartHour(slot: string | null | undefined): number | null {
  if (!slot) return null;
  const part = slot.split('-')[0].trim();
  const match = part.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!match) return null;
  let h = parseInt(match[1]);
  const meridiem = match[3].toUpperCase();
  if (meridiem === 'PM' && h !== 12) h += 12;
  if (meridiem === 'AM' && h === 12) h = 0;
  return h;
}

/**
 * Given the current IST hour and a day's delivery time slot, determine whether
 * today is still a viable delivery date for that day.
 *
 * Rules:
 *  - Before 10 AM: always eligible (morning window still open).
 *  - At/after 10 AM with a non-morning slot: eligible only if slot starts
 *    more than SAME_DAY_PREP_HOURS from now.
 *  - At/after 10 AM with a morning slot (or no slot): ineligible today.
 */
function canDeliverTodayForSlot(currentHour: number, slotHour: number | null): boolean {
  if (currentHour < MORNING_WINDOW_END_HOUR) return true;
  if (slotHour !== null && slotHour >= MORNING_WINDOW_END_HOUR && slotHour > currentHour + SAME_DAY_PREP_HOURS) return true;
  return false;
}

/**
 * Given a list of day configs (each with a day slug and optional time slot),
 * returns a map of { daySlug → YYYY-MM-DD } for each scheduled delivery.
 *
 * Each day is evaluated independently:
 *  - If the day is today: check whether today's slot is still achievable.
 *    If yes → schedule for today.
 *    If no  → schedule for NEXT occurrence of that day (next week).
 *  - If the day is a future weekday: schedule for the nearest upcoming date.
 *  - If the day has already passed this week: schedule for next week.
 *
 * Edge case handled: admin approves Monday at 11 AM for a Monday 2 PM slot →
 * Monday is correctly scheduled for today (not next Monday) because the slot
 * is still 3 hours away with a 2-hour buffer.
 */
export function scheduleDeliveryDates(
  dayConfigs: Array<{ day: string; timeSlot?: string | null }>,
  forceToday: boolean = false
): Record<string, string> {
  const DAY_INDEX: Record<string, number> = {
    sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
  };

  const nowIST = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const todayIdx = nowIST.getDay();
  const currentHour = nowIST.getHours();

  const result: Record<string, string> = {};

  for (const config of dayConfigs) {
    const daySlug = config.day.substring(0, 3).toLowerCase();
    if (!(daySlug in DAY_INDEX)) continue;

    const targetIdx = DAY_INDEX[daySlug];
    const slotHour = parseSlotStartHour(config.timeSlot);

    let daysToAdd: number;

    if (targetIdx === todayIdx) {
      // This delivery day is today — check if slot is still achievable
      if (forceToday || canDeliverTodayForSlot(currentHour, slotHour)) {
        daysToAdd = 0; // deliver today
      } else {
        daysToAdd = 7; // today's window passed — next occurrence is next week
      }
    } else {
      // Future or past day this week
      daysToAdd = targetIdx - todayIdx;
      if (daysToAdd < 0) daysToAdd += 7; // already passed this week → next week
    }

    const date = new Date(nowIST);
    date.setDate(nowIST.getDate() + daysToAdd);

    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    result[daySlug] = `${y}-${m}-${d}`;
  }

  return result;
}

/**
 * @deprecated Use scheduleDeliveryDates() for new spread subscription generation.
 * Kept for backward compatibility with any single-day callers.
 */
export function getNextDateForDayOfWeek(daySlug: string): string {
  const dates = scheduleDeliveryDates([{ day: daySlug }]);
  const key = daySlug.substring(0, 3).toLowerCase();
  return dates[key] ?? (() => { throw new Error(`Invalid day slug: ${daySlug}`); })();
}

