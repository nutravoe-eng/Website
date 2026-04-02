'use client';

import { useState } from "react";
import { getWhatsAppNumber } from "@/lib/contact";

// ── Types ────────────────────────────────────────────────────────────────────

interface FormState {
  contactName: string;
  orgName: string;
  orgType: string;
  phone: string;
  email: string;
  weeklyQty: string;
  deliveryTime: string;
  notes: string;
}

interface FormErrors {
  contactName?: string;
  orgName?: string;
  orgType?: string;
  phone?: string;
  email?: string;
  weeklyQty?: string;
  deliveryTime?: string;
}

const EMPTY_FORM: FormState = {
  contactName: "",
  orgName: "",
  orgType: "",
  phone: "",
  email: "",
  weeklyQty: "",
  deliveryTime: "",
  notes: "",
};

// ── Validation ───────────────────────────────────────────────────────────────

function validate(form: FormState): FormErrors {
  const errors: FormErrors = {};
  if (!form.contactName.trim()) errors.contactName = "Please enter your name.";
  if (!form.orgName.trim()) errors.orgName = "Please enter your organisation name.";
  if (!form.orgType) errors.orgType = "Please select an organisation type.";
  if (!form.phone.trim()) {
    errors.phone = "Please enter your phone number.";
  } else if (!/^\d{10}$/.test(form.phone.replace(/\s/g, ""))) {
    errors.phone = "Phone number must be 10 digits.";
  }
  if (!form.email.trim()) {
    errors.email = "Please enter your email address.";
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
    errors.email = "Please enter a valid email address.";
  }
  if (!form.weeklyQty) errors.weeklyQty = "Please select an estimated quantity.";
  if (!form.deliveryTime) errors.deliveryTime = "Please select a preferred delivery time.";
  return errors;
}

// ── Message builders ─────────────────────────────────────────────────────────

function buildWhatsAppMessage(form: FormState): string {
  const lines = [
    "Hello, I'd like to enquire about B2B / bulk ordering for Nutravoe.",
    "",
    `Contact person: ${form.contactName}`,
    `Organisation: ${form.orgName}`,
    `Organisation type: ${form.orgType}`,
    `Phone: ${form.phone}`,
    `Email: ${form.email}`,
    `Estimated weekly quantity: ${form.weeklyQty}`,
    `Preferred delivery time: ${form.deliveryTime}`,
  ];
  if (form.notes.trim()) {
    lines.push(`Additional notes: ${form.notes.trim()}`);
  }
  return encodeURIComponent(lines.join("\n"));
}

function buildMailtoBody(form: FormState): string {
  const lines = [
    "Hello,",
    "",
    "I would like to enquire about B2B / bulk ordering for Nutravoe.",
    "",
    `Contact person: ${form.contactName}`,
    `Organisation: ${form.orgName}`,
    `Organisation type: ${form.orgType}`,
    `Phone: ${form.phone}`,
    `Email: ${form.email}`,
    `Estimated weekly quantity: ${form.weeklyQty}`,
    `Preferred delivery time: ${form.deliveryTime}`,
  ];
  if (form.notes.trim()) {
    lines.push("", `Additional notes:`, form.notes.trim());
  }
  lines.push("", "Looking forward to hearing from you.", "", form.contactName);
  return encodeURIComponent(lines.join("\n"));
}

// ── Sub-components ───────────────────────────────────────────────────────────

interface FieldProps {
  label: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}

function Field({ label, error, required = true, children }: FieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="font-body text-[13px] font-medium text-ink">
        {label}
        {required && (
          <span className="text-terracotta ml-0.5" aria-hidden="true">
            *
          </span>
        )}
      </label>
      {children}
      {error && (
        <p className="font-body text-[12px] text-terracotta" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

const inputBase =
  "font-body text-[14px] text-ink bg-white rounded-lg border border-black/10 py-3.5 px-4 w-full outline-none transition-colors duration-200 focus:ring-2 focus:ring-sage/30 focus:border-sage/60 placeholder:text-stone/50";
const inputError =
  "border-terracotta/60 focus:ring-terracotta/30 focus:border-terracotta/60";

interface AccordionItem {
  q: string;
  a: string;
}

function Accordion({ items }: { items: AccordionItem[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  function toggle(i: number) {
    setOpenIndex(openIndex === i ? null : i);
  }

  return (
    <div className="divide-y divide-black/[0.07]">
      {items.map((item, i) => {
        const isOpen = openIndex === i;
        return (
          <div key={i}>
            <button
              type="button"
              onClick={() => toggle(i)}
              className="w-full flex items-center justify-between gap-4 py-5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage/40 rounded-sm"
              aria-expanded={isOpen}
            >
              <span className="font-body text-[15px] font-medium text-ink">
                {item.q}
              </span>
              {/* Chevron */}
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="flex-shrink-0 text-stone transition-transform duration-200"
                style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }}
                aria-hidden="true"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            {isOpen && (
              <p className="font-body text-[14px] text-stone leading-relaxed pb-5 max-w-2xl">
                {item.a}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function B2BPage() {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitted, setSubmitted] = useState(false);

  function update(field: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    // Clear error for field as user types
    if (errors[field as keyof FormErrors]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  }

  function handleWhatsApp() {
    const errs = validate(form);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      setSubmitted(true);
      return;
    }
    const msg = buildWhatsAppMessage(form);
    window.open(`https://wa.me/${getWhatsAppNumber()}?text=${msg}`, "_blank", "noopener,noreferrer");
  }

  function handleEmail() {
    const errs = validate(form);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      setSubmitted(true);
      return;
    }
    const subject = encodeURIComponent(`B2B Enquiry — ${form.orgName}`);
    const body = buildMailtoBody(form);
    window.location.href = `mailto:nutravoe@gmail.com?subject=${subject}&body=${body}`;
  }

  const faqItems: AccordionItem[] = [
    {
      q: "What is the minimum weekly order?",
      a: "We require a minimum of 20 bowls per week. For smaller teams, you're welcome to place daily orders through our regular menu.",
    },
    {
      q: "How does billing work?",
      a: "We issue a consolidated weekly invoice every Monday covering the previous week's deliveries. Payment via bank transfer or UPI.",
    },
    {
      q: "Can we customise bowl selection?",
      a: "Absolutely. Each team member can pick their bowl, or you can set a fixed menu for the week. We'll work with your point of contact to set it up.",
    },
  ];

  return (
    <>
      {/* ── Hero strip ───────────────────────────────────── */}
      <section className="bg-ink pt-32 pb-20 px-6 lg:px-16" aria-labelledby="b2b-hero-heading">
        <div className="max-w-7xl mx-auto">
          <p className="section-eyebrow text-terracotta mb-5">B2B Partnerships</p>
          <h1
            id="b2b-hero-heading"
            className="font-display text-white mb-5"
            style={{ fontSize: "clamp(42px, 5.5vw, 72px)", lineHeight: "1.06" }}
          >
            Partner with Nutravoe
          </h1>
          <p className="font-body text-[16px] font-light text-white/60 max-w-xl leading-relaxed mb-16">
            Wholesome protein bowls for your entire team — delivered fresh, billed weekly.
          </p>

          {/* Benefit blocks */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-2xl">
            {[
              {
                icon: (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                    <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                  </svg>
                ),
                label: "Volume Pricing",
              },
              {
                icon: (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                ),
                label: "Flexible Scheduling",
              },
              {
                icon: (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                ),
                label: "Dedicated Account Manager",
              },
            ].map(({ icon, label }) => (
              <div key={label} className="flex items-center gap-3">
                <div className="text-sage flex-shrink-0">{icon}</div>
                <span className="font-body text-[14px] font-medium text-white/80">
                  {label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Form section ─────────────────────────────────── */}
      <section
        className="py-20 px-6 lg:px-16"
        style={{ backgroundColor: "#F9F8F6" }}
        aria-labelledby="b2b-form-heading"
      >
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-[1fr_1.6fr] gap-16 items-start">

          {/* Left — value-prop sidebar */}
          <div className="lg:sticky lg:top-28">
            <h2
              id="b2b-form-heading"
              className="font-display text-ink mb-8"
              style={{ fontSize: "clamp(28px, 2.5vw, 38px)", lineHeight: "1.15" }}
            >
              Why partner with us?
            </h2>
            <ul className="space-y-5 list-none p-0 m-0">
              {[
                "Fresh bowls made daily, never frozen",
                "Custom bowl selection per delivery",
                "Weekly consolidated invoice",
                "WhatsApp-based ordering for your team",
              ].map((point) => (
                <li key={point} className="flex items-start gap-3">
                  {/* Check icon */}
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#7D9B76"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="flex-shrink-0 mt-0.5"
                    aria-hidden="true"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <span className="font-body text-[14px] text-stone leading-relaxed">
                    {point}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Right — form */}
          <div className="bg-white rounded-2xl border border-black/[0.06] px-8 py-10 shadow-sm">
            <h3 className="font-display text-ink mb-8" style={{ fontSize: "clamp(24px, 2vw, 32px)" }}>
              Get in touch
            </h3>

            <form
              noValidate
              onSubmit={(e) => e.preventDefault()}
              className="flex flex-col gap-6"
              aria-label="B2B enquiry form"
            >
              {/* Row 1 — contact name + org name */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <Field label="Contact person name" error={errors.contactName}>
                  <input
                    type="text"
                    value={form.contactName}
                    onChange={(e) => update("contactName", e.target.value)}
                    placeholder="Priya Sharma"
                    className={`${inputBase} ${errors.contactName ? inputError : ""}`}
                    aria-describedby={errors.contactName ? "err-contactName" : undefined}
                    aria-invalid={!!errors.contactName}
                    autoComplete="name"
                  />
                </Field>
                <Field label="Organisation name" error={errors.orgName}>
                  <input
                    type="text"
                    value={form.orgName}
                    onChange={(e) => update("orgName", e.target.value)}
                    placeholder="Acme Corp Bangalore"
                    className={`${inputBase} ${errors.orgName ? inputError : ""}`}
                    aria-invalid={!!errors.orgName}
                    autoComplete="organization"
                  />
                </Field>
              </div>

              {/* Organisation type */}
              <Field label="Organisation type" error={errors.orgType}>
                <select
                  value={form.orgType}
                  onChange={(e) => update("orgType", e.target.value)}
                  className={`${inputBase} ${errors.orgType ? inputError : ""} appearance-none`}
                  aria-invalid={!!errors.orgType}
                >
                  <option value="" disabled>Select type…</option>
                  <option value="Corporate Office">Corporate Office</option>
                  <option value="Gym & Fitness Studio">Gym &amp; Fitness Studio</option>
                  <option value="Hotel & Hospitality">Hotel &amp; Hospitality</option>
                  <option value="Co-working Space">Co-working Space</option>
                  <option value="School or College">School or College</option>
                  <option value="Other">Other</option>
                </select>
              </Field>

              {/* Row 2 — phone + email */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <Field label="Phone" error={errors.phone}>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => update("phone", e.target.value)}
                    placeholder="9876543210"
                    className={`${inputBase} ${errors.phone ? inputError : ""}`}
                    aria-invalid={!!errors.phone}
                    autoComplete="tel"
                    maxLength={12}
                  />
                </Field>
                <Field label="Email" error={errors.email}>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => update("email", e.target.value)}
                    placeholder="priya@company.com"
                    className={`${inputBase} ${errors.email ? inputError : ""}`}
                    aria-invalid={!!errors.email}
                    autoComplete="email"
                  />
                </Field>
              </div>

              {/* Row 3 — weekly qty + delivery time */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <Field label="Estimated weekly quantity" error={errors.weeklyQty}>
                  <select
                    value={form.weeklyQty}
                    onChange={(e) => update("weeklyQty", e.target.value)}
                    className={`${inputBase} ${errors.weeklyQty ? inputError : ""} appearance-none`}
                    aria-invalid={!!errors.weeklyQty}
                  >
                    <option value="" disabled>Select range…</option>
                    <option value="20–50 bowls">20–50 bowls</option>
                    <option value="50–100 bowls">50–100 bowls</option>
                    <option value="100–200 bowls">100–200 bowls</option>
                    <option value="200+ bowls">200+ bowls</option>
                  </select>
                </Field>
                <Field label="Preferred delivery time" error={errors.deliveryTime}>
                  <select
                    value={form.deliveryTime}
                    onChange={(e) => update("deliveryTime", e.target.value)}
                    className={`${inputBase} ${errors.deliveryTime ? inputError : ""} appearance-none`}
                    aria-invalid={!!errors.deliveryTime}
                  >
                    <option value="" disabled>Select window…</option>
                    <option value="7–8 AM">7–8 AM</option>
                    <option value="8–9 AM">8–9 AM</option>
                    <option value="9–10 AM">9–10 AM</option>
                    <option value="Flexible">Flexible</option>
                  </select>
                </Field>
              </div>

              {/* Additional notes */}
              <Field label="Additional notes" required={false}>
                <textarea
                  value={form.notes}
                  onChange={(e) => update("notes", e.target.value)}
                  placeholder="Any specific requirements, dietary restrictions, or questions…"
                  rows={4}
                  maxLength={400}
                  className={`${inputBase} resize-none`}
                />
                <p className="font-body text-[11px] text-stone/60 text-right mt-0.5">
                  {form.notes.length}/400
                </p>
              </Field>

              {/* CTA note + buttons */}
              <div className="pt-2">
                <p className="font-body text-[12px] text-stone mb-4 leading-relaxed">
                  Your WhatsApp will open with a pre-filled message — just tap Send.
                </p>
                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    type="button"
                    onClick={handleWhatsApp}
                    className="btn-sage flex items-center justify-center gap-2.5 flex-1 min-h-[48px]"
                  >
                    {/* WhatsApp icon */}
                    <svg
                      width="17"
                      height="17"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                    </svg>
                    Send via WhatsApp
                  </button>
                  <button
                    type="button"
                    onClick={handleEmail}
                    className="flex-1 min-h-[48px] font-body text-sm font-medium tracking-widest text-ink rounded-sm border border-black/20 bg-transparent transition-all duration-200 hover:border-sage hover:text-sage-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 px-6"
                  >
                    Send by Email
                  </button>
                </div>

                {/* Show global validation notice if submitted with errors */}
                {submitted && Object.keys(errors).length > 0 && (
                  <p
                    className="mt-4 font-body text-[13px] text-terracotta"
                    role="alert"
                    aria-live="polite"
                  >
                    Please fill in all required fields before sending.
                  </p>
                )}
              </div>
            </form>
          </div>
        </div>
      </section>

      {/* ── FAQ section ──────────────────────────────────── */}
      <section className="bg-white py-16 px-6 lg:px-16" aria-labelledby="b2b-faq-heading">
        <div className="max-w-3xl mx-auto">
          <p className="section-eyebrow mb-4">Questions</p>
          <h2
            id="b2b-faq-heading"
            className="font-display text-ink mb-10"
            style={{ fontSize: "clamp(30px, 3vw, 44px)", lineHeight: "1.15" }}
          >
            Frequently asked
          </h2>
          <Accordion items={faqItems} />
        </div>
      </section>
    </>
  );
}
