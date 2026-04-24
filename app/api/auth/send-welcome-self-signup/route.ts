import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminSupabase } from "@/lib/supabase/admin";
import { sendBrevoEmail } from "@/lib/brevo";

/**
 * One welcome email for self-serve signups (BREVO_WELCOME_TEMPLATE_ID).
 * Call once after the user is signed in and /api/account/bootstrap has succeeded.
 * Idempotent: sets user_metadata.self_signup_welcome_sent.
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const meta = user.user_metadata ?? {};
  if (meta.admin_created === true) {
    return NextResponse.json({ skipped: true, reason: "admin_created" });
  }
  if (meta.self_signup_welcome_sent === true) {
    return NextResponse.json({ skipped: true, reason: "already_sent" });
  }

  const templateId = Number(process.env.BREVO_WELCOME_TEMPLATE_ID);
  if (!templateId) {
    return NextResponse.json({ error: "Welcome template not configured" }, { status: 500 });
  }

  const name =
    (typeof meta.full_name === "string" && meta.full_name.trim()) ||
    user.email.split("@")[0] ||
    "there";

  const result = await sendBrevoEmail({
    toEmail: user.email,
    toName: name,
    templateId,
    params: { user_name: name },
  });

  if (!result.success) {
    return NextResponse.json(
      { error: result.error ?? "Failed to send email" },
      { status: 500 },
    );
  }

  const { error: updateError } = await adminSupabase.auth.admin.updateUserById(user.id, {
    user_metadata: {
      ...meta,
      self_signup_welcome_sent: true,
    },
  });

  if (updateError) {
    console.error("[send-welcome-self-signup] failed to set metadata flag:", updateError.message);
  }

  return NextResponse.json({ success: true });
}
