"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { getWallet, hasActiveFlexibleSubscription } from "@/lib/wallet";
import { formatCurrency } from "@/lib/utils";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();

  const [user, setUser] = useState<{ name: string; email: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [walletBalanceRs, setWalletBalanceRs] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) {
        router.push(`/signin?next=${pathname}`);
        return;
      }
      const name =
        (authUser.user_metadata?.full_name as string | undefined) ??
        authUser.email?.split("@")[0] ??
        "there";
      setUser({ name, email: authUser.email ?? "" });
      setLoading(false);

      const isFlexible = await hasActiveFlexibleSubscription();
      if (isFlexible) {
        const w = await getWallet();
        setWalletBalanceRs(w.balancePaise / 100);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/");
  };

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-64px)] flex flex-col items-center justify-center bg-[#F9F8F6]">
        <div className="w-8 h-8 rounded-full border-2 border-sage border-t-transparent animate-spin mb-4"></div>
        <p className="font-body text-xs text-stone tracking-wide">LOADING PROFILE</p>
      </div>
    );
  }

  const navItems = [
    { name: "Profile", path: "/profile" },
    { name: "Orders", path: "/orders" },
    { name: "Subscriptions", path: "/subscriptions" },
    ...(walletBalanceRs !== null
      ? [{ name: "Wallet", path: "/wallet", badge: formatCurrency(walletBalanceRs) }]
      : []),
    { name: "Addresses", path: "/addresses" },
    { name: "Help & Support", path: "/help" },
  ] as { name: string; path: string; badge?: string }[];

  return (
    <div className="min-h-[calc(100vh-64px)] bg-[#F9F8F6] pt-12 pb-24">
      <div className="max-w-6xl mx-auto px-6">
        <h1 className="font-display text-4xl text-ink mb-2">
          Welcome, {user?.name?.split(" ")[0]}
        </h1>
        <p className="font-body text-stone text-[14px] mb-10">
          Manage your Account, Orders, and Deliveries.
        </p>

        <div className="flex flex-col md:flex-row gap-8 lg:gap-14">
          {/* Sidebar */}
          <aside className="w-full md:w-56 shrink-0">
            <nav className="flex flex-col gap-1 sticky top-24">
              {navItems.map((item) => {
                const isActive = pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    href={item.path}
                    className={`px-4 py-2.5 rounded-lg font-body text-[13.5px] transition-colors flex items-center justify-between ${
                      isActive
                        ? "bg-sage/10 text-sage font-bold"
                        : "text-stone hover:bg-black/5 hover:text-ink font-medium"
                    }`}
                  >
                    <span>{item.name}</span>
                    <span className="flex items-center gap-1.5">
                      {item.badge && (
                        <span className="font-body text-[10px] font-bold bg-terracotta/10 text-terracotta px-1.5 py-0.5 rounded-full">
                          {item.badge}
                        </span>
                      )}
                      {isActive && (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="m9 18 6-6-6-6"/>
                        </svg>
                      )}
                    </span>
                  </Link>
                );
              })}

              <div className="h-px bg-black/5 my-3 mx-4" />

              <button
                onClick={handleSignOut}
                className="px-4 py-2.5 rounded-lg font-body text-[13.5px] text-terracotta hover:bg-terracotta/5 font-medium text-left transition-colors"
              >
                Sign Out
              </button>
            </nav>
          </aside>

          {/* Main Content */}
          <section className="flex-1 bg-white rounded-xl shadow-[0_2px_20px_rgb(0,0,0,0.03)] border border-black/5 p-8 min-h-[500px]">
            {children}
          </section>
        </div>
      </div>
    </div>
  );
}
