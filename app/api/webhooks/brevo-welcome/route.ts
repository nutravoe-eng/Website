import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    // 1. Verify a secret header to ensure this request comes strictly from our Supabase Webhook
    const authHeader = req.headers.get("Authorization");
    if (authHeader !== `Bearer ${process.env.WEBHOOK_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Parse the webhook payload from Supabase
    // Supabase sends a payload like: { type: "INSERT", table: "users", record: { id, email, full_name, ... } }
    const body = await req.json();
    const newRecord = body.record;

    if (!newRecord || !newRecord.email) {
      return NextResponse.json({ error: "No email provided or invalid payload payload" }, { status: 400 });
    }

    // 3. Send Request to Brevo API using native fetch
    const brevoResponse = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": process.env.BREVO_API_KEY as string,
      },
      body: JSON.stringify({
        to: [
          {
            email: newRecord.email,
            name: newRecord.full_name || "there",
          },
        ],
        templateId: Number(process.env.BREVO_WELCOME_TEMPLATE_ID),
        params: {
          // Pass dynamic variables to your Brevo template here (e.g., {{ params.name }})
          name: newRecord.full_name || "there",
        },
      }),
    });

    if (!brevoResponse.ok) {
      const errorText = await brevoResponse.text();
      console.error("Brevo API Error:", errorText);
      return NextResponse.json({ error: "Failed to send email via Brevo" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Webhook Error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
