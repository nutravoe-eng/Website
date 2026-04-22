"use client";

import Link from "next/link";

interface AdminTopNavProps {
  current: "deliveries" | "subscriptions" | "delivery-settings";
  onRefresh?: () => void;
}

function navClass(active: boolean): string {
  return `font-body text-[12px] font-bold uppercase tracking-wider border rounded-lg px-3 py-2 transition-colors ${
    active
      ? "border-ink bg-ink text-white"
      : "border-black/10 text-stone hover:text-ink hover:bg-black/5"
  }`;
}

export default function AdminTopNav({ current, onRefresh }: AdminTopNavProps) {
  return (
    <div className="flex items-center gap-2">
      <Link href="/admin" className={navClass(current === "deliveries")}>
        Today&apos;s Deliveries
      </Link>
      <Link href="/admin/subscriptions" className={navClass(current === "subscriptions")}>
        Subscriptions
      </Link>
      <Link href="/admin/delivery-settings" className={navClass(current === "delivery-settings")}>
        Delivery Settings
      </Link>
      {onRefresh && (
        <button
          onClick={onRefresh}
          className="font-body text-[12px] font-bold uppercase tracking-wider text-stone hover:text-ink border border-black/10 rounded-lg px-3 py-2 hover:bg-black/5 transition-colors"
        >
          Refresh
        </button>
      )}
    </div>
  );
}
