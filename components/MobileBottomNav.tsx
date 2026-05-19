"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  getMobileAccountHref,
  getMobileNavActiveKey,
  shouldShowMobileBottomNav,
} from "@/lib/mobile-shell";

const NAV_ITEMS = [
  {
    key: "home" as const,
    href: "/",
    label: "Home",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 10.5 12 4l8 6.5" />
        <path d="M6.5 9.5V20h11V9.5" />
      </svg>
    ),
  },
  {
    key: "menu" as const,
    href: "/menu",
    label: "Menu",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <path d="M7 8V6a5 5 0 0 1 10 0v2" />
        <path d="M5 8h14l-1 11H6L5 8Z" />
      </svg>
    ),
  },
  {
    key: "subscribe" as const,
    href: "/subscribe",
    label: "Subscription",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <path d="m17 2 4 4-4 4" />
        <path d="M3 11V9a4 4 0 0 1 4-4h14" />
        <path d="m7 22-4-4 4-4" />
        <path d="M21 13v2a4 4 0 0 1-4 4H3" />
        <rect x="9" y="9.5" width="6" height="4" rx="0.5" />
        <path d="M9 11.5h6" />
      </svg>
    ),
  },
  {
    key: "account" as const,
    href: "/account",
    label: "Account",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="8" r="3.5" />
        <path d="M5 20a7 7 0 0 1 14 0" />
      </svg>
    ),
  },
];

export default function MobileBottomNav() {
  const pathname = usePathname() || "/";
  const activeKey = getMobileNavActiveKey(pathname);
  const [accountHref, setAccountHref] = useState("/account");
  const [isSignedIn, setIsSignedIn] = useState(false);

  useEffect(() => {
    let mounted = true;
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (mounted) {
        const signedIn = Boolean(user);
        setIsSignedIn(signedIn);
        setAccountHref(getMobileAccountHref(signedIn));
      }
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      const signedIn = Boolean(session?.user);
      setIsSignedIn(signedIn);
      setAccountHref(getMobileAccountHref(signedIn));
    });
    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  if (!shouldShowMobileBottomNav(pathname)) return null;

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-[45] border-t border-black/5 bg-white/95 backdrop-blur-md md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="grid grid-cols-4">
        {NAV_ITEMS.map((item) => {
          const href = item.key === "account" ? accountHref : item.href;
          const isActive = activeKey === item.key;
          const label = item.key === "account" && !isSignedIn ? "Sign in" : item.label;
          return (
            <Link
              key={item.key}
              href={href}
              aria-current={isActive ? "page" : undefined}
              className={`flex min-h-[64px] flex-col items-center justify-center gap-1 px-1 py-1.5 transition-colors ${
                isActive ? "text-sage-dark" : "text-stone hover:text-ink"
              }`}
            >
              <span
                className={`flex h-[34px] w-[34px] items-center justify-center rounded-full transition-colors ${
                  isActive ? "bg-sage/12 text-sage-dark" : "text-stone"
                }`}
              >
                {item.icon}
              </span>
              <span className="font-body text-[9.5px] font-medium tracking-wide">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
