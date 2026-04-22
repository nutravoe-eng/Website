import type { DeliveryMode } from "@/lib/delivery-policy";
import { generateScheduledSlots, getAsapSlot, getNowIst, parseSlotLabel } from "@/lib/delivery-policy";
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
  if (selectedSlot.length > 64 || !/^[\w\s\-–:.,]+$/.test(selectedSlot)) {
    throw new Error("Invalid delivery slot.");
  }

  const allowed = generateScheduledSlots(policy, nowIst);
  const allowedSet = new Set(allowed.map((slot) => slot.label));
  if (!allowedSet.has(selectedSlot)) {
    throw new Error("Selected delivery slot is no longer available.");
  }
  const parsed = parseSlotLabel(selectedSlot, nowIst);
  if (!parsed) throw new Error("Invalid delivery slot.");
  return { mode, selectedSlot, deliveryDate: parsed.dateIso };
}
