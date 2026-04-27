export interface ServiceabilityAddress {
  pincode?: string | null;
  city?: string | null;
  state?: string | null;
}

const BENGALURU_CITY_RE = /\b(bengaluru|bangalore)\b/i;

export function isBengaluruServiceableAddress(address: ServiceabilityAddress | null | undefined): boolean {
  if (!address) return false;
  const pincode = (address.pincode ?? "").trim();
  if (/^560\d{3}$/.test(pincode)) return true;

  const city = (address.city ?? "").trim();
  const state = (address.state ?? "").trim();
  if (BENGALURU_CITY_RE.test(city) && /karnataka/i.test(state)) return true;

  return false;
}

export const BENGALURU_NOT_SERVICEABLE_MESSAGE =
  "We currently deliver only in Bangalore. Please select a Bangalore address to continue.";
