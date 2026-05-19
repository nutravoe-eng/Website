"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCart } from "@/components/CartContext";
import {
  MOBILE_SHELL_BOTTOM_NAV_HEIGHT_REM,
  shouldShowMobileBottomNav,
  shouldShowMobileCartBar,
} from "@/lib/mobile-shell";
import { formatCurrency } from "@/lib/utils";

export default function MobileCartBar() {
  const pathname = usePathname() || "/";
  const { itemCount, total } = useCart();

  if (!shouldShowMobileCartBar(pathname, itemCount)) {
    return null;
  }

  const bottomOffset = shouldShowMobileBottomNav(pathname)
    ? `${MOBILE_SHELL_BOTTOM_NAV_HEIGHT_REM}rem`
    : "0px";

  return (
    <div className="fixed inset-x-0 z-[55] md:hidden" style={{ bottom: bottomOffset }}>
      <div className="mx-auto max-w-2xl px-3 pb-1">
        <div className="flex items-center justify-between gap-3 rounded-[20px] border border-black/8 bg-white/96 px-3 py-1.5 shadow-[0_8px_24px_rgba(0,0,0,0.08)] backdrop-blur-md">
          <div className="min-w-0">
            <p className="font-body text-[9px] font-bold uppercase tracking-[0.16em] text-stone">
              Cart
            </p>
            <p className="font-body text-[12px] font-semibold text-ink">
              {itemCount} item{itemCount === 1 ? "" : "s"} · {formatCurrency(total)}
            </p>
          </div>
          <Link
            href="/cart"
            className="shrink-0 rounded-full bg-terracotta px-3.5 py-1.5 font-body text-[10.5px] font-bold tracking-wide text-white transition-colors hover:bg-[#D55F43]"
          >
            View cart
          </Link>
        </div>
      </div>
    </div>
  );
}
