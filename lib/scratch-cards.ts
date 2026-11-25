import { randomBytes, randomInt } from "crypto";
import { getSiteUrl } from "@/lib/site";

/** Cashback range for a scratch card, in whole rupees (inclusive). */
export const SCRATCH_MIN_RS = 5;
export const SCRATCH_MAX_RS = 20;

/** Every whole-rupee value between min and max is equally likely. Server-side only. */
export function drawScratchAmount(): number {
  return randomInt(SCRATCH_MIN_RS, SCRATCH_MAX_RS + 1);
}

const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"; // no 0/o, 1/l/i

/** Short, unguessable code for the card's link. */
export function newScratchCode(length = 8): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

export function isScratchCode(code: string): boolean {
  return /^[a-z2-9]{6,16}$/.test(code);
}

/** Indian mobile number as 10 digits, or null. Accepts +91, spaces, dashes. */
export function normalizeIndianMobile(input: string): string | null {
  const digits = String(input || "").replace(/\D/g, "");
  const ten = digits.length > 10 ? digits.slice(-10) : digits;
  return /^[6-9]\d{9}$/.test(ten) ? ten : null;
}

export function scratchCardUrl(code: string): string {
  return `${getSiteUrl().replace(/\/$/, "")}/scratch/${code}`;
}

/** WhatsApp click-to-chat link that opens a chat with the customer, message pre-filled. */
export function whatsappLinkForCard(phone10: string, code: string, name?: string | null): string {
  const hi = name ? `Hi ${name.split(" ")[0]}!` : "Hi!";
  const text = `${hi} Thank you for rating Nutravoe on Zomato 💛 Here's your scratch card — scratch it to see your cashback, and we'll send it to this number on GPay: ${scratchCardUrl(code)}`;
  return `https://wa.me/91${phone10}?text=${encodeURIComponent(text)}`;
}
