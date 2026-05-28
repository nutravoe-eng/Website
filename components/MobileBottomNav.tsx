"use client";

import { useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  getMobileAccountHref,
  getMobileNavActiveKey,
  shouldShowMobileBottomNav,
} from "@/lib/mobile-shell";

const NAV_ICON_FILTER = {
  active: "invert(50%) sepia(18%) saturate(841%) hue-rotate(358deg) brightness(92%) contrast(88%)",
  hover: "brightness(0) saturate(100%) invert(14%) sepia(0%) saturate(2%) hue-rotate(177deg) brightness(97%) contrast(91%)",
};

type NavItemKey = "home" | "menu" | "subscribe" | "account";

type NavItem = {
  key: NavItemKey;
  href: string;
  label: string;
  icon: string;
  iconSize: number;
};

function NavImageIcon({
  src,
  size = 22,
  active = false,
}: {
  src: string;
  size?: number;
  active?: boolean;
}) {
  const style = {
    width: size,
    height: size,
    "--nav-icon-filter": active ? NAV_ICON_FILTER.active : "none",
    "--nav-icon-hover-filter": NAV_ICON_FILTER.hover,
  } as CSSProperties;

  return (
    <img
      src={src}
      alt=""
      aria-hidden="true"
      className="object-contain transition-[filter] [filter:var(--nav-icon-filter)] group-hover:[filter:var(--nav-icon-hover-filter)]"
      style={style}
    />
  );
}

const NAV_ITEMS: NavItem[] = [
  {
    key: "home",
    href: "/",
    label: "Home",
    icon: "/nav-home.svg",
    iconSize: 22,
  },
  {
    key: "menu",
    href: "/menu",
    label: "Menu",
    icon: "/nav-menu.svg",
    iconSize: 22,
  },
  {
    key: "subscribe",
    href: "/subscribe",
    label: "Subscription",
    icon: "/nav-subscription.svg",
    iconSize: 28,
  },
  {
    key: "account",
    href: "/account",
    label: "Account",
    icon: "/nav-sign-in.svg",
    iconSize: 20,
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
              className={`group flex min-h-[64px] flex-col items-center justify-center gap-1 px-1 py-1.5 transition-colors ${
                isActive ? "text-sage-dark hover:text-ink" : "text-stone hover:text-ink"
              }`}
            >
              <span
                className={`flex h-[34px] w-[34px] items-center justify-center rounded-full transition-colors ${
                  isActive ? "bg-sage/12 text-sage-dark group-hover:text-ink" : "text-stone group-hover:text-ink"
                }`}
              >
                <NavImageIcon src={item.icon} size={item.iconSize} active={isActive} />
              </span>
              <span className="font-body text-[9.5px] font-medium tracking-wide">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
