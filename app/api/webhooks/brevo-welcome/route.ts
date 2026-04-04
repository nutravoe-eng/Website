import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    // 1. Verify the secret header — only accept calls from our Supabase Webhook
    const authHeader = req.headers.get("Authorization");
    if (authHeader !== `Bearer ${process.env.WEBHOOK_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Parse the Supabase webhook payload
    // Supabase sends: { type: "INSERT", table: "users", record: { ... } }
    const body = await req.json();
    const newRecord = body.record ?? {};

    // Log the full payload so we can inspect what fields are actually available
    console.log("[brevo-welcome] Supabase webhook payload:", JSON.stringify(body, null, 2));

    if (!newRecord.email) {
      return NextResponse.json({ error: "No email in webhook record" }, { status: 400 });
    }

    // 3. Extract the name — try multiple field paths because the webhook may fire
    //    on auth.users (name is in raw_user_meta_data) or public.users (name is a column).
    //    Also guard against empty strings, which Brevo renders as blank even if truthy-check passes.
    const rawMeta = newRecord.raw_user_meta_data ?? {};
    const resolvedName =
      (typeof rawMeta.full_name === "string" && rawMeta.full_name.trim()) ||
      (typeof newRecord.full_name === "string"  && newRecord.full_name.trim())  ||
      (typeof newRecord.name === "string"        && newRecord.name.trim())        ||
      "there";

    console.log("[brevo-welcome] Resolved name:", resolvedName, "| Email:", newRecord.email);

    // 4. Send via Brevo transactional email API
    //    Template must use:  {{ params.name }}  (lowercase, exact match)
    const brevoResponse = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": process.env.BREVO_API_KEY as string,
      },
      body: JSON.stringify({
        to: [{ email: newRecord.email, name: resolvedName }],
        templateId: Number(process.env.BREVO_WELCOME_TEMPLATE_ID),
        params: {
          user_name: resolvedName, // {{ params.user_name }} in Brevo template
        },
      }),
    });

    if (!brevoResponse.ok) {
      const errorText = await brevoResponse.text();
      console.error("[brevo-welcome] Brevo API Error:", errorText);
      return NextResponse.json({ error: "Failed to send email via Brevo" }, { status: 500 });
    }

    return NextResponse.json({ success: true, name_used: resolvedName });
  } catch (err) {
    console.error("[brevo-welcome] Webhook Error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
