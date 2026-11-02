import { createHmac, timingSafeEqual } from "crypto";
type Session = { phone: string; verificationId: string; issuedAt: number };
function sign(payload: string) {
 const key = process.env.MESSAGECENTRAL_EMAIL_SECRET;
 if (!key) throw new Error("Missing OTP signing secret");
 return createHmac("sha256", key).update("otp-session:" + payload).digest();
}
export function encodeOtpSession(session: Session) {
 const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
 return payload + "." + sign(payload).toString("base64url");
}
export function decodeOtpSession(raw?: string): Session | null {
 try {
  if (!raw || raw.length > 4096) return null;
  const [payload, signature, extra] = raw.split(".");
  if (!payload || !signature || extra) return null;
  const expected = sign(payload), actual = Buffer.from(signature, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  const session = JSON.parse(Buffer.from(payload, "base64url").toString()) as Session;
  const age = Date.now() - session.issuedAt;
  return /^\d{10}$/.test(session.phone) && typeof session.verificationId === "string" && !!session.verificationId && Number.isFinite(age) && age >= 0 && age <= 600000 ? session : null;
 } catch { return null; }
}
