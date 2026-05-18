import { BUSINESS_HOURS } from "@/lib/delivery-policy";

function formatSlotRange(startHour24: number): string {
  const endHour24 = startHour24 + 1;
  const fmt = (hour24: number) => {
    if (hour24 === 0) return "12:00 AM";
    if (hour24 < 12) return `${hour24}:00 AM`;
    if (hour24 === 12) return "12:00 PM";
    return `${hour24 - 12}:00 PM`;
  };
  return `${fmt(startHour24)} - ${fmt(endHour24)}`;
}

export const DELIVERY_TIME_SLOTS = Array.from(
  { length: BUSINESS_HOURS.lastHourExclusive - BUSINESS_HOURS.firstSlotHour },
  (_, i) => formatSlotRange(BUSINESS_HOURS.firstSlotHour + i),
) as readonly string[];

export type DeliveryTimeSlot = (typeof DELIVERY_TIME_SLOTS)[number];
