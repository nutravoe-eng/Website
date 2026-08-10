import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { enforceRateLimit } from "@/lib/rate-limit";
import { validatePhoneOtp } from "@/lib/message-central";
import { adminSupabase } from "@/lib/supabase/admin";
import {
  findAccountsForPhone,
  mergePhoneAccountsIntoPrimary,
  phoneToVirtualEmail,
} from "@/lib/account-merge";

type OtpSession = {
  phone?: string;
  verificationId?: string;
  issuedAt?: number;
};

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, "auth-phone-verify-otp", 8, 60);
  if (!limited.ok) return limited.response;

  const body = await req.json().catch(() => null);
  const digits = typeof body?.phone === "string" ? body.phone.replace(/\D/g, "") : "";
  const phone = digits.replace(/^91/, "").slice(-10);
  const code = typeof body?.code === "string" ? body.code.trim() : "";

  if (phone.length !== 10 || !/^\d{6}$/.test(code)) {
    return NextResponse.json(
      { error: "Valid phone and 6-digit code required" },
      { status: 400, headers: limited.headers }
    );
  }

  const cookieStore = await cookies();
  const raw = cookieStore.get("phone_otp_session")?.value;
  let session: OtpSession | null = null;
  try {
    session = raw ? (JSON.parse(raw) as OtpSession) : null;
  } catch {
    session = null;
  }

  if (!session || session.phone !== phone || !session.verificationId) {
    return NextResponse.json(
      { error: "No pending verification for this number. Please request a new OTP." },
      { status: 400, headers: limited.headers }
    );
  }

  const verified = await validatePhoneOtp(session.verificationId, code);
  if (verified.error || !verified.data) {
    return NextResponse.json(
      { error: verified.error ?? "Incorrect or expired code. Please try again." },
      { status: 401, headers: limited.headers }
    );
  }

  cookieStore.delete("phone_otp_session");

  const e164Phone = `91${phone}`;
  const virtualEmail = phoneToVirtualEmail(phone);

  // ── Resolve / create / merge ────────────────────────────────────
  let candidates = await findAccountsForPhone(phone);

  if (candidates.length === 0) {
    const { data: created, error: createError } = await adminSupabase.auth.admin.createUser({
      email: virtualEmail,
      email_confirm: true,
      phone: e164Phone,
      phone_confirm: true,
      user_metadata: { auth_method: "phone" },
    });

    if (createError) {
      // Race: someone else created / phone already on auth — re-resolve
      if (
        createError.code === "email_exists" ||
        createError.code === "phone_exists" ||
        /already|exists/i.test(createError.message ?? "")
      ) {
        candidates = await findAccountsForPhone(phone);
        if (candidates.length === 0 && createError.code === "email_exists") {
          // Auth exists with virtual email but public.users missing — sign in by email only
          candidates = [
            {
              userId: "",
              email: virtualEmail,
              fullName: null,
              createdAt: null,
              orderCount: 0,
              isVirtual: true,
            },
          ];
        }
        if (candidates.length === 0) {
          console.error("[verify-otp] create conflict but resolve failed:", createError);
          return NextResponse.json(
            { error: "That phone number is already linked to a different account." },
            { status: 409, headers: limited.headers }
          );
        }
      } else {
        console.error("[verify-otp] createUser failed:", createError);
        return NextResponse.json(
          { error: "Couldn't create your account. Please try again." },
          { status: 500, headers: limited.headers }
        );
      }
    } else if (created?.user?.id) {
      await adminSupabase.from("users").update({ phone }).eq("id", created.user.id);
      candidates = [
        {
          userId: created.user.id,
          email: created.user.email || virtualEmail,
          fullName: null,
          createdAt: null,
          orderCount: 0,
          isVirtual: true,
        },
      ];
    } else {
      return NextResponse.json(
        { error: "Couldn't create your account. Please try again." },
        { status: 500, headers: limited.headers }
      );
    }
  }

  // If multiple accounts share this phone, merge into the survivor (OTP proves ownership).
  let signInEmail: string;
  let mergedCount = 0;

  try {
    if (candidates.length > 1) {
      const merge = await mergePhoneAccountsIntoPrimary(candidates, phone);
      signInEmail = merge.primary.email;
      mergedCount = merge.mergedSecondaryIds.length;
    } else {
      const only = candidates[0];
      signInEmail = only.email;
      if (only.userId) {
        await adminSupabase.from("users").update({ phone }).eq("id", only.userId);
        const { error: phoneError } = await adminSupabase.auth.admin.updateUserById(only.userId, {
          phone: e164Phone,
          phone_confirm: true,
        });
        if (phoneError) {
          console.warn("[verify-otp] could not sync auth phone:", phoneError.message);
        }
      }
    }
  } catch (err) {
    console.error("[verify-otp] merge failed:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Couldn't merge duplicate accounts. Please try again.",
      },
      { status: 500, headers: limited.headers }
    );
  }

  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost:3000";
  const proto = req.headers.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");

  const { data: linkData, error: linkError } = await adminSupabase.auth.admin.generateLink({
    type: "magiclink",
    email: signInEmail,
    options: { redirectTo: `${proto}://${host}/account` },
  });

  const emailOtp = linkData?.properties?.email_otp;
  if (linkError || !emailOtp) {
    console.error("[verify-otp] generateLink failed:", linkError);
    return NextResponse.json(
      { error: "Couldn't sign you in. Please try again." },
      { status: 500, headers: limited.headers }
    );
  }

  return NextResponse.json(
    {
      email: signInEmail,
      otp: emailOtp,
      ...(mergedCount > 0 ? { mergedAccounts: mergedCount } : {}),
    },
    { headers: limited.headers }
  );
}
