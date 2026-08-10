/**
 * Message Central VerifyNow client — wired like Kundaligram:
 * static dashboard Auth Token as the `authToken` header on every call.
 * No password → token exchange.
 *
 * Env:
 *   MESSAGECENTRAL_CUSTOMER_ID
 *   MESSAGECENTRAL_AUTH_TOKEN
 */

const BASE = "https://cpaas.messagecentral.com";

type McResult<T> = { data: T; error: null } | { data: null; error: string };

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function authHeaders() {
  return { authToken: requiredEnv("MESSAGECENTRAL_AUTH_TOKEN") };
}

/** Send SMS OTP. Returns Message Central verificationId. */
export async function sendPhoneOtp(mobileNumber: string): Promise<McResult<string>> {
  try {
    const url = new URL(`${BASE}/verification/v3/send`);
    url.searchParams.set("countryCode", "91");
    url.searchParams.set("flowType", "SMS");
    url.searchParams.set("mobileNumber", mobileNumber);
    url.searchParams.set("customerId", requiredEnv("MESSAGECENTRAL_CUSTOMER_ID"));
    url.searchParams.set("otpLength", "6");

    const res = await fetch(url.toString(), {
      method: "POST",
      headers: authHeaders(),
      cache: "no-store",
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("[message-central] send OTP HTTP error:", res.status, body);
      return { data: null, error: `SMS service error (${res.status})` };
    }

    const json = await res.json();

    if (json.responseCode !== 200) {
      return { data: null, error: json.message ?? "Failed to send OTP" };
    }

    const verificationId = json.data?.verificationId;
    if (!verificationId) {
      return { data: null, error: "OTP sent but verification ID missing" };
    }

    return { data: String(verificationId), error: null };
  } catch (err) {
    console.error("[message-central] send OTP failed:", err);
    return { data: null, error: err instanceof Error ? err.message : "Failed to send OTP" };
  }
}

/** @deprecated use sendPhoneOtp */
export async function sendOtp(phone10Digit: string): Promise<{ verificationId: string }> {
  const result = await sendPhoneOtp(phone10Digit);
  if (result.error || !result.data) {
    throw new Error(result.error ?? "Failed to send OTP");
  }
  return { verificationId: result.data };
}

export async function validatePhoneOtp(
  verificationId: string,
  code: string
): Promise<McResult<true>> {
  try {
    const url = new URL(`${BASE}/verification/v3/validateOtp`);
    url.searchParams.set("verificationId", verificationId);
    url.searchParams.set("code", code);
    url.searchParams.set("flowType", "SMS");

    const res = await fetch(url.toString(), {
      headers: authHeaders(),
      cache: "no-store",
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("[message-central] validate OTP HTTP error:", res.status, body);
      return { data: null, error: `SMS service error (${res.status})` };
    }

    const json = await res.json();

    if (json.responseCode === 200 && json.data?.verificationStatus === "VERIFICATION_COMPLETED") {
      return { data: true, error: null };
    }

    // Do NOT treat 703 as success (Kundaligram) — prevents OTP reuse.
    const code_ = Number(json.responseCode ?? json.data?.responseCode);
    if (code_ === 702) return { data: null, error: "Incorrect code. Please try again." };
    if (code_ === 705) return { data: null, error: "Code expired. Please request a new one." };
    if (code_ === 703) return { data: null, error: "This code was already used. Request a new one." };

    return { data: null, error: json.message ?? "Verification failed" };
  } catch (err) {
    console.error("[message-central] validate OTP failed:", err);
    return { data: null, error: err instanceof Error ? err.message : "Verification failed" };
  }
}

/** @deprecated use validatePhoneOtp */
export async function validateOtp(
  _phone10Digit: string,
  verificationId: string,
  code: string
): Promise<boolean> {
  const result = await validatePhoneOtp(verificationId, code);
  return result.data === true;
}
