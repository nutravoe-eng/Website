import { adminSupabase } from "@/lib/supabase/admin";
import { sendBrevoEmail } from "@/lib/brevo";

export async function alertOtpBudget(scope: string, limit: number, remaining: number, seconds: number) {
  if (!scope.startsWith("otp-global-") || remaining > limit * 0.2) return;
  try {
    const templateId = Number(process.env.BREVO_OTP_ALERT_TEMPLATE_ID);
    if (!Number.isInteger(templateId) || templateId <= 0) {
      console.error("[otp-budget-alert] Email template not configured", { scope, limit, remaining });
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
    const result = await sendBrevoEmail({
      toEmail: process.env.OTP_ALERT_EMAIL ?? "nutravoe@gmail.com",
      toName: "Nutravoe Operations", templateId,
      params: { scope, limit, attempts, remaining, window_hours: seconds / 3600,
        estimated_cost_inr: Number.isFinite(unitCost) && unitCost > 0 ? (attempts * unitCost).toFixed(2) : "Not configured",
        note: "Counts send attempts, including failed or subsequently blocked sends. Estimated cost is not an invoice." },
    });
    if (!result.success) console.error("[otp-budget-alert] Email delivery failed");
  } catch { console.error("[otp-budget-alert] Alert failed"); }
}
