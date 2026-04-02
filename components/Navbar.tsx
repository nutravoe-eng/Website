"use client";

import { useState, useEffect, FormEvent } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useCart } from "./CartContext";
import { createClient } from "@/lib/supabase/client";
import { getWallet, hasActiveFlexibleSubscription } from "@/lib/wallet";
import { formatCurrency } from "@/lib/utils";
import { geocodePincode } from "@/lib/geocodeCache";
import { getNearestHub, DELIVERY_FEE_RS, FREE_ZONE_RADIUS_KM } from "@/lib/delivery";
import { getWhatsAppHref } from "@/lib/contact";

const NAV_LINKS = [
  { href: "/menu", label: "Menu" },
  { href: "/about", label: "About" },
  { href: "/subscribe", label: "Subscribe & Save" },
];

export default function Navbar() {
  const pathname = usePathname();
  const isHomePage = pathname === "/";
  const { itemCount } = useCart();
  const supabase = createClient();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // Location Modal State
  const [showLocationModal, setShowLocationModal] = useState(false);
  // Waitlist form state
  const [waitlistName, setWaitlistName] = useState("");
  const [waitlistEmail, setWaitlistEmail] = useState("");
  const [waitlistPhone, setWaitlistPhone] = useState("");
  const [waitlistSubmitting, setWaitlistSubmitting] = useState(false);
  const [savedPincode, setSavedPincode] = useState("560001");
  const [inputPincode, setInputPincode] = useState("");
  const [locationState, setLocationState] = useState<"idle" | "invalid" | "waitlist" | "success">("idle");
  const [deliveryZone, setDeliveryZone] = useState<{ fee: number; distanceKm: number; hubName: string } | null>(null);
  const [checkingZone, setCheckingZone] = useState(false);

  // Auth State
  const [user, setUser] = useState<{ name: string; email: string } | null>(null);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const [savedAddresses, setSavedAddresses] = useState<any[]>([]);
  const [walletBalanceRs, setWalletBalanceRs] = useState<number | null>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll);

    const applyUser = async (authUser: { id?: string; email?: string | null; user_metadata?: Record<string, unknown> } | null) => {
      if (authUser) {
        const name =
          (authUser.user_metadata?.full_name as string | undefined) ??
          authUser.email?.split("@")[0] ??
          "there";
        setUser({ name, email: authUser.email ?? "" });
        // Wallet badge
        const isFlexible = await hasActiveFlexibleSubscription();
        if (isFlexible) {
          const w = await getWallet();
          setWalletBalanceRs(w.balancePaise / 100);
        } else {
          setWalletBalanceRs(null);
        }
        // Saved addresses (from localStorage cache written by addresses page)
        const addys = localStorage.getItem("nutravoe_addresses");
        if (addys) {
          const parsedAddys = JSON.parse(addys);
          setSavedAddresses(parsedAddys);
          if (parsedAddys.length > 0) {
            const defaultAddr = parsedAddys.find((a: { isDefault?: boolean }) => a.isDefault) ?? parsedAddys[0];
            setSavedPincode(defaultAddr.pincode);
          }
        } else if (authUser.id) {
          // Fallback: fetch default address from Supabase
          const { data: addresses } = await supabase
            .from('addresses')
            .select('pincode, is_default')
            .eq('user_id', authUser.id)
            .order('is_default', { ascending: false })
            .limit(5);
          if (addresses && addresses.length > 0) {
            const def = addresses.find((a: { is_default?: boolean; pincode: string }) => a.is_default) ?? addresses[0];
            setSavedPincode(def.pincode);
          }
        }
      } else {
        setUser(null);
        setSavedAddresses([]);
        setWalletBalanceRs(null);
      }
    };

    // Initial session check
    supabase.auth.getUser().then(({ data: { user: u } }) => applyUser(u));

    // Live auth state listener
    const { data: { subscription: authSub } } = supabase.auth.onAuthStateChange((_event, session) => {
      applyUser(session?.user ?? null);
    });

    window.addEventListener("address_change", () => {
      const addys = localStorage.getItem("nutravoe_addresses");
      if (addys) {
        const parsedAddys = JSON.parse(addys);
        setSavedAddresses(parsedAddys);
        if (parsedAddys.length > 0) {
          const defaultAddr = parsedAddys.find((a: { isDefault?: boolean }) => a.isDefault) ?? parsedAddys[0];
          setSavedPincode(defaultAddr.pincode);
        }
      }
    });

    return () => {
      window.removeEventListener("scroll", onScroll);
      authSub.unsubscribe();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [menuOpen]);

  // isDark refers to whether the text should be dark ink (i.e. we are NOT on a dark hero section)
  const isDark = !isHomePage || scrolled || menuOpen;

  return (
    <>
      <nav
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
          isDark ? "bg-white/95 backdrop-blur-md shadow-sm" : "bg-transparent"
        }`}
      >
        <div className="max-w-7xl mx-auto px-6 lg:px-16 h-16 flex items-center justify-between">
          <div className="flex items-center gap-6 md:gap-8">
            {/* Brand Logo */}
            <Link href="/" className="flex items-center gap-3.5 group" onClick={() => setMenuOpen(false)}>
              <div className={`relative w-8 h-8 md:w-9 md:h-9 transition-all duration-300 ${!isDark ? "drop-shadow-md" : ""}`}>
                <Image
                  src="/circular-logo-print-2400px.png"
                  alt="Nutravoe Circular Logo"
                  fill
                  className="object-contain"
                  priority
                />
              </div>
              <span className={`font-display text-[22px] md:text-[26px] lowercase tracking-[0.3em] font-light transition-all duration-300 ${
                isDark ? "text-ink" : "text-white drop-shadow-md"
              }`}>
                nutravoe
              </span>
            </Link>

            {/* Location Selector */}
            <button 
              onClick={() => {
                setInputPincode("");
                setLocationState("idle");
                setDeliveryZone(null);
                setShowLocationModal(true);
              }}
              className={`hidden md:flex items-center gap-2 animate-in fade-in transition-colors duration-300 cursor-pointer ${
                isDark ? "text-stone hover:text-ink" : "text-white/80 hover:text-white drop-shadow-md"
              }`}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none" className="opacity-90 mt-0.5">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
              </svg>
              <div className="flex flex-col items-start leading-tight text-left">
                <span className="font-body text-[11px] font-medium tracking-wide opacity-80">Delivering to Bengaluru</span>
                <span className="font-body text-[13px] font-bold">{savedPincode}</span>
              </div>
            </button>
          </div>

          {/* Desktop nav links */}
          <ul className="hidden md:flex items-center gap-10 list-none m-0 p-0">
            {NAV_LINKS.map(({ href, label }) => (
              <li key={href}>
                <Link
                  href={href}
                  className={`font-body text-[13px] tracking-wide transition-colors duration-300 ${
                    isDark ? "text-stone hover:text-ink" : "text-white/90 hover:text-white drop-shadow-md"
                  }`}
                >
                  {label}
                </Link>
              </li>
            ))}
          </ul>

          {/* CTA + Hamburger */}
          <div className="flex items-center gap-5 md:gap-7 relative">
            {/* Sign In / User Profile */}
            <div className="relative">
              {!user ? (
                <Link 
                  href="/signin"
                  className={`hidden md:flex items-center gap-2 font-body text-[13px] font-medium transition-colors cursor-pointer ${
                  isDark ? "text-stone hover:text-sage-dark" : "text-white/85 hover:text-white drop-shadow-md"
                }`} aria-label="Sign In">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mb-0.5">
                    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                  <span className="pb-0.5">Sign In</span>
                </Link>
              ) : (
                <>
                  <button 
                    onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
                    className={`hidden md:flex items-center gap-2 font-body text-[13px] font-medium transition-colors cursor-pointer ${
                    isDark ? "text-stone hover:text-sage-dark" : "text-white/85 hover:text-white drop-shadow-md"
                  }`} aria-label="Profile">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none" className="mb-0.5 opacity-90">
                      <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                    </svg>
                    <span className="pb-0.5">Hi, {user.name.split(' ')[0]}</span>
                  </button>

                  {/* Dropdown Menu */}
                  {profileDropdownOpen && (
                    <>
                      {/* Invisible click-away overlay */}
                      <div className="fixed inset-0 z-40" onClick={() => setProfileDropdownOpen(false)} />
                      <div className="absolute right-0 top-full mt-4 w-56 bg-white rounded-lg shadow-xl border border-black/5 py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                        <div className="px-4 py-3 border-b border-black/5 mb-2">
                          <p className="font-display text-base font-medium text-ink truncate">{user.name}</p>
                          <p className="font-body text-[11px] text-stone truncate">{user.email}</p>
                        </div>
                        
                        <div className="flex flex-col">
                          <Link href="/profile" onClick={() => setProfileDropdownOpen(false)} className="px-5 py-2 hover:bg-[#F9F8F6] font-body text-[13px] text-ink transition-colors flex items-center justify-between group">
                            Profile
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-0 group-hover:opacity-40 transition-opacity"><path d="m9 18 6-6-6-6"/></svg>
                          </Link>
                          <Link href="/orders" onClick={() => setProfileDropdownOpen(false)} className="px-5 py-2 hover:bg-[#F9F8F6] font-body text-[13px] text-ink transition-colors flex items-center justify-between group">
                            Orders
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-0 group-hover:opacity-40 transition-opacity"><path d="m9 18 6-6-6-6"/></svg>
                          </Link>
                          <Link href="/subscriptions" onClick={() => setProfileDropdownOpen(false)} className="px-5 py-2 hover:bg-[#F9F8F6] font-body text-[13px] text-ink transition-colors flex items-center justify-between group">
                            Subscriptions
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-0 group-hover:opacity-40 transition-opacity"><path d="m9 18 6-6-6-6"/></svg>
                          </Link>
                          {walletBalanceRs !== null && (
                            <Link href="/wallet" onClick={() => setProfileDropdownOpen(false)} className="px-5 py-2 hover:bg-terracotta/5 font-body text-[13px] text-ink transition-colors flex items-center justify-between group">
                              <span className="flex items-center gap-2">
                                Wallet
                                <span className="font-body text-[10px] font-bold bg-terracotta/10 text-terracotta px-1.5 py-0.5 rounded-full">
                                  {formatCurrency(walletBalanceRs)}
                                </span>
                              </span>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-0 group-hover:opacity-40 transition-opacity"><path d="m9 18 6-6-6-6"/></svg>
                            </Link>
                          )}
                          <Link href="/addresses" onClick={() => setProfileDropdownOpen(false)} className="px-5 py-2 hover:bg-[#F9F8F6] font-body text-[13px] text-ink transition-colors flex items-center justify-between group">
                            Addresses
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-0 group-hover:opacity-40 transition-opacity"><path d="m9 18 6-6-6-6"/></svg>
                          </Link>
                          <Link href="/payment-methods" onClick={() => setProfileDropdownOpen(false)} className="px-5 py-2 hover:bg-[#F9F8F6] font-body text-[13px] text-ink transition-colors flex items-center justify-between group">
                            Payment Methods
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-0 group-hover:opacity-40 transition-opacity"><path d="m9 18 6-6-6-6"/></svg>
                          </Link>
                          
                          <div className="h-px bg-black/5 my-2 mx-4"></div>
                          
                          <Link href="/cancellations" onClick={() => setProfileDropdownOpen(false)} className="px-5 py-2 hover:bg-[#F9F8F6] font-body text-[13px] text-ink transition-colors flex items-center justify-between group">
                            Cancellations & Refunds
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-0 group-hover:opacity-40 transition-opacity"><path d="m9 18 6-6-6-6"/></svg>
                          </Link>
                          <Link href="/help" onClick={() => setProfileDropdownOpen(false)} className="px-5 py-2 hover:bg-[#F9F8F6] font-body text-[13px] text-stone transition-colors flex items-center justify-between group">
                            Help & Support
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-0 group-hover:opacity-40 transition-opacity"><path d="m9 18 6-6-6-6"/></svg>
                          </Link>
                          <button
                            onClick={async () => {
                              await supabase.auth.signOut();
                              setProfileDropdownOpen(false);
                            }}
                            className="px-5 py-2 hover:bg-terracotta/5 font-body text-[13px] text-terracotta font-medium transition-colors text-left flex items-center justify-between group w-full"
                          >
                            Logout
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-0 group-hover:opacity-100 transition-opacity"><path d="m9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/></svg>
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </>
              )}
            </div>

            <Link
              href="/cart"
              className={`flex items-center gap-2 font-body text-[13px] font-medium transition-colors cursor-pointer ${
                isDark ? "text-stone hover:text-sage-dark" : "text-white/90 hover:text-white drop-shadow-md"
              }`}
              onClick={() => setMenuOpen(false)}
              aria-label={`Cart with ${itemCount} items`}
            >
              <div className="relative flex items-center pt-1 pr-1">
                {/* Shopping bag icon */}
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
                  <path d="M3 6h18" />
                  <path d="M16 10a4 4 0 0 1-8 0" />
                </svg>
                {/* Item count badge */}
                <span className={`absolute top-0 right-0 w-[15px] h-[15px] rounded-full text-[9px] flex items-center justify-center font-bold font-body transition-colors ${
                  isDark ? "bg-terracotta text-white" : "bg-white text-terracotta shadow-sm"
                }`}>
                  {itemCount}
                </span>
              </div>
              <span className="hidden md:block pb-0.5">Cart</span>
            </Link>
            {/* Hamburger — mobile only */}
            <button
              className="md:hidden flex flex-col justify-center items-center w-10 h-10 gap-1.5 rounded-sm hover:bg-ink/5 transition-colors cursor-pointer"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
              aria-controls="mobile-menu"
              onClick={() => setMenuOpen((v) => !v)}
            >
              <span className={`block w-5 h-px transition-all duration-300 origin-center ${isDark ? "bg-ink" : "bg-white shadow-sm"} ${menuOpen ? "rotate-45 translate-y-[7px]" : ""}`} />
              <span className={`block w-5 h-px transition-all duration-300 ${isDark ? "bg-ink" : "bg-white shadow-sm"} ${menuOpen ? "opacity-0" : ""}`} />
              <span className={`block w-5 h-px transition-all duration-300 origin-center ${isDark ? "bg-ink" : "bg-white shadow-sm"} ${menuOpen ? "-rotate-45 -translate-y-[7px]" : ""}`} />
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile drawer */}
      {menuOpen && (
        <div
          className="fixed inset-0 z-40 md:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation menu"
          id="mobile-menu"
        >
          <div
            className="absolute inset-0 bg-ink/40 backdrop-blur-sm"
            onClick={() => setMenuOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute top-16 left-0 right-0 bg-white shadow-xl px-6 py-8 flex flex-col gap-6">
            <ul className="list-none m-0 p-0 flex flex-col gap-5">
              {NAV_LINKS.map(({ href, label }) => (
                <li key={href}>
                  <Link
                    href={href}
                    className="font-display text-[28px] font-light text-ink hover:text-sage-dark transition-colors duration-200"
                    onClick={() => setMenuOpen(false)}
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
            <a
              href={getWhatsAppHref()}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-sage text-xs tracking-widest text-center py-3.5"
              onClick={() => setMenuOpen(false)}
            >
              Order on WhatsApp
            </a>
          </div>
        </div>
      )}

      {/* Location Modal */}
      {showLocationModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm transition-opacity" onClick={() => setShowLocationModal(false)} />
          <div className="relative bg-white w-full max-w-md rounded-lg shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="bg-[#F0F2F2] px-6 py-4 flex items-center justify-between border-b border-black/5">
              <h3 className="font-display text-xl font-medium text-ink">Choose your location</h3>
              <button 
                onClick={() => setShowLocationModal(false)} 
                className="text-stone hover:text-ink transition-colors cursor-pointer"
                aria-label="Close"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
              </button>
            </div>
            
            {/* Body */}
            <div className="p-6 flex flex-col gap-5">
              {locationState === "idle" || locationState === "invalid" ? (
                <>
                  <p className="font-body text-[13px] text-stone leading-relaxed">
                    Select a delivery location to see product availability and delivery options
                  </p>
                  
                  {user ? (
                    savedAddresses.length > 0 ? (
                      <div className="flex flex-col gap-2 max-h-[220px] overflow-y-auto pr-1">
                        {savedAddresses.map(addr => (
                          <button 
                            key={addr.id}
                            onClick={() => {
                              setSavedPincode(addr.pincode);
                              setShowLocationModal(false);
                            }}
                            className="text-left w-full p-4 bg-[#F9F8F6] hover:bg-sage/10 border border-black/5 hover:border-sage/30 rounded-lg transition-colors group flex items-start gap-4"
                          >
                           <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-sage mt-0.5 shrink-0"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                           <div className="flex-1 overflow-hidden">
                             <div className="flex items-center gap-2 mb-0.5">
                               <span className="font-display text-[15px] font-medium text-ink group-hover:text-sage-dark transition-colors">{addr.tag}</span>
                               <span className="font-body text-[11px] font-bold text-stone/80 uppercase tracking-widest">{addr.pincode}</span>
                             </div>
                             <p className="font-body text-[12px] text-stone/90 truncate leading-relaxed">{addr.line1}, {addr.line2}</p>
                           </div>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <Link href="/addresses" onClick={() => setShowLocationModal(false)} className="w-full flex justify-center items-center bg-[#F9F8F6] hover:bg-black/5 text-ink font-body text-[13px] font-bold py-3.5 rounded-md transition-colors border border-black/5 text-center">
                        Add a new address
                      </Link>
                    )
                  ) : (
                    <Link href="/signin" onClick={() => setShowLocationModal(false)} className="w-full flex justify-center items-center bg-terracotta hover:bg-terracotta/90 text-white font-body text-[13px] font-bold tracking-wide py-3.5 rounded-md transition-colors shadow-sm cursor-pointer border border-black/5">
                      Sign in to see your addresses
                    </Link>
                  )}
                  
                  <div className="flex items-center gap-3 py-1">
                    <div className="flex-1 h-px bg-black/10"></div>
                    <span className="font-body text-[11px] text-stone/60 uppercase tracking-wider">or enter an Indian pincode</span>
                    <div className="flex-1 h-px bg-black/10"></div>
                  </div>

                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      value={inputPincode}
                      onChange={(e) => setInputPincode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="e.g. 560001"
                      className="flex-1 border border-black/20 rounded-md px-3 font-body text-sm focus:outline-none focus:border-sage focus:ring-1 focus:ring-sage"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          document.getElementById("apply-pin-btn")?.click();
                        }
                      }}
                    />
                    <button
                      id="apply-pin-btn"
                      disabled={checkingZone}
                      onClick={async () => {
                        if (inputPincode.length !== 6) {
                          setLocationState("invalid");
                          return;
                        }
                        if (!inputPincode.startsWith("56")) {
                          setLocationState("invalid");
                          return;
                        }
                        // Valid Bangalore pincode — geocode and check delivery zone
                        setCheckingZone(true);
                        setDeliveryZone(null);
                        const coords = await geocodePincode(inputPincode);
                        if (coords) {
                          const { hub, distanceKm } = getNearestHub(coords.lat, coords.lng);
                          setDeliveryZone({
                            fee: distanceKm <= FREE_ZONE_RADIUS_KM ? 0 : DELIVERY_FEE_RS,
                            distanceKm: Math.round(distanceKm * 10) / 10,
                            hubName: hub.name,
                          });
                        }
                        setSavedPincode(inputPincode);
                        setCheckingZone(false);
                      }}
                      className="px-6 bg-sage hover:bg-sage-dark disabled:opacity-60 text-white rounded-md font-body text-sm font-medium transition-colors shadow-sm cursor-pointer border border-black/5"
                    >
                      {checkingZone ? 'Checking…' : 'Apply'}
                    </button>
                  </div>
                  
                  {/* Delivery zone result */}
                  {deliveryZone && (
                    <div className={`flex items-start gap-3 p-3 rounded-lg border ${deliveryZone.fee === 0 ? 'bg-sage/8 border-sage/20' : 'bg-terracotta/5 border-terracotta/20'}`}>
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${deliveryZone.fee === 0 ? 'bg-sage/15' : 'bg-terracotta/15'}`}>
                        {deliveryZone.fee === 0
                          ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#4E6B49" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                          : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#C4714A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                        }
                      </div>
                      <div className="flex-1">
                        <p className={`font-body text-[13px] font-bold ${deliveryZone.fee === 0 ? 'text-sage-dark' : 'text-terracotta'}`}>
                          {deliveryZone.fee === 0 ? 'Free delivery' : `+₹${DELIVERY_FEE_RS} delivery fee`}
                        </p>
                        <p className="font-body text-[11px] text-stone mt-0.5">
                          {deliveryZone.distanceKm} km from {deliveryZone.hubName}
                          {deliveryZone.fee === 0 ? ` · within ${FREE_ZONE_RADIUS_KM} km zone` : ` · beyond ${FREE_ZONE_RADIUS_KM} km zone`}
                        </p>
                      </div>
                      <button onClick={() => setShowLocationModal(false)} className="shrink-0 font-body text-[11px] font-bold text-stone hover:text-ink underline">
                        Done
                      </button>
                    </div>
                  )}

                  {locationState === "invalid" && (
                    <div className="mt-2 p-4 bg-terracotta/5 border border-terracotta/20 rounded-md flex flex-col gap-3">
                      <p className="font-body text-[13px] text-terracotta font-medium">Sorry, we are currently not serviceable in this area.</p>
                      <button 
                        onClick={() => setLocationState("waitlist")}
                        className="font-body text-[13px] font-bold text-terracotta underline hover:text-terracotta/80 text-left cursor-pointer w-fit"
                      >
                        Request service in this area
                      </button>
                    </div>
                  )}
                </>
              ) : locationState === "waitlist" ? (
                <div className="flex flex-col gap-4 animate-in slide-in-from-right-4 duration-300">
                  <p className="font-body text-[14.5px] font-medium text-ink">Request delivery to <span className="font-bold">{inputPincode}</span></p>
                  <p className="font-body text-[13px] text-stone mb-2">Leave your details and we'll notify you the moment we launch in your neighborhood.</p>
                  <input type="text" placeholder="Your Name" value={waitlistName} onChange={e => setWaitlistName(e.target.value)} className="w-full border border-black/20 rounded-md px-3 py-2.5 font-body text-sm focus:outline-none focus:border-sage" />
                  <input type="email" placeholder="Email Address" value={waitlistEmail} onChange={e => setWaitlistEmail(e.target.value)} className="w-full border border-black/20 rounded-md px-3 py-2.5 font-body text-sm focus:outline-none focus:border-sage" />
                  <input type="tel" placeholder="Phone Number" value={waitlistPhone} onChange={e => setWaitlistPhone(e.target.value)} className="w-full border border-black/20 rounded-md px-3 py-2.5 font-body text-sm focus:outline-none focus:border-sage" />
                  <button
                    disabled={waitlistSubmitting}
                    onClick={async () => {
                      if (!waitlistEmail && !waitlistPhone) return;
                      setWaitlistSubmitting(true);
                      try {
                        await fetch('/api/area-interest', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ name: waitlistName, email: waitlistEmail, phone: waitlistPhone, pincode: inputPincode }),
                        });
                        setLocationState("success");
                      } finally {
                        setWaitlistSubmitting(false);
                      }
                    }}
                    className="w-full bg-terracotta hover:bg-terracotta/90 disabled:opacity-60 text-white font-body text-[13px] tracking-wide font-bold py-3 rounded-md transition-colors mt-2 shadow-sm cursor-pointer border border-black/5"
                  >
                    {waitlistSubmitting ? 'Submitting…' : 'Submit Request'}
                  </button>
                  <button onClick={() => setLocationState("idle")} className="font-body text-xs text-stone hover:text-ink transition-colors mt-1 underline">
                    Go back
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-6 text-center gap-3 animate-in zoom-in-95 duration-300">
                  <div className="w-12 h-12 rounded-full bg-sage/20 flex items-center justify-center text-sage mb-2">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
                  </div>
                  <h4 className="font-display text-2xl font-medium text-ink">You're on the list!</h4>
                  <p className="font-body text-[13.5px] text-stone">We'll let you know as soon as Nutravoe arrives in <span className="font-semibold">{inputPincode}</span>.</p>
                  <button onClick={() => setShowLocationModal(false)} className="mt-5 font-body text-[13px] tracking-wide font-bold text-sage hover:underline cursor-pointer">Return to site</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
