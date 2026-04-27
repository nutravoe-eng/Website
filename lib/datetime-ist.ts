/**
 * Nutravoe product time zone for display and for interpreting calendar dates (IST).
 *
 * **Storage (Supabase / Postgres):** keep using `timestamptz` and ISO UTC strings from the
 * API. Do not re-store “IST time” in the database; convert at the edge of the UI with these helpers.
 */
export const NUTRAVOE_TIMEZONE = "Asia/Kolkata" as const;

/** YYYY-MM-DD in IST (calendar day), for defaults and URL params. */
export function getTodayIstYmd(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: NUTRAVOE_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const d = parts.find((p) => p.type === "day")?.value;
  if (!y || !m || !d) {
    // Fallback: never empty
    return new Date().toISOString().slice(0, 10);
  }
  return `${y}-${m}-${d}`;
}

/**
 * A calendar date stored as YYYY-MM-DD (India business / delivery day) as an absolute
 * `Date` at local noon in IST so day-boundary bugs are avoided.
 */
export function parseIstYmd(ymd: string): Date {
  const s = ymd.split("T")[0] ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return new Date(ymd);
  }
  return new Date(`${s}T12:00:00+05:30`);
}

/** Human-readable calendar date; input is a Y-M-D (or start of ISO) meaning “this India day”. */
export function formatIstYmd(
  ymd: string | null | undefined,
  options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" },
): string {
  if (!ymd) return "—";
  return parseIstYmd(ymd).toLocaleDateString("en-IN", { timeZone: NUTRAVOE_TIMEZONE, ...options });
}

/**
 * A wall-clock / instant from the DB (UTC ISO) shown in IST.
 * Use for `created_at`, `updated_at`, etc.
 */
export function formatInstantIst(
  iso: string | null | undefined,
  options: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" },
): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString("en-IN", { timeZone: NUTRAVOE_TIMEZONE, ...options });
}

/** Date part of an instant (UTC ISO) in IST — e.g. invoices “paid on”. */
export function formatInstantIstDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString("en-IN", {
    timeZone: NUTRAVOE_TIMEZONE,
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** e.g. “Monday, 27 April 2026” in IST — for admin headings. */
export function formatTodayIstLong(): string {
  return new Date().toLocaleDateString("en-IN", {
    timeZone: NUTRAVOE_TIMEZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function calendarDaysBetweenIst(fromYmd: string, toYmd: string): number {
  const a = parseIstYmd(fromYmd).getTime();
  const b = parseIstYmd(toYmd).getTime();
  return Math.round((b - a) / 86_400_000);
}

/** Add N whole calendar days in IST; input can be YYYY-MM-DD or an ISO instant (date part in IST is used for Y-M-D). */
export function addCalendarDaysIst(ymdOrIso: string, days: number): string {
  const head = (ymdOrIso.split("T")[0] ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(head)) {
    const t = parseIstYmd(head).getTime() + days * 86_400_000;
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: NUTRAVOE_TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(t));
  }
  const d = new Date(ymdOrIso);
  if (Number.isNaN(d.getTime())) {
    return head || ymdOrIso;
  }
  const t = d.getTime() + days * 86_400_000;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: NUTRAVOE_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(t));
}
