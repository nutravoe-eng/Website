import { NextRequest, NextResponse } from "next/server";

/**
 * Legacy endpoint: Supabase Database Webhook used to send BREVO_WELCOME_TEMPLATE_ID on auth.users insert.
 *
 * Welcome emails are now sent from:
 * - Self-signup: POST /api/auth/send-welcome-self-signup (after sign-in + bootstrap in app/signin/page.tsx)
 * - Admin-created users: POST /api/admin/customers (BREVO_WELCOME_ACCOUNT_CREATED_TEMPLATE_ID)
 *
 * Disable the Supabase webhook that points here to avoid confusion. This handler no longer sends mail.
 */
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("Authorization");
  if (authHeader !== `Bearer ${process.env.WEBHOOK_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    ok: true,
    deprecated: true,
    message:
      "Welcome email is sent from the app. Remove this webhook in Supabase Dashboard → Database → Webhooks.",
  });
}
