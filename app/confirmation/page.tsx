import Link from "next/link";

export const metadata = {
  title: "Order Confirmed — Nutravoe",
  description: "Your Nutravoe bowl is being prepared. Delivery between 7–10 AM.",
};

export default function ConfirmationPage() {
  return (
    <section className="min-h-[80vh] flex items-center justify-center px-6 py-24">
      <div className="max-w-xl text-center">
        {/* Icon */}
        <div className="w-16 h-16 rounded-full bg-sage/10 flex items-center justify-center mx-auto mb-8">
          <span className="text-3xl">✓</span>
        </div>

        <p className="section-eyebrow mb-4">Order Received</p>
        <h1
          className="section-heading text-ink mb-6"
          style={{ fontSize: "clamp(36px, 5vw, 56px)" }}
        >
          Your bowl is<br />
          <em className="text-sage">on its way.</em>
        </h1>

        <p className="font-body text-[15px] font-light text-stone leading-loose mb-10 max-w-sm mx-auto">
          We&apos;ll prepare your order fresh tomorrow morning and deliver between
          7–10 AM. We&apos;ll message you on WhatsApp to confirm.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link href="/menu" className="btn-primary text-xs tracking-widest">
            Order Again
          </Link>
          <a
            href={getWhatsAppHref()}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-ghost text-xs tracking-widest"
          >
            Chat with Us
          </a>
        </div>

        <p className="font-body text-xs text-stone mt-10 tracking-wide">
          Questions? WhatsApp us at +91 78998 58374 or email nutravoe@gmail.com
        </p>
      </div>
    </section>
  );
}
import { getWhatsAppHref } from "@/lib/contact";
