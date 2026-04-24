import type { DeliveryMode } from "@/lib/delivery-policy";
import {
  generateCalendarSlots,
  formatCalendarSlotLabel,
  getAsapSlot,
  getNowIst,
  parseSlotKey,
  parseSlotLabel,
} from "@/lib/delivery-policy";
import { getDeliveryPolicy } from "@/lib/delivery-policy-server";

export async function resolveRequestedDelivery(
  modeRaw: unknown,
  selectedSlotRaw: unknown,
): Promise<{ mode: DeliveryMode; selectedSlot: string; deliveryDate: string }> {
  const policy = await getDeliveryPolicy();
  const nowIst = getNowIst();
  const mode: DeliveryMode = modeRaw === "asap" ? "asap" : "scheduled";

  if (mode === "asap") {
    const asap = getAsapSlot(policy, nowIst);
    if (!asap) throw new Error("Delivery in 60 min is not available right now.");
    const parsed = parseSlotLabel(asap.label, nowIst);
    if (!parsed) throw new Error("Unable to compute ASAP delivery slot.");
    return { mode, selectedSlot: asap.label, deliveryDate: parsed.dateIso };
  }

  const selectedSlot = typeof selectedSlotRaw === "string" ? selectedSlotRaw.trim() : "";
  if (!selectedSlot) throw new Error("Delivery slot is required.");

  // Accept slot keys "YYYY-MM-DD|HH" (new calendar format)
  const parsedKey = parseSlotKey(selectedSlot);
  if (parsedKey) {
    const allowed = generateCalendarSlots(policy, nowIst);
    const allowedSet = new Set(allowed.map((s) => s.key));
    if (!allowedSet.has(selectedSlot)) throw new Error("Selected delivery slot is no longer available.");
    const label = formatCalendarSlotLabel(parsedKey.dateIso, parsedKey.startHour);
    return { mode, selectedSlot: label, deliveryDate: parsedKey.dateIso };
  }

  // Legacy label format "Today/Tomorrow, ..." — kept for backward compatibility
  if (selectedSlot.length > 64 || !/^[\w\s\-–:.,]+$/.test(selectedSlot)) {
    throw new Error("Invalid delivery slot.");
  }
  const parsed = parseSlotLabel(selectedSlot, nowIst);
  if (!parsed) throw new Error("Invalid delivery slot.");
  return { mode, selectedSlot, deliveryDate: parsed.dateIso };
}
