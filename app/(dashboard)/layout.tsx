"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem("nutravoe_currentUser");
    if (!stored) {
      router.push("/signin");
    } else {
      setUser(JSON.parse(stored));
      setLoading(false);
    }
  }, [router]);

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
    { name: "Addresses", path: "/addresses" },
    { name: "Payment Methods", path: "/payment-methods" },
    { name: "Help & Support", path: "/help" },
  ];

  return (
    <div className="min-h-[calc(100vh-64px)] bg-[#F9F8F6] pt-12 pb-24">
      <div className="max-w-6xl mx-auto px-6">
        <h1 className="font-display text-4xl text-ink mb-2">Welcome, {user?.name?.split(" ")[0]}</h1>
        <p className="font-body text-stone text-[14px] mb-10">Manage your Account, Orders, and Deliveries.</p>
        
        <div className="flex flex-col md:flex-row gap-8 lg:gap-14">
          {/* Sidebar */}
          <aside className="w-full md:w-56 shrink-0">
            <nav className="flex flex-col gap-1 sticky top-24">
              {navItems.map(item => {
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
                    {item.name}
                    {isActive && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>}
                  </Link>
                );
              })}
              <div className="h-px bg-black/5 my-3 mx-4" />
              <button 
                onClick={() => {
                  localStorage.removeItem("nutravoe_currentUser");
                  window.dispatchEvent(new Event("auth_change"));
                  router.push("/");
                }}
                className="px-4 py-2.5 rounded-lg font-body text-[13.5px] text-terracotta hover:bg-terracotta/5 font-medium text-left transition-colors"
              >
                Sign Out
              </button>
            </nav>
          </aside>

          {/* Main Content Area */}
          <main className="flex-1 bg-white rounded-xl shadow-[0_2px_20px_rgb(0,0,0,0.03)] border border-black/5 p-8 min-h-[500px]">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
