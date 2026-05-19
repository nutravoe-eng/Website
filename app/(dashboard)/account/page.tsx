"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getWallet, hasActiveFlexibleSubscription } from "@/lib/wallet";
import { formatCurrency } from "@/lib/utils";

const ChevronRight = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="text-stone/40 shrink-0"
  >
    <path d="m9 18 6-6-6-6" />
  </svg>
);

export default function AccountHubPage() {
  const router = useRouter();
  const [walletBalanceRs, setWalletBalanceRs] = useState<number | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const isFlexible = await hasActiveFlexibleSubscription();
      if (!mounted || !isFlexible) return;
      const wallet = await getWallet();
      if (mounted) setWalletBalanceRs(wallet.balancePaise / 100);
    })();
    return () => { mounted = false; };
  }, []);

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
  };

  return (
    <div className="-mx-4 -my-4 divide-y divide-black/5 md:-mx-8 md:-my-8">
      {/* Orders */}
      <Link href="/orders" className="flex min-h-[50px] items-center justify-between px-4 py-3.5 transition-colors hover:bg-[#F9F8F6] md:px-8">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-black/5 flex items-center justify-center shrink-0 text-stone">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
              <polyline points="3.29 7 12 12 20.71 7"/>
              <line x1="12" y1="22" x2="12" y2="12"/>
            </svg>
          </div>
          <p className="font-body text-[14px] font-medium text-ink">Orders</p>
        </div>
        <ChevronRight />
      </Link>

      {/* Subscriptions */}
      <Link href="/subscriptions" className="flex min-h-[50px] items-center justify-between px-4 py-3.5 transition-colors hover:bg-[#F9F8F6] md:px-8">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-black/5 flex items-center justify-center shrink-0 text-stone">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
              <path d="M3 3v5h5"/>
            </svg>
          </div>
          <p className="font-body text-[14px] font-medium text-ink">Subscriptions</p>
        </div>
        <ChevronRight />
      </Link>

      {/* Wallet — only for flexible subscribers */}
      {walletBalanceRs !== null && (
        <Link href="/wallet" className="flex min-h-[50px] items-center justify-between px-4 py-3.5 transition-colors hover:bg-[#F9F8F6] md:px-8">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-terracotta/10 flex items-center justify-center shrink-0 text-terracotta">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/>
                <path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/>
                <path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/>
              </svg>
            </div>
            <p className="font-body text-[14px] font-medium text-ink">Wallet</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-body text-[12px] font-bold text-terracotta bg-terracotta/10 px-2.5 py-1 rounded-full">
              {formatCurrency(walletBalanceRs)}
            </span>
            <ChevronRight />
          </div>
        </Link>
      )}

      {/* Addresses */}
      <Link href="/addresses" className="flex min-h-[50px] items-center justify-between px-4 py-3.5 transition-colors hover:bg-[#F9F8F6] md:px-8">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-black/5 flex items-center justify-center shrink-0 text-stone">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
              <circle cx="12" cy="10" r="3"/>
            </svg>
          </div>
          <p className="font-body text-[14px] font-medium text-ink">Addresses</p>
        </div>
        <ChevronRight />
      </Link>

      {/* Help & Support */}
      <Link href="/help" className="flex min-h-[50px] items-center justify-between px-4 py-3.5 transition-colors hover:bg-[#F9F8F6] md:px-8">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-black/5 flex items-center justify-center shrink-0 text-stone">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
              <path d="M12 17h.01"/>
            </svg>
          </div>
          <p className="font-body text-[14px] font-medium text-ink">Help & Support</p>
        </div>
        <ChevronRight />
      </Link>

      {/* Profile Settings */}
      <Link href="/profile" className="flex min-h-[50px] items-center justify-between px-4 py-3.5 transition-colors hover:bg-[#F9F8F6] md:px-8">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-black/5 flex items-center justify-center shrink-0 text-stone">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
          </div>
          <p className="font-body text-[14px] font-medium text-ink">Profile Settings</p>
        </div>
        <ChevronRight />
      </Link>

      {/* Sign Out */}
      <div className="px-4 py-3.5 md:px-8">
        <button
          onClick={handleSignOut}
          className="font-body text-[14px] font-medium text-terracotta hover:text-terracotta-dark transition-colors min-h-[44px] flex items-center"
        >
          Sign Out
        </button>
      </div>
    </div>
  );
}
