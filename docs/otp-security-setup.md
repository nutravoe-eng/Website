# OTP bot checks and budget alerts

Bot verification is disabled unless NEXT_PUBLIC_OTP_BOT_CHECK_ENABLED=true. Keep it unset/false until keys are configured. When enabled, missing/invalid credentials block SMS sending. Set the same flag for the build and runtime; rebuild when changing it.

1. Create a Cloudflare Turnstile managed widget restricted to nutravoe.in and www.nutravoe.in.
2. Set NEXT_PUBLIC_TURNSTILE_SITE_KEY (public, build time) and TURNSTILE_SECRET_KEY (server only) in Vercel. Set NEXT_PUBLIC_OTP_BOT_CHECK_ENABLED=true only when ready, then rebuild. TURNSTILE_ALLOWED_HOSTNAMES defaults to nutravoe.in,www.nutravoe.in; explicitly configure preview/local hosts and separate test keys for testing.
3. No template is required. The sender defaults to nutravoe@gmail.com, confirmed from the active order notification template. BREVO_FROM_EMAIL optionally overrides it with another verified sender. BREVO_API_KEY uses the existing server credential. OTP_ALERT_EMAIL defaults to nutravoe@gmail.com.
4. Plain-text emails include usage, remaining allowance, window, and optional estimated fees. Set OTP_SMS_UNIT_COST_INR to your actual per-message price to include estimated fees. No price is assumed. Counts are reservations/attempts, not invoices.
5. Alerts start at 80% of the global 100/hour and 500/day limits. Atomic deduplication allows one alert per scope per UTC clock bucket. Budget counters themselves use their existing database windows. Check Brevo logs for delivery failures; failed alerts are logged and do not disable the SMS ceilings. No delivery retry queue is provided.
6. Before production verify bot success, rejection, expiry, resend, allowed host/action, and alerts in staging with provider test keys and test recipients. No live messages are sent by the automated tests.

Provider-side currency spending limits remain a separate Message Central account setting. The application enforces send-count limits.
