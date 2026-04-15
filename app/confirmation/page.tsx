import Link from "next/link";
import { getWhatsAppHref } from "@/lib/contact";

export const metadata = {
  title: "Order Received — Nutravoe",
  description: "Your Nutravoe order has been received. We'll confirm via WhatsApp shortly.",
};

export default function ConfirmationPage({
  searchParams,
}: {
  searchParams: { source?: string };
}) {
  const isWallet = searchParams.source === "wallet";

  return (
    <section className="min-h-[80vh] flex items-center justify-center px-6 py-24">
      <div className="max-w-xl text-center">
        {/* Icon */}
        <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-8 ${isWallet ? "bg-sage/10" : "bg-sage/10"}`}>
          <span className="text-3xl">✓</span>
        </div>

        {isWallet && <p className="section-eyebrow mb-4">Order Confirmed</p>}
        <h1
          className="section-heading text-ink mb-6"
          style={{ fontSize: "clamp(36px, 5vw, 56px)" }}
        >
          {isWallet ? (
            <>Your bowl is<br /><em className="text-sage">on its way.</em></>
          ) : (
            <>Almost<br /><em className="text-sage">there!</em></>
          )}
        </h1>

        {isWallet ? (
          <p className="font-body text-[15px] font-light text-stone leading-loose mb-10 max-w-sm mx-auto">
            Your order is confirmed and payment has been deducted from your wallet.
            We&apos;ll prepare it fresh and deliver it the same day.
          </p>
        ) : (
          <p className="font-body text-[15px] font-light text-stone leading-loose mb-10 max-w-sm mx-auto">
            Your bowl is one tap away. A WhatsApp message has been drafted for you — just
            hit Send to confirm. Once we get it, we&apos;ll prepare your bowl fresh and
            deliver it the same day.
          </p>
        )}

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link href="/menu" className="btn-primary text-xs tracking-widest">
            Order Again
          </Link>
          {isWallet ? (
            <Link href="/orders" className="btn-ghost text-xs tracking-widest">
              View Orders
            </Link>
          ) : (
            <a
              href={getWhatsAppHref()}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-ghost text-xs tracking-widest"
            >
              Chat with Us
            </a>
          )}
        </div>

        <p className="font-body text-xs text-stone mt-10 tracking-wide">
          Questions? WhatsApp us at +91 78998 58374 or email nutravoe@gmail.com
        </p>
      </div>
    </section>
  );
}
