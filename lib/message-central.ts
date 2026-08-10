/**
 * Thin client for Message Central's VerifyNow API (OTP send/validate).
 *
 * Currently sends OTPs via SMS. WhatsApp delivery ("flowType: WHATSAPP")
 * requires Meta Business Verification and an approved WhatsApp Authentication
 * template on your Message Central account — once that's approved, change
 * FLOW_TYPE below to "WHATSAPP" and nothing else needs to change.
 *
 * The MESSAGECENTRAL_AUTH_TOKEN below is a long-lived token issued directly
 * from your Message Central dashboard (not a key to exchange) — used as-is
 * in the `authToken` header on every call. Confirmed working directly
 * against the live API on 2026-08-10.
 */

const BASE_URL = "https://cpaas.messagecentral.com";
const FLOW_TYPE: "SMS" | "WHATSAPP" = "SMS";

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export async function sendOtp(phone10Digit: string): Promise<{ verificationId: string }> {
  const customerId = requiredEnv("MESSAGECENTRAL_CUSTOMER_ID");
  const token = requiredEnv("MESSAGECENTRAL_AUTH_TOKEN");

  const url = new URL(`${BASE_URL}/verification/v3/send`);
  url.searchParams.set("countryCode", "91");
  url.searchParams.set("customerId", customerId);
  url.searchParams.set("flowType", FLOW_TYPE);
  url.searchParams.set("mobileNumber", phone10Digit);

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { authToken: token },
  });
  const data = await res.json().catch(() => null);

  const verificationId = data?.data?.verificationId;
  if (!res.ok || !verificationId) {
    console.error("[message-central] send OTP failed:", res.status, data);
    throw new Error("Failed to send OTP");
  }

  return { verificationId: String(verificationId) };
}

export async function validateOtp(
  phone10Digit: string,
  verificationId: string,
  code: string
): Promise<boolean> {
  const customerId = requiredEnv("MESSAGECENTRAL_CUSTOMER_ID");
  const token = requiredEnv("MESSAGECENTRAL_AUTH_TOKEN");

  const url = new URL(`${BASE_URL}/verification/v3/validateOtp`);
  url.searchParams.set("countryCode", "91");
  url.searchParams.set("mobileNumber", phone10Digit);
  url.searchParams.set("verificationId", verificationId);
  url.searchParams.set("customerId", customerId);
  url.searchParams.set("code", code);

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: { authToken: token },
  });
  const data = await res.json().catch(() => null);

  const status = data?.data?.verificationStatus;
  if (!res.ok) {
    console.error("[message-central] validate OTP failed:", res.status, data);
    return false;
  }

  return status === "VERIFICATION_COMPLETED";
}
