export const GUEST_DELIVERY_CONTEXT_KEY = "nutravoe_guest_delivery_context";
export const GUEST_DELIVERY_CONTEXT_EVENT = "guest_delivery_context_change";

export interface GuestDeliveryContext {
  pincode: string;
  lat: number;
  lng: number;
  distanceKm: number;
  deliveryFee: number;
  hubName: string;
  ts: number;
}

function isValidNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function readGuestDeliveryContext(): GuestDeliveryContext | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(GUEST_DELIVERY_CONTEXT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<GuestDeliveryContext>;
    if (
      typeof parsed.pincode !== "string" ||
      !/^\d{6}$/.test(parsed.pincode) ||
      !isValidNumber(parsed.lat) ||
      !isValidNumber(parsed.lng) ||
      !isValidNumber(parsed.distanceKm) ||
      !isValidNumber(parsed.deliveryFee) ||
      typeof parsed.hubName !== "string" ||
      !isValidNumber(parsed.ts)
    ) {
      return null;
    }
    return {
      pincode: parsed.pincode,
      lat: parsed.lat,
      lng: parsed.lng,
      distanceKm: parsed.distanceKm,
      deliveryFee: parsed.deliveryFee,
      hubName: parsed.hubName,
      ts: parsed.ts,
    };
  } catch {
    return null;
  }
}

export function writeGuestDeliveryContext(context: GuestDeliveryContext) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(GUEST_DELIVERY_CONTEXT_KEY, JSON.stringify(context));
    window.dispatchEvent(new Event(GUEST_DELIVERY_CONTEXT_EVENT));
  } catch {
    // Ignore localStorage errors (quota/private mode)
  }
}

export function clearGuestDeliveryContext() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(GUEST_DELIVERY_CONTEXT_KEY);
    window.dispatchEvent(new Event(GUEST_DELIVERY_CONTEXT_EVENT));
  } catch {
    // Ignore localStorage errors
  }
}
