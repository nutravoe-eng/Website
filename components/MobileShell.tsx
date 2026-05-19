"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import Footer from "@/components/Footer";
import MobileBottomNav from "@/components/MobileBottomNav";
import MobileCartBar from "@/components/MobileCartBar";
import WhatsAppButton from "@/components/WhatsAppButton";
import { useCart } from "@/components/CartContext";
import {
  getBottomSafeAreaPaddingRem,
  shouldShowMinimalFooter,
  shouldShowMobileBottomNav,
  shouldShowMobileCartBar,
  shouldShowWhatsAppFab,
} from "@/lib/mobile-shell";

export default function MobileShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() || "/";
  const { itemCount } = useCart();
  const bottomPaddingRem = getBottomSafeAreaPaddingRem({ pathname, itemCount });
  const footerIsMinimal = shouldShowMinimalFooter(pathname);
  const showBottomNav = shouldShowMobileBottomNav(pathname);
  const showCartBar = shouldShowMobileCartBar(pathname, itemCount);
  const showMobileWhatsApp = shouldShowWhatsAppFab(pathname);

  return (
    <>
      <main id="main" className="flex-1 pt-16">
        {children}
      </main>
      <div
        className="pb-[var(--mobile-shell-bottom-padding)] md:pb-0"
        style={{ ["--mobile-shell-bottom-padding" as string]: `${bottomPaddingRem}rem` }}
      >
        <Footer minimal={footerIsMinimal} />
      </div>
      {showBottomNav ? <MobileCartBar /> : null}
      {showBottomNav ? <MobileBottomNav /> : null}
      <div className="hidden md:block">
        <WhatsAppButton />
      </div>
      {showMobileWhatsApp ? (
        <div className="md:hidden">
          <WhatsAppButton lifted={showBottomNav} clearCartBar={showCartBar} />
        </div>
      ) : null}
    </>
  );
}
