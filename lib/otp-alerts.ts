import { adminSupabase } from "@/lib/supabase/admin";
import { sendBrevoTextEmail } from "@/lib/brevo";

export async function alertOtpBudget(scope: string, limit: number, remaining: number, seconds: number) {
  if (!scope.startsWith("otp-global-") || remaining > limit * 0.2) return;
  try {
    if (!process.env.BREVO_API_KEY) {
      console.error("[otp-budget-alert] Brevo API key missing", { scope, limit, remaining });
      return;
    }
    // Atomic database claim prevents every request/instance sending another alert.
    const bucket = Math.floor(Date.now() / (seconds * 1000));
    const { data, error } = await adminSupabase.rpc("check_rate_limit", {
      p_key: `otp-alert:${scope}:${bucket}`, p_limit: 1, p_window_seconds: seconds * 2,
    });
    if (error) { console.error("[otp-budget-alert] Deduplication unavailable"); return; }
    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.allowed) return;
    const unitCost = Number(process.env.OTP_SMS_UNIT_COST_INR);
    const attempts = limit - remaining;
    const result = await sendBrevoTextEmail({
      toEmail: process.env.OTP_ALERT_EMAIL ?? "nutravoe@gmail.com",
      subject: seconds === 86400
        ? "SMS limit for the day is 80%. Consider increasing it,"
        : "SMS limit for the hour is 80%. Consider increasing it,",
      textContent: [
        `Nutravoe has used at least 80% of its ${seconds === 86400 ? "daily" : "hourly"} SMS sending allowance.`,
        `Attempts counted: ${attempts} of ${limit}. Remaining allowance: ${remaining}.`,
        `Window: ${seconds / 3600} hours.`,
        Number.isFinite(unitCost) && unitCost > 0 ? `Estimated fees for counted attempts: INR ${(attempts * unitCost).toFixed(2)}.` : "Fee estimate unavailable: SMS unit price is not configured.",
        "Sending stops at the limit. Review recent traffic for abuse before considering an increase.",
        "Counts include failed or subsequently blocked send attempts; estimated fees are not an invoice.",
      ].join("\n\n"),
    });
    if (!result.success) console.error("[otp-budget-alert] Email delivery failed");
  } catch { console.error("[otp-budget-alert] Alert failed"); }
}
