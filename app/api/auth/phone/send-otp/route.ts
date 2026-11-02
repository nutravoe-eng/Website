import { encodeOtpSession } from "@/lib/phone-otp-session";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { enforceRateLimit } from "@/lib/rate-limit";
import { sendPhoneOtp } from "@/lib/message-central";

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, "auth-phone-send-otp", 5, 60);
  if (!limited.ok) return limited.response;

  const body = await req.json().catch(() => null);
  const digits = typeof body?.phone === "string" ? body.phone.replace(/\D/g, "") : "";
  const phone = digits.slice(-10);

  if (phone.length !== 10) {
    return NextResponse.json(
      { error: "Valid 10-digit phone number required" },
      { status: 400, headers: limited.headers }
    );
  }

  try {
    encodeOtpSession({ phone, verificationId: "preflight", issuedAt: Date.now() });
    const phoneRequest = new Request(req.url, { headers: { "x-real-ip": phone } });
    const globalRequest = new Request(req.url, { headers: { "x-real-ip": "global" } });
    for (const [request, scope, limit, seconds] of [
      [phoneRequest, "otp-phone-minute", 1, 60],
      [phoneRequest, "otp-phone-hour", 5, 3600],
      [phoneRequest, "otp-phone-day", 10, 86400],
      [req, "otp-ip-hour", 20, 3600],
      [req, "otp-ip-day", 50, 86400],
      [globalRequest, "otp-global-hour", 100, 3600],
      [globalRequest, "otp-global-day", 500, 86400],
    ] as const) {
      const budget = await enforceRateLimit(request, scope, limit, seconds);
      if (!budget.ok) return budget.response;
    }
    const result = await sendPhoneOtp(phone);
    if (result.error || !result.data) {
      console.error("[send-otp] MC error:", result.error);
      return NextResponse.json(
        { error: result.error ?? "Couldn't send OTP right now. Please try again." },
        { status: 502, headers: limited.headers }
      );
    }

    const cookieStore = await cookies();
    cookieStore.set(
      "phone_otp_session",
      encodeOtpSession({ phone, verificationId: result.data, issuedAt: Date.now() }),
      {
        httpOnly: true,
        // Secure cookies are dropped on http://localhost — only require HTTPS in production
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 600, // 10 minutes
        path: "/",
      }
    );

    return NextResponse.json({ success: true }, { headers: limited.headers });
  } catch (err) {
    console.error("[send-otp] failed:", err);
    return NextResponse.json(
      { error: "Couldn't send OTP right now. Please try again." },
      { status: 502, headers: limited.headers }
    );
  }
}
