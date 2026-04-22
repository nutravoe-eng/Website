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

export const DELIVERY_POLICY_CONSTANTS = {
  asapOpenHour: 9,
  sameDayCutoffHour: 19,
  firstSameDaySlotHour: 10,
  lastDeliveryHour: 20,
  tomorrowEarlySlotCutoffHour: 23,
  tomorrowEarliestHour: 7,
  tomorrowLateEarliestHour: 10,
};

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
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
}

export function getIstDateIso(base: Date): string {
  const y = base.getFullYear();
  const m = String(base.getMonth() + 1).padStart(2, "0");
  const d = String(base.getDate()).padStart(2, "0");
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
  const currentHour = nowIst.getHours();
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
  const currentHour = nowIst.getHours();
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
