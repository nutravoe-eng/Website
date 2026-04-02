"use client";

import Link from "next/link";

export default function CancellationsPage() {
  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="max-w-2xl">
        <h2 className="font-display text-2xl font-medium text-ink mb-2">Order Changes</h2>
        <p className="font-body text-[14px] text-stone mb-8 leading-relaxed">
          Once an order has been placed, cancellations and refunds are not processed through the website.
        </p>

        <div className="rounded-xl border border-black/6 bg-[#F9F8F6] p-6">
          <p className="font-body text-[11px] font-bold uppercase tracking-wider text-stone mb-3">
            Current Policy
          </p>
          <p className="font-body text-[14px] text-ink leading-relaxed mb-3">
            If you need help with an order that has already been placed, please contact Nutravoe support directly.
          </p>
          <p className="font-body text-[13px] text-stone leading-relaxed">
            The dashboard no longer supports self-serve cancellations or refund requests.
          </p>
        </div>

        <div className="mt-6 flex gap-3">
          <Link
            href="/help"
            className="bg-sage hover:bg-sage-dark text-white font-body text-[13px] font-bold px-6 py-2.5 rounded-md transition-colors shadow-sm"
          >
            Contact Support
          </Link>
          <Link
            href="/orders"
            className="bg-black/5 hover:bg-black/10 text-ink font-body text-[13px] font-bold px-6 py-2.5 rounded-md transition-colors"
          >
            Back to Orders
          </Link>
        </div>
      </div>
    </div>
  );
}
