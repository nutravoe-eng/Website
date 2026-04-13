"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useCart } from "@/components/CartContext";
import { buildCartOrderWhatsAppMessage, formatCurrency, getWhatsAppUrl } from "@/lib/utils";
import { getActivePlanConfig } from "@/lib/subscription";
import { getWallet } from "@/lib/wallet";
import { resolveDeliveryCoords } from "@/lib/geocodeCache";
import type { DeliveryPriceBreakdown } from "@/lib/delivery";
import { createClient } from "@/lib/supabase/client";
import { useDialogAccessibility } from "@/lib/use-dialog-accessibility";
import { getWhatsAppNumber } from "@/lib/contact";
import { isPaidFlexibleWalletEligible } from "@/lib/flexible-subscription";
import DeliveryMarquee from "@/components/DeliveryMarquee";

// Delivery slot generation rules:
// - Midnight to 7:59 AM  → floor: earliest same-day = 10:00 AM
// - 8:00 AM to 8:59 AM   → earliest same-day = 11:00 AM (kitchen not yet running full prep)
// - 9:00 AM onwards      → 2-hour prep buffer from current time
// - Same-day closes at 7 PM
// - After 11 PM          → tomorrow morning (7–9 AM) slots are hidden; earliest tomorrow = 10 AM
const getDeliverySlots = () => {
  const nowIST = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const currentHour = nowIST.getHours();
  const slots: string[] = [];

  // --- 1. SAME-DAY SLOTS ---
  if (currentHour < 19) { // same-day closes at 7 PM
    let todayStartHour: number;
    if (currentHour < 8) {
      todayStartHour = 10;       // midnight–7:59 AM: floor at 10 AM
    } else if (currentHour < 9) {
      todayStartHour = 11;       // 8:00–8:59 AM: kitchen not at full prep yet
    } else {
      todayStartHour = currentHour + 2; // 9 AM+: 2-hour buffer
    }

    for (let i = Math.max(10, todayStartHour); i < 21; i++) {
      const start = i > 12 ? `${i - 12}:00 PM` : i === 12 ? '12:00 PM' : `${String(i).padStart(2, '0')}:00 AM`;
      const e = i + 1;
      const end = e > 12 ? `${e - 12}:00 PM` : e === 12 ? '12:00 PM' : `${String(e).padStart(2, '0')}:00 AM`;
      slots.push(`Today, ${start} - ${end}`);
    }
  }

  // --- 2. TOMORROW SLOTS ---
  // After 11 PM, 7–9 AM tomorrow slots are hidden (too late to notify kitchen for early morning).
  const tomorrowStartHour = currentHour >= 23 ? 10 : 7;
  for (let i = tomorrowStartHour; i < 21; i++) {
    const start = i > 12 ? `${i - 12}:00 PM` : i === 12 ? '12:00 PM' : `${String(i).padStart(2, '0')}:00 AM`;
    const e = i + 1;
    const end = e > 12 ? `${e - 12}:00 PM` : e === 12 ? '12:00 PM' : `${String(e).padStart(2, '0')}:00 AM`;
    slots.push(`Tomorrow, ${start} - ${end}`);
  }

  return slots;
};


interface StoredUser {
  name: string;
  phone: string;
  email: string;
}

export default function CartPage() {
  const router = useRouter();
  const { items, total, clearCart, removeItem, updateQuantity } = useCart();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [user, setUser] = useState<StoredUser | null>(null);

  // Delivery Slots State
  const [selectedSlot, setSelectedSlot] = useState<string>("");
  const [showSlotPicker, setShowSlotPicker] = useState(false);
  const slotDialogRef = useRef<HTMLDivElement>(null);
  useDialogAccessibility(slotDialogRef, () => setShowSlotPicker(false));
  const deliverySlots = getDeliverySlots();

  // Subscriber discount
  const [subscriberPricePerBowl, setSubscriberPricePerBowl] = useState<number | null>(null);

  // Wallet payment
  const [walletBalanceRs, setWalletBalanceRs] = useState<number>(0);
  const [hasActivePaidSub, setHasActivePaidSub] = useState(false);

  // Delivery fee
  const [deliveryFee, setDeliveryFee] = useState<number>(0);
  const [deliveryBreakdown, setDeliveryBreakdown] = useState<({ isFree: false } & DeliveryPriceBreakdown) | { isFree: true; distanceKm: number } | null>(null);
  const [deliveryFeeLoading, setDeliveryFeeLoading] = useState(true);
  const [nearestHubName, setNearestHubName] = useState<string>('');
  const [deliveryDistanceKm, setDeliveryDistanceKm] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (authUser) {
        const name = (authUser.user_metadata?.full_name as string | undefined) ?? authUser.email?.split("@")[0] ?? "";
        setUser({ name, phone: "", email: authUser.email ?? "" });
      }

      const [planConfig] = await Promise.all([getActivePlanConfig()]);
      if (planConfig) setSubscriberPricePerBowl(planConfig.perBowl);

      // Wallet checkout: paid flexible, active or completed but still within billing period
      if (authUser) {
        const { data: flexRows } = await supabase
          .from("subscriptions")
          .select("id, style, status, payment_status, period_end_date")
          .eq("user_id", authUser.id)
          .eq("style", "flexible")
          .eq("payment_status", "paid");
        const eligible = (flexRows ?? []).some((r) =>
          isPaidFlexibleWalletEligible({
            style: r.style,
            status: r.status,
            payment_status: r.payment_status,
            period_end_date: r.period_end_date,
          }),
        );
        if (eligible) {
          setHasActivePaidSub(true);
          const wallet = await getWallet();
          setWalletBalanceRs(wallet.balancePaise / 100);
        }
      }

      // Resolve delivery fee: prefer saved map pin (lat/lng), else pincode geocode
      type CachedAddr = { pincode: string; isDefault?: boolean; lat?: number; lng?: number };
      let addrPick: { pincode: string; lat: number | null; lng: number | null } | null = null;
      if (authUser) {
        const { data: addrs } = await supabase
          .from("addresses")
          .select("pincode, lat, lng, is_default")
          .eq("user_id", authUser.id)
          .order("is_default", { ascending: false });
        const row = addrs?.find((a) => a.is_default) ?? addrs?.[0];
        if (row?.pincode) addrPick = { pincode: row.pincode, lat: row.lat, lng: row.lng };
      }
      if (!addrPick) {
        const cached = localStorage.getItem("nutravoe_addresses");
        if (cached) {
          const arr = JSON.parse(cached) as CachedAddr[];
          const a = arr.find((x) => x.isDefault) ?? arr[0];
          if (a?.pincode) {
            addrPick = {
              pincode: a.pincode,
              lat: typeof a.lat === "number" ? a.lat : null,
              lng: typeof a.lng === "number" ? a.lng : null,
            };
          }
        }
      }
      if (addrPick) {
        const coords = await resolveDeliveryCoords(addrPick.pincode, addrPick.lat, addrPick.lng);
        if (coords) {
          const res = await fetch(
            `/api/delivery-distance?lat=${encodeURIComponent(String(coords.lat))}&lng=${encodeURIComponent(String(coords.lng))}`,
          );
          if (res.ok) {
            const data = (await res.json()) as {
              hub: { name: string };
              distanceKm: number;
              breakdown:
                | { isFree: true; distanceKm: number }
                | ({ isFree: false } & DeliveryPriceBreakdown);
              deliveryFee: number;
            };
            setDeliveryBreakdown(data.breakdown);
            setDeliveryFee(data.deliveryFee);
            setNearestHubName(data.hub.name);
            setDeliveryDistanceKm(Math.round(data.distanceKm * 10) / 10);
          }
        }
      }
      setDeliveryFeeLoading(false);
    })();
  }, []);

  // Subscriber discount — applied per bowl (customization extras still at full cost)
  const subscriberDiscount = subscriberPricePerBowl !== null
    ? items.reduce((sum, item) => sum + Math.max(0, item.bowl.price - subscriberPricePerBowl) * item.quantity, 0)
    : 0;
  const effectiveTotal = total - subscriberDiscount;
  const grandTotal = effectiveTotal + deliveryFee;

  // Record order in Supabase — returns short order ref on success
  const recordOrder = async (): Promise<string | null> => {
    const res = await fetch("/api/orders/whatsapp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        selectedSlot,
        items: items.map((item) => ({
          bowlSlug: item.bowl.slug,
          quantity: item.quantity,
          customizations: item.customizations,
        })),
      }),
    });

    if (!res.ok) return null;

    const order = await res.json() as { id?: string };
    return order.id ? order.id.slice(-6).toUpperCase() : null;
  };

  async function handlePayFromWallet() {
    if (items.length === 0) { setError("Your cart is empty. Add some bowls first."); return; }
    if (!selectedSlot) { setError("Please select a delivery slot before placing an order."); return; }
    if (!user) { router.push("/signin?next=/cart"); return; }

    setSubmitting(true);
    setError("");

    try {
      const res = await fetch("/api/orders/wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selectedSlot,
          items: items.map((item) => ({
            bowlSlug: item.bowl.slug,
            quantity: item.quantity,
            customizations: item.customizations,
          })),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(typeof data?.error === "string" ? data.error : "Failed to place order. Please try again.");
        return;
      }

      clearCart();
      window.location.href = "/confirmation?source=wallet";
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePlaceOrder() {
    if (items.length === 0) {
      setError("Your cart is empty. Add some bowls first.");
      return;
    }
    if (!selectedSlot) {
      setError("Please select a delivery slot before placing an order.");
      return;
    }

    if (!user) {
      router.push("/signin?next=/cart");
      return;
    }

    // Open immediately in click handler context to avoid popup blockers
    // after async order-preparation work completes.
    const whatsappWindow = window.open("", "_blank", "noopener,noreferrer");
    if (whatsappWindow) {
      whatsappWindow.document.write(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Preparing WhatsApp</title>
    <style>
      :root { color-scheme: light; }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
        background: #f8f4ee;
        color: #262626;
      }
      .card {
        text-align: center;
        padding: 24px 20px;
      }
      .dot {
        width: 10px;
        height: 10px;
        border-radius: 999px;
        margin: 0 auto 14px;
        background: #c86f4f;
        animation: pulse 1.2s ease-in-out infinite;
      }
      p {
        margin: 0;
        font-size: 14px;
        opacity: 0.85;
      }
      @keyframes pulse {
        0%, 100% { transform: scale(1); opacity: 0.6; }
        50% { transform: scale(1.35); opacity: 1; }
      }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="dot"></div>
      <p>Preparing your WhatsApp order message...</p>
    </div>
  </body>
</html>`);
      whatsappWindow.document.close();
    }
    setSubmitting(true);
    setError("");

    try {
      const supabase = createClient();
      let deliveryAddress = "";
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (authUser) {
        const { data: addrs } = await supabase
          .from("addresses")
          .select("line1, line2, pincode, is_default")
          .eq("user_id", authUser.id)
          .order("is_default", { ascending: false })
          .limit(1);
        const a = addrs?.[0];
        if (a) deliveryAddress = `${a.line1}, ${a.line2}, ${a.pincode}`;
      }

      const detailedItems = items.map((item) => {
        const removedIngredients = item.customizations
          .filter(c => c.option === "remove")
          .map(c => item.bowl.customizableIngredients?.find(i => i.id === c.ingredientId)?.name)
          .filter(Boolean) as string[];
        const extraIngredients = item.customizations
          .filter(c => c.option === "extra")
          .map(c => item.bowl.customizableIngredients?.find(i => i.id === c.ingredientId)?.name)
          .filter(Boolean) as string[];
        return {
          bowlName: item.bowl.name,
          quantity: item.quantity,
          basePrice: subscriberPricePerBowl ?? item.bowl.price,
          customizationCost: item.customizationCost,
          removedIngredients,
          extraIngredients,
        };
      });

      const orderRef = await recordOrder();

      const message = buildCartOrderWhatsAppMessage({
        customerName: user.name,
        customerPhone: user.phone,
        customerEmail: user.email,
        deliveryAddress,
        deliverySlot: selectedSlot,
        items: detailedItems,
        subtotal: total,
        subscriberDiscount,
        deliveryFee,
        deliveryBreakdown: deliveryBreakdown && !deliveryBreakdown.isFree
          ? { totalCostRs: deliveryBreakdown.totalCostRs, nutravoeCoverageRs: deliveryBreakdown.nutravoeCoverageRs }
          : null,
        grandTotal,
        orderRef: orderRef ?? undefined,
      });

      const whatsappNumber = getWhatsAppNumber();
      const whatsappUrl = getWhatsAppUrl(whatsappNumber, message);
      clearCart();
      if (whatsappWindow) {
        whatsappWindow.location.href = whatsappUrl;
      } else {
        // Fallback for strict popup settings: still complete flow in same tab.
        window.location.href = whatsappUrl;
        return;
      }
      window.location.href = "/confirmation?payment_id=whatsapp";
    } catch {
      if (whatsappWindow && !whatsappWindow.closed) {
        whatsappWindow.close();
      }
      setError("Something went wrong while preparing your WhatsApp order.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <DeliveryMarquee variant="light" />
      <section className="pt-16 pb-20 px-6 lg:px-16 min-h-[80vh]">
        <div className="max-w-2xl mx-auto">
          {/* Cart summary */}
          <div>
            <h1
              className="section-heading text-ink mb-10"
              style={{ fontSize: "clamp(32px, 4vw, 48px)" }}
            >
              Your Cart
            </h1>

            {items.length === 0 ? (
              <div className="border border-ink/10 rounded-sm p-10 text-center bg-[#F9F8F6]">
                <p className="font-display text-xl italic text-stone mb-4">
                  Your cart is empty.
                </p>
                <a
                  href="/menu"
                  className="font-body text-[13px] font-bold tracking-wide text-sage-dark hover:underline transition-colors"
                >
                  Browse the menu →
                </a>
              </div>
            ) : (
              <div className="bg-white border text-ink border-black/10 rounded-xl p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
                <div className="space-y-4 mb-6">
                  {items.map((item) => {
                    const removed = item.customizations.filter(c => c.option === "remove");
                    const extras = item.customizations.filter(c => c.option === "extra");
                    const basePrice = subscriberPricePerBowl ?? item.bowl.price;
                    const effectiveUnitPrice = basePrice + item.customizationCost;
                    const isDiscounted = subscriberPricePerBowl !== null && item.bowl.price > subscriberPricePerBowl;

                    return (
                      <div
                        key={item.bowl._id}
                        className="flex items-start gap-4 bg-[#F9F8F6] p-4 rounded-lg"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-display text-lg font-medium text-ink">
                            {item.bowl.name}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <p className="font-body text-[13px] text-stone">
                              {formatCurrency(effectiveUnitPrice)} each
                            </p>
                            {isDiscounted && (
                              <>
                                <span className="font-body text-[11px] text-stone/50 line-through">{formatCurrency(item.bowl.price)}</span>
                                <span className="font-body text-[10px] font-bold text-sage-dark bg-sage/10 px-1.5 py-0.5 rounded-full">Subscriber</span>
                              </>
                            )}
                          </div>
                          {/* Customization summary */}
                          {(removed.length > 0 || extras.length > 0) && (
                            <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-1.5">
                              {removed.map(c => {
                                const ing = item.bowl.customizableIngredients?.find(i => i.id === c.ingredientId);
                                if (!ing) return null;
                                return (
                                  <span key={c.ingredientId} className="font-body text-[11px] text-terracotta">
                                    &minus;{ing.name}
                                  </span>
                                );
                              })}
                              {extras.map(c => {
                                const ing = item.bowl.customizableIngredients?.find(i => i.id === c.ingredientId);
                                if (!ing) return null;
                                return (
                                  <span key={c.ingredientId} className="font-body text-[11px] text-sage-dark">
                                    +{ing.name}
                                  </span>
                                );
                              })}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <div className="flex items-center gap-2 bg-white rounded-md border border-black/10 px-2 py-1">
                            <button
                              aria-label={`Decrease quantity of ${item.bowl.name}`}
                              onClick={() => updateQuantity(item.instanceId, item.quantity - 1)}
                              className="w-6 h-6 flex items-center justify-center text-stone hover:text-ink transition-colors cursor-pointer"
                            >
                              −
                            </button>
                            <span className="font-body text-sm w-4 text-center font-medium">
                              {item.quantity}
                            </span>
                            <button
                              aria-label={`Increase quantity of ${item.bowl.name}`}
                              onClick={() => updateQuantity(item.instanceId, item.quantity + 1)}
                              className="w-6 h-6 flex items-center justify-center text-stone hover:text-ink transition-colors cursor-pointer"
                            >
                              +
                            </button>
                          </div>
                          <span className="font-display text-lg text-sage-dark w-[80px] text-right">
                            {formatCurrency(effectiveUnitPrice * item.quantity)}
                          </span>
                          <button
                            aria-label={`Remove ${item.bowl.name} from cart`}
                            onClick={() => removeItem(item.instanceId)}
                            className="w-8 h-8 rounded-full border border-black/5 flex items-center justify-center text-stone hover:bg-terracotta/5 hover:text-terracotta transition-colors ml-2 cursor-pointer bg-white"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="border-t border-black/5 pt-6 mb-6 space-y-2">
                  {subscriberDiscount > 0 && (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="font-body text-[13px] text-stone">Subtotal</span>
                        <span className="font-body text-[13px] text-stone">{formatCurrency(total)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="font-body text-[13px] text-sage-dark font-medium">Subscriber discount</span>
                        <span className="font-body text-[13px] text-sage-dark font-bold">− {formatCurrency(subscriberDiscount)}</span>
                      </div>
                    </>
                  )}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="font-body text-[13px] text-stone">Delivery</span>
                        {deliveryDistanceKm !== null && (
                          <span className="font-body text-[10px] text-stone/60">({deliveryDistanceKm} km from {nearestHubName})</span>
                        )}
                      </div>
                      {deliveryFeeLoading ? (
                        <span className="font-body text-[12px] text-stone animate-pulse">Checking…</span>
                      ) : deliveryFee === 0 ? (
                        <span className="font-body text-[13px] font-bold text-sage-dark">Free</span>
                      ) : (
                        <span className="font-body text-[13px] font-bold text-terracotta">+ {formatCurrency(deliveryFee)}</span>
                      )}
                    </div>
                    {!deliveryFeeLoading && deliveryBreakdown && !deliveryBreakdown.isFree && (
                      <div className="rounded-lg bg-sage/5 border border-sage/15 px-3 py-2 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-body text-[11px] text-stone/70">Total delivery cost</span>
                          <span className="font-body text-[11px] text-stone/70">{formatCurrency(deliveryBreakdown.totalCostRs)}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="font-body text-[11px] text-sage-dark font-medium">Nutravoe covers</span>
                          <span className="font-body text-[11px] text-sage-dark font-medium">− {formatCurrency(deliveryBreakdown.nutravoeCoverageRs)}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="font-body text-[11px] font-bold text-ink">You pay</span>
                          <span className="font-body text-[11px] font-bold text-ink">{formatCurrency(deliveryBreakdown.customerPaysRs)}</span>
                        </div>
                      </div>
                    )}
                    {!deliveryFeeLoading && (
                      <p className="font-body text-[10px] text-stone/70">
                        Delivery is free within 10 km. If delivery is charged, your address is beyond 10 km from {nearestHubName}.
                      </p>
                    )}
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <span className="font-body text-sm font-bold uppercase tracking-wider text-ink/70">
                      Grand Total
                    </span>
                    <span className="font-display text-3xl font-medium text-sage-dark">
                      {formatCurrency(grandTotal)}
                    </span>
                  </div>
                </div>

                <div className="mb-6">
                  <label className="block font-body text-[11px] font-bold uppercase tracking-wider text-stone mb-2">
                    Select Delivery Slot
                  </label>
                  <button
                    aria-label={selectedSlot ? `Selected delivery slot ${selectedSlot}` : "Choose an available delivery slot"}
                    onClick={() => { setShowSlotPicker(true); setError(""); }}
                    className="w-full flex items-center justify-between border border-black/10 rounded-lg px-4 py-3.5 bg-[#F9F8F6] hover:bg-sage/5 hover:border-sage/30 transition-colors text-left group cursor-pointer shadow-sm"
                  >
                    <span className={`font-body text-[13px] ${selectedSlot ? 'text-ink font-bold tracking-wide' : 'text-stone font-medium'}`}>
                      {selectedSlot || "Choose an available time slot"}
                    </span>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-stone group-hover:text-sage transition-colors"><path d="m6 9 6 6 6-6"/></svg>
                  </button>
                </div>

                {error && (
                  <div className="mb-4 p-4 bg-terracotta/5 border border-terracotta/20 rounded-md">
                    <p className="font-body text-[13px] font-medium text-terracotta">{error}</p>
                  </div>
                )}

                {hasActivePaidSub && (
                  <div className="mb-3">
                    <button
                      onClick={handlePayFromWallet}
                      disabled={submitting || walletBalanceRs < grandTotal || deliveryFeeLoading}
                      className="w-full bg-sage hover:bg-sage-dark disabled:bg-black/10 disabled:text-stone text-white font-body text-sm font-bold tracking-wide py-4 rounded-md transition-colors shadow-sm flex items-center justify-center gap-2"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M16 12h.01"/></svg>
                      {walletBalanceRs >= grandTotal
                        ? `Pay ${formatCurrency(grandTotal)} from Wallet`
                        : `Wallet balance low (${formatCurrency(walletBalanceRs)} available)`}
                    </button>
                    <p className="font-body text-[11px] text-stone text-center mt-1.5">
                      Order confirmed instantly · No WhatsApp needed
                    </p>
                  </div>
                )}

                <button
                  onClick={handlePlaceOrder}
                  disabled={submitting}
                  className={`w-full disabled:bg-black/10 disabled:text-stone text-white font-body text-sm font-bold tracking-wide py-4 rounded-md transition-colors shadow-sm ${hasActivePaidSub ? "bg-black/20 hover:bg-black/30 text-ink" : "bg-terracotta hover:bg-[#D55F43]"}`}
                >
                  {hasActivePaidSub ? "Order via WhatsApp instead" : "Place an order"}
                </button>

                <p className="font-body text-[11px] text-stone text-center mt-4">
                  {user ? (hasActivePaidSub ? "" : "Your full order details will open in WhatsApp for confirmation.") : "You will be asked to sign in to your Nutravoe account to continue."}
                </p>
              </div>
            )}

            {/* Trust signals */}
            <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4 text-center border-t border-black/5 pt-8">
              {[
                { emoji: "🌅", text: "Made fresh daily" },
                { emoji: "🚚", text: "Same-day delivery" },
                { emoji: "🥛", text: "Probiotic base" },
              ].map(({ emoji, text }) => (
                <div key={text} className="flex flex-col items-center gap-2">
                  <span className="text-xl" aria-hidden="true">{emoji}</span>
                  <p className="font-body text-[12px] font-medium text-stone tracking-wide">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Delivery Slot Picker Modal */}
      {showSlotPicker && (
        <div className="fixed inset-0 z-[110] flex items-end md:items-center justify-center p-0 md:p-4 bg-ink/70 backdrop-blur-sm animate-in fade-in duration-300">
          <div
            ref={slotDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="delivery-slot-title"
            tabIndex={-1}
            className="bg-white rounded-t-3xl md:rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in slide-in-from-bottom-[50%] md:zoom-in-95 duration-400"
          >
            {/* Header */}
            <div className="bg-white px-6 py-5 flex items-center justify-between border-b border-black/5 shrink-0 sticky top-0 z-10">
              <div>
                <h3 id="delivery-slot-title" className="font-display text-2xl font-medium text-ink">Choose a timeslot</h3>
                <p className="font-body text-[12px] text-stone mt-0.5 tracking-wide">Select your ideal delivery window</p>
              </div>
              <button
                onClick={() => setShowSlotPicker(false)}
                className="text-stone hover:text-ink w-8 h-8 flex items-center justify-center rounded-full bg-black/5 hover:bg-black/10 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage focus-visible:ring-offset-1"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
              </button>
            </div>

            {/* Scrollable List */}
            <div className="p-5 overflow-y-auto flex-1 custom-scrollbar w-full bg-[#F9F8F6]">
              {/* Delivery cutoff notice */}
              <div className="mb-4 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 flex gap-3 items-start">
                <span className="text-amber-500 mt-0.5 shrink-0">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>
                </span>
                <p className="font-body text-[12px] text-amber-800 leading-relaxed">
                  <strong>7:00–10:00 AM deliveries</strong> require ordering by <strong>11:00 PM</strong> the night before. Same-day delivery is available with <strong>2 hours&apos; notice</strong> after 9:00 AM.
                </p>
              </div>
              <div className="flex flex-col gap-3">
                {deliverySlots.map(slot => (
                  <button
                    key={slot}
                    onClick={() => {
                      setSelectedSlot(slot);
                      setShowSlotPicker(false);
                    }}
                    className={`flex items-center justify-between p-4 rounded-2xl border transition-all text-left group w-full cursor-pointer ${
                      selectedSlot === slot
                        ? "border-sage bg-sage/5 shadow-sm"
                        : "border-black/5 bg-white hover:border-sage/30 hover:shadow-sm"
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                        selectedSlot === slot ? "bg-sage text-white shadow-md shadow-sage/30" : "bg-[#F0F2F2] text-stone group-hover:text-sage group-hover:bg-sage/10"
                      }`}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                      </div>
                      <div>
                        <span className={`font-display text-[18px] block ${selectedSlot === slot ? "text-sage-dark font-medium" : "text-ink font-medium transition-colors group-hover:text-sage-dark"}`}>
                          {slot}
                        </span>
                        <p className={`font-body text-[11px] mt-0.5 ${selectedSlot === slot ? "text-sage/80" : "text-stone"}`}>
                          1 Hour Window • Guaranteed Fresh
                        </p>
                      </div>
                    </div>

                    <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors shrink-0 ${
                      selectedSlot === slot ? "border-sage bg-sage" : "border-stone/20 bg-white"
                    }`}>
                      {selectedSlot === slot && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-black/5 bg-white shrink-0 text-center pb-8 md:pb-4">
              <p className="font-body text-[11px] text-stone/80 tracking-widest uppercase font-medium">
                Nutravoe Custom Delivery
              </p>
            </div>
          </div>
        </div>
      )}

    </>
  );
}
