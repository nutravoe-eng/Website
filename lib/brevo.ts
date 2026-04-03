export async function sendBrevoEmail({
  toEmail,
  toName,
  templateId,
  params = {},
}: {
  toEmail: string;
  toName: string;
  templateId: number;
  params?: Record<string, any>;
}): Promise<{ success: boolean; error?: string }> {
  if (!process.env.BREVO_API_KEY) {
    console.error("BREVO_API_KEY is not defined - skipping email");
    return { success: false, error: "BREVO_API_KEY is missing" };
  }

  try {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": process.env.BREVO_API_KEY,
      },
      body: JSON.stringify({
        to: [{ email: toEmail, name: toName }],
        templateId,
        params,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("Failed to send Brevo email:", err);
      return { success: false, error: err };
    }

    return { success: true };
  } catch (error: any) {
    console.error("Error sending Brevo email:", error);
    return { success: false, error: error.message };
  }
}
