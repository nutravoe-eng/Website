import {
  NUTRAVOE_TIMEZONE,
  getIstDateTimeParts,
  getIstHour,
  getIstYearMonth,
  parseIstYmd,
} from "@/lib/datetime-ist";

export type DeliveryMode = "asap" | "scheduled";

export interface DeliveryPolicy {
  asapEnabled: boolean;
  blackoutStartIso: string | null;
  blackoutEndIso: string | null;
  disabledSlotKeys: string[];
  blackoutExemptSlotKeys: string[];
}

export const DEFAULT_DELIVERY_POLICY: DeliveryPolicy = {
  asapEnabled: true,
  blackoutStartIso: null,
  blackoutEndIso: null,
  disabledSlotKeys: [],
  blackoutExemptSlotKeys: [],
};

/** Nutravoe delivery window: 7 AM–3 PM IST (slots start at 7, last slot 2–3 PM). */
export const BUSINESS_HOURS = {
  firstSlotHour: 7,
  lastHourExclusive: 15,
  earlyMorningFirstHour: 7,
  earlyMorningLastBookableHour: 9,
  orderEarlyMorningByHour: 23,
  tomorrowLateEarliestHour: 10,
  displayWindow: "7 AM–3 PM",
  displayWindowPlain: "7 AM-3 PM",
  earlyMorningWindow: "7–10 AM",
  sameDayCutoffDisplay: "3 PM",
} as const;

export const DELIVERY_POLICY_CONSTANTS = {
  asapOpenHour: BUSINESS_HOURS.firstSlotHour,
  sameDayCutoffHour: BUSINESS_HOURS.lastHourExclusive,
  firstSameDaySlotHour: BUSINESS_HOURS.firstSlotHour,
  lastDeliveryHour: BUSINESS_HOURS.lastHourExclusive,
  tomorrowEarlySlotCutoffHour: BUSINESS_HOURS.orderEarlyMorningByHour,
  tomorrowEarliestHour: BUSINESS_HOURS.firstSlotHour,
  tomorrowLateEarliestHour: BUSINESS_HOURS.tomorrowLateEarliestHour,
};

const SLOT_HOUR_COUNT = BUSINESS_HOURS.lastHourExclusive - BUSINESS_HOURS.firstSlotHour;

export interface GeneratedSlot {
  label: string;
  key: string;
}

function parseHourLabel(hour24: number): string {
  if (hour24 === 0) return "12:00 AM";
  if (hour24 < 12) return `${String(hour24).padStart(2, "0")}:00 AM`;
  if (hour24 === 12) return "12:00 PM";
  return `${hour24 - 12}:00 PM`;
}

export function getNowIst(): Date {
  // Return the real current instant. All IST calendar/hour reads must be derived
  // explicitly via Intl using Nutravoe's business timezone.
  return new Date();
}

export function getIstDateIso(base: Date): string {
  const parts = getIstDateTimeParts(base);
  const y = parts.year;
  const m = parts.month;
  const d = parts.day;
  return `${y}-${m}-${d}`;
}

function addDays(dateIso: string, days: number): string {
  const [y, m, d] = dateIso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  const ny = dt.getUTCFullYear();
  const nm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const nd = String(dt.getUTCDate()).padStart(2, "0");
  return `${ny}-${nm}-${nd}`;
}

export function buildSlotKey(dateIso: string, startHour24: number): string {
  return `${dateIso}|${String(startHour24).padStart(2, "0")}`;
}

function slotStartIso(dateIso: string, startHour24: number): string {
  return `${dateIso}T${String(startHour24).padStart(2, "0")}:00:00+05:30`;
}

function isBlockedByBlackout(policy: DeliveryPolicy, dateIso: string, startHour24: number): boolean {
  if (!policy.blackoutStartIso || !policy.blackoutEndIso) return false;
  const slotKey = buildSlotKey(dateIso, startHour24);
  if (policy.blackoutExemptSlotKeys.includes(slotKey)) return false;
  const start = new Date(policy.blackoutStartIso).getTime();
  const end = new Date(policy.blackoutEndIso).getTime();
  const slotStart = new Date(slotStartIso(dateIso, startHour24)).getTime();
  return slotStart >= start && slotStart < end;
}

function isDisabled(policy: DeliveryPolicy, dateIso: string, startHour24: number): boolean {
  return policy.disabledSlotKeys.includes(buildSlotKey(dateIso, startHour24));
}

function formatSlotLabel(prefix: "Today" | "Tomorrow", startHour24: number): string {
  return `${prefix}, ${parseHourLabel(startHour24)} - ${parseHourLabel(startHour24 + 1)}`;
}

export function generateScheduledSlots(policy: DeliveryPolicy, nowIst: Date = getNowIst()): GeneratedSlot[] {
  return generateScheduledSlotsWithOptions(policy, nowIst);
}

export function generateScheduledSlotsWithOptions(
  policy: DeliveryPolicy,
  nowIst: Date = getNowIst(),
  options: { ignoreBlackout?: boolean; ignoreDisabled?: boolean } = {},
): GeneratedSlot[] {
  const slots: GeneratedSlot[] = [];
  const currentHour = getIstHour(nowIst);
  const todayIso = getIstDateIso(nowIst);
  const tomorrowIso = addDays(todayIso, 1);

  if (currentHour < DELIVERY_POLICY_CONSTANTS.sameDayCutoffHour) {
    const todayStartHour =
      currentHour < DELIVERY_POLICY_CONSTANTS.asapOpenHour
        ? DELIVERY_POLICY_CONSTANTS.firstSameDaySlotHour
        : currentHour + 1;
    for (
      let hour = Math.max(DELIVERY_POLICY_CONSTANTS.firstSameDaySlotHour, todayStartHour);
      hour < DELIVERY_POLICY_CONSTANTS.lastDeliveryHour;
      hour += 1
    ) {
      if (!options.ignoreBlackout && isBlockedByBlackout(policy, todayIso, hour)) continue;
      if (!options.ignoreDisabled && isDisabled(policy, todayIso, hour)) continue;
      slots.push({
        key: buildSlotKey(todayIso, hour),
        label: formatSlotLabel("Today", hour),
      });
    }
  }

  const tomorrowStartHour =
    currentHour >= DELIVERY_POLICY_CONSTANTS.tomorrowEarlySlotCutoffHour
      ? DELIVERY_POLICY_CONSTANTS.tomorrowLateEarliestHour
      : DELIVERY_POLICY_CONSTANTS.tomorrowEarliestHour;
  for (let hour = tomorrowStartHour; hour < DELIVERY_POLICY_CONSTANTS.lastDeliveryHour; hour += 1) {
    if (!options.ignoreBlackout && isBlockedByBlackout(policy, tomorrowIso, hour)) continue;
    if (!options.ignoreDisabled && isDisabled(policy, tomorrowIso, hour)) continue;
    slots.push({
      key: buildSlotKey(tomorrowIso, hour),
      label: formatSlotLabel("Tomorrow", hour),
    });
  }

  return slots;
}

export function getAsapSlot(policy: DeliveryPolicy, nowIst: Date = getNowIst()): GeneratedSlot | null {
  const currentHour = getIstHour(nowIst);
  if (
    !policy.asapEnabled ||
    currentHour < DELIVERY_POLICY_CONSTANTS.asapOpenHour ||
    currentHour >= DELIVERY_POLICY_CONSTANTS.sameDayCutoffHour
  ) {
    return null;
  }
  const startHour = Math.max(DELIVERY_POLICY_CONSTANTS.firstSameDaySlotHour, currentHour + 1);
  if (startHour >= DELIVERY_POLICY_CONSTANTS.lastDeliveryHour) return null;
  const todayIso = getIstDateIso(nowIst);
  if (isBlockedByBlackout(policy, todayIso, startHour) || isDisabled(policy, todayIso, startHour)) {
    return null;
  }
  return {
    key: buildSlotKey(todayIso, startHour),
    label: formatSlotLabel("Today", startHour),
  };
}

export function parseSlotLabel(slotLabel: string, nowIst: Date = getNowIst()): { dateIso: string; startHour: number } | null {
  const match = slotLabel.match(/^(Today|Tomorrow),\s*(\d{1,2}):00\s*(AM|PM)\s*-\s*(\d{1,2}):00\s*(AM|PM)$/i);
  if (!match) return null;
  const dayToken = match[1].toLowerCase();
  let hour = Number(match[2]);
  const meridiem = match[3].toUpperCase();
  if (meridiem === "PM" && hour !== 12) hour += 12;
  if (meridiem === "AM" && hour === 12) hour = 0;
  const todayIso = getIstDateIso(nowIst);
  const dateIso = dayToken === "tomorrow" ? addDays(todayIso, 1) : todayIso;
  return { dateIso, startHour: hour };
}

/** Parse a slot key of the form "YYYY-MM-DD|HH". */
export function parseSlotKey(slotKey: string): { dateIso: string; startHour: number } | null {
  const match = slotKey.match(/^(\d{4}-\d{2}-\d{2})\|(\d{2})$/);
  if (!match) return null;
  return { dateIso: match[1], startHour: parseInt(match[2], 10) };
}

function fmtHour(h: number): string {
  if (h < 12) return `${h} AM`;
  if (h === 12) return "12 PM";
  return `${h - 12} PM`;
}

/** "Fri, Apr 25" from an ISO date string. */
export function formatDateLabel(dateIso: string): string {
  return parseIstYmd(dateIso).toLocaleDateString("en-IN", {
    timeZone: NUTRAVOE_TIMEZONE,
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/** "Fri, Apr 25 · 10 AM – 11 AM" */
export function formatCalendarSlotLabel(dateIso: string, startHour: number): string {
  return `${formatDateLabel(dateIso)} · ${fmtHour(startHour)} – ${fmtHour(startHour + 1)}`;
}

/**
 * 7–10 AM slots (hours 7–9) for delivery date D can only be booked on or before 11:00 PM
 * IST on D−1 (night before). After that, those hours for D are closed even if "today" at 1 AM.
 */
function isEarlyMorningSlotBookableForDate(dateIso: string, startHour24: number, nowIst: Date): boolean {
  if (
    startHour24 < BUSINESS_HOURS.earlyMorningFirstHour ||
    startHour24 > BUSINESS_HOURS.earlyMorningLastBookableHour
  ) {
    return true;
  }
  const prev = addDays(dateIso, -1);
  const deadlineMs = new Date(`${prev}T23:00:00+05:30`).getTime();
  return nowIst.getTime() <= deadlineMs;
}

/** Available hours (7–14) for a given date, respecting policy blackouts, same-day hour cutoff, and 7–10 AM “order by 11 PM previous day” rule. */
export function getSlotAvailabilityForDate(
  policy: DeliveryPolicy,
  dateIso: string,
  nowIst: Date = getNowIst(),
): { hour: number; available: boolean }[] {
  const todayIso = getIstDateIso(nowIst);
  if (dateIso < todayIso) {
    return Array.from({ length: SLOT_HOUR_COUNT }, (_, i) => i + BUSINESS_HOURS.firstSlotHour).map((hour) => ({
      hour,
      available: false,
    }));
  }
  const isToday = dateIso === todayIso;
  const cutoff = isToday ? getIstHour(nowIst) + 1 : BUSINESS_HOURS.firstSlotHour;
  return Array.from({ length: SLOT_HOUR_COUNT }, (_, i) => i + BUSINESS_HOURS.firstSlotHour).map((hour) => {
    if (!isEarlyMorningSlotBookableForDate(dateIso, hour, nowIst)) {
      return { hour, available: false };
    }
    const available =
      hour >= (isToday ? Math.max(BUSINESS_HOURS.firstSlotHour, cutoff) : BUSINESS_HOURS.firstSlotHour) &&
      !isBlockedByBlackout(policy, dateIso, hour) &&
      !isDisabled(policy, dateIso, hour);
    return { hour, available };
  });
}

/** All valid slots from today through the last day of next calendar month. */
export function generateCalendarSlots(policy: DeliveryPolicy, nowIst: Date = getNowIst()): GeneratedSlot[] {
  const slots: GeneratedSlot[] = [];
  const todayIso = getIstDateIso(nowIst);
  const { year: nowYear, monthIndex: nowMonth } = getIstYearMonth(nowIst);
  const nextMonthIdx = nowMonth === 11 ? 0 : nowMonth + 1;
  const nextMonthYear = nowMonth === 11 ? nowYear + 1 : nowYear;
  const lastDay = new Date(nextMonthYear, nextMonthIdx + 1, 0).getDate();
  const endDateIso = `${nextMonthYear}-${String(nextMonthIdx + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  let cur = todayIso;
  while (cur <= endDateIso) {
    const availability = getSlotAvailabilityForDate(policy, cur, nowIst);
    for (const { hour, available } of availability) {
      if (!available) continue;
      slots.push({ key: buildSlotKey(cur, hour), label: formatCalendarSlotLabel(cur, hour) });
    }
    cur = addDays(cur, 1);
  }
  return slots;
}
