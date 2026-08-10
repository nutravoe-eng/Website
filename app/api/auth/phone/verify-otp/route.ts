import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "crypto";
import { enforceRateLimit } from "@/lib/rate-limit";
import { validateOtp } from "@/lib/message-central";
import { adminSupabase } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, "auth-phone-verify-otp", 8, 60);
  if (!limited.ok) return limited.response;

  const body = await req.json().catch(() => null);
  const digits = typeof body?.phone === "string" ? body.phone.replace(/\D/g, "") : "";
  const phone = digits.slice(-10);
  const code = typeof body?.code === "string" ? body.code.trim() : "";

  if (phone.length !== 10 || !/^\d{4,8}$/.test(code)) {
    return NextResponse.json(
      { error: "Valid phone and code required" },
      { status: 400, headers: limited.headers }
    );
  }

  const cookieStore = await cookies();
  const raw = cookieStore.get("phone_otp_session")?.value;
  const session = raw ? JSON.parse(raw) : null;

  if (!session || session.phone !== phone || !session.verificationId) {
    return NextResponse.json(
      { error: "No pending verification for this number. Please request a new OTP." },
      { status: 400, headers: limited.headers }
    );
  }

  const verified = await validateOtp(phone, session.verificationId, code);
  if (!verified) {
    return NextResponse.json(
      { error: "Incorrect or expired code. Please try again." },
      { status: 401, headers: limited.headers }
    );
  }

  // Find an existing profile by phone, or create a fresh auth user.
  const { data: existingProfile } = await adminSupabase
    .from("users")
    .select("id")
    .eq("phone", phone)
    .limit(1)
    .maybeSingle();

  const e164Phone = `91${phone}`; // Supabase auth.users.phone convention: no leading '+'
  let userId = existingProfile?.id as string | undefined;

  if (!userId) {
    const { data: created, error: createError } = await adminSupabase.auth.admin.createUser({
      phone: e164Phone,
      phone_confirm: true,
    });

    if (createError || !created?.user) {
      console.error("[verify-otp] user creation failed:", createError);
      return NextResponse.json(
        { error: "Couldn't create your account. Please try again." },
        { status: 500, headers: limited.headers }
      );
    }
    userId = created.user.id;

    // The DB trigger that mirrors auth.users into public.users on signup
    // may not populate `phone` for phone-only signups — make sure it's set.
    await adminSupabase.from("users").update({ phone }).eq("id", userId);
  }

  // Bridge into a real Supabase session: set a one-time random password
  // server-side, then sign in with it using the cookie-writing SSR client.
  const tempPassword = crypto.randomBytes(24).toString("hex");
  const { error: pwError } = await adminSupabase.auth.admin.updateUserById(userId, {
    password: tempPassword,
    phone: e164Phone,
    phone_confirm: true,
  });

  if (pwError) {
    console.error("[verify-otp] password bridge failed:", pwError);
    return NextResponse.json(
      { error: "Couldn't sign you in. Please try again." },
      { status: 500, headers: limited.headers }
    );
  }

  const supabase = await createClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({
    phone: e164Phone,
    password: tempPassword,
  });

  if (signInError) {
    console.error("[verify-otp] sign-in failed:", signInError);
    return NextResponse.json(
      { error: "Couldn't sign you in. Please try again." },
      { status: 500, headers: limited.headers }
    );
  }

  cookieStore.delete("phone_otp_session");

  return NextResponse.json({ success: true }, { headers: limited.headers });
}
