import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendBrevoEmail } from "@/lib/brevo";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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

    const name = user.user_metadata?.full_name || "there";
    
    const emailResult = await sendBrevoEmail({
      toEmail: user.email as string,
      toName: name,
      templateId: Number(process.env.BREVO_PASSWORD_CHANGED_TEMPLATE_ID),
      params: {
        user_name: name !== "there" ? name.split(" ")[0] : "there"
      }
    });

    if (!emailResult.success) {
      return NextResponse.json({ error: `Brevo API Error: ${emailResult.error}` }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Password changed email API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
