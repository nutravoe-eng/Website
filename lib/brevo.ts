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
}) {
  if (!process.env.BREVO_API_KEY) {
    console.error("BREVO_API_KEY is not defined - skipping email");
    return false;
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
      return false;
    }

    return true;
  } catch (error) {
    console.error("Error sending Brevo email:", error);
    return false;
  }
}
