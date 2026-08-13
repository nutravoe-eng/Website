import Link from "next/link";

export const metadata = {
  title: "Order Received — Nutravoe",
  description: "Your Nutravoe order request has been received. We'll confirm it shortly.",
  robots: { index: false, follow: false },
};

export default function ConfirmationPage({
  searchParams,
}: {
  searchParams: { source?: string; paid?: string };
}) {
  const isWallet = searchParams.source === "wallet";
  const isOnline = searchParams.source === "online";
  const paymentFailed = searchParams.paid === "0";

  return (
    <section className="min-h-[80vh] flex items-center justify-center px-6 py-24">
      <div className="max-w-xl text-center">
        {/* Icon */}
        <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-8 ${isWallet || isOnline ? "bg-sage/10" : paymentFailed ? "bg-terracotta/10" : "bg-sage/10"}`}>
          <span className="text-3xl">{paymentFailed ? "!" : "✓"}</span>
        </div>

        {(isWallet || isOnline) && !paymentFailed && <p className="section-eyebrow mb-4">Order Confirmed</p>}
        <h1
          className="section-heading text-ink mb-6"
          style={{ fontSize: "clamp(36px, 5vw, 56px)" }}
        >
          {paymentFailed ? (
            <>Payment<br /><em className="text-terracotta">not confirmed.</em></>
          ) : isWallet || isOnline ? (
            <>Your bowl is<br /><em className="text-sage">on its way.</em></>
          ) : (
            <>Request<br /><em className="text-sage">received.</em></>
          )}
        </h1>

        {paymentFailed ? (
          <p className="font-body text-[15px] font-light text-stone leading-loose mb-10 max-w-sm mx-auto">
            We couldn&apos;t confirm your payment yet. If money was deducted, it will reflect shortly — check your orders page or contact us.
          </p>
        ) : isWallet ? (
          <p className="font-body text-[15px] font-light text-stone leading-loose mb-10 max-w-sm mx-auto">
            Your order is confirmed and payment has been deducted from your wallet.
            We&apos;ll prepare it fresh and deliver it the same day.
          </p>
        ) : isOnline ? (
          <p className="font-body text-[15px] font-light text-stone leading-loose mb-10 max-w-sm mx-auto">
            Your order is confirmed and payment was received. We&apos;ll prepare it fresh and deliver it on your selected slot.
          </p>
        ) : (
          <p className="font-body text-[15px] font-light text-stone leading-loose mb-10 max-w-sm mx-auto">
            Your order request has been placed successfully. Our team will reach out to confirm payment and then process your order.
          </p>
        )}

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link href="/menu" className="btn-primary text-xs tracking-widest">
            Order Again
          </Link>
          <Link href="/orders" className="btn-ghost text-xs tracking-widest">
            View Orders
          </Link>
        </div>

        <p className="font-body text-xs text-stone mt-10 tracking-wide">
          Questions? Reach us at +91 78998 58374 or nutravoe@gmail.com
        </p>
      </div>
    </section>
  );
}
