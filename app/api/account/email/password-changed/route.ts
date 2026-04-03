import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendBrevoEmail } from "@/lib/brevo";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized. You must be signed in to trigger this email." }, { status: 401 });
    }

    if (!process.env.BREVO_PASSWORD_CHANGED_TEMPLATE_ID) {
      console.log("Skipping password change email: BREVO_PASSWORD_CHANGED_TEMPLATE_ID is not configured.");
      return NextResponse.json({ success: true, warning: "Template ID not set" });
    }

    // Send the email using our Brevo helper
    const emailSent = await sendBrevoEmail({
      toEmail: user.email as string,
      toName: user.user_metadata?.full_name || "there",
      templateId: Number(process.env.BREVO_PASSWORD_CHANGED_TEMPLATE_ID),
    });

    if (!emailSent) {
      return NextResponse.json({ error: "Failed to dispatch email via Brevo" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Password changed email API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
