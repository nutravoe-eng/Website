"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useCart } from "@/components/CartContext";
import { buildCartOrderWhatsAppMessage, formatCurrency, getWhatsAppUrl } from "@/lib/utils";
import { getActivePlanConfig } from "@/lib/subscription";
import { geocodePincode } from "@/lib/geocodeCache";
import { getNearestHub, getDeliveryFee, DELIVERY_FEE_RS } from "@/lib/delivery";
import { createClient } from "@/lib/supabase/client";
import { useDialogAccessibility } from "@/lib/use-dialog-accessibility";
import { getWhatsAppNumber } from "@/lib/contact";

// Generate delivery slots dynamically combining Same-Day buffer and Next-Day 11PM cutoff rules
const getDeliverySlots = () => {
  const currentHour = new Date().getHours();
  const slots = [];

  // --- 1. SAME DAY / TODAY SLOTS ---
  // Same day delivery terminates at 7 PM (19:00).
  if (currentHour < 19) {
    let todayStartHour = 10;

    if (currentHour >= 0 && currentHour < 6) {
      // Ordered past midnight up to 6 AM: Earliest is 10 AM
      todayStartHour = 10;
    } else {
      // Ordered between 6 AM and 7 PM: Add 2-hour prep buffer
      todayStartHour = currentHour + 2;
    }

    // Ensure we don't exceed the 9 PM delivery limit
    if (todayStartHour < 21) {
      for (let i = Math.max(7, todayStartHour); i < 21; i++) {
        const start = i > 12 ? `${i - 12}:00 PM` : i === 12 ? `12:00 PM` : `${i.toString().padStart(2, '0')}:00 AM`;
        const endHour = i + 1;
        const end = endHour > 12 ? `${endHour - 12}:00 PM` : endHour === 12 ? `12:00 PM` : `${endHour.toString().padStart(2, '0')}:00 AM`;
        slots.push(`Today, ${start} - ${end}`);
      }
    }
  }

  // --- 2. NEXT DAY / TOMORROW SLOTS ---
  // "When a person is ordering after 11 PM [23:00], only 10 AM to 9 PM slots should be shown."
  const tomorrowStartHour = currentHour >= 23 ? 10 : 7;

  for (let i = tomorrowStartHour; i < 21; i++) {
    const start = i > 12 ? `${i - 12}:00 PM` : i === 12 ? `12:00 PM` : `${i.toString().padStart(2, '0')}:00 AM`;
    const endHour = i + 1;
    const end = endHour > 12 ? `${endHour - 12}:00 PM` : endHour === 12 ? `12:00 PM` : `${endHour.toString().padStart(2, '0')}:00 AM`;
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

  // Delivery fee
  const [deliveryFee, setDeliveryFee] = useState<number>(0);
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

      // Resolve delivery fee from Supabase addresses (fallback to localStorage cache)
      let pincode: string | null = null;
      if (authUser) {
        const { data: addrs } = await supabase
          .from("addresses")
          .select("pincode, is_default")
          .eq("user_id", authUser.id)
          .order("is_default", { ascending: false })
          .limit(1);
        pincode = addrs?.[0]?.pincode ?? null;
      }
      if (!pincode) {
        const cached = localStorage.getItem("nutravoe_addresses");
        if (cached) {
          const arr: { pincode: string; isDefault: boolean }[] = JSON.parse(cached);
          pincode = (arr.find(a => a.isDefault) ?? arr[0])?.pincode ?? null;
        }
      }
      if (pincode) {
        const coords = await geocodePincode(pincode);
        if (coords) {
          const { hub, distanceKm } = getNearestHub(coords.lat, coords.lng);
          setDeliveryFee(getDeliveryFee(coords.lat, coords.lng));
          setNearestHubName(hub.name);
          setDeliveryDistanceKm(Math.round(distanceKm * 10) / 10);
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
      router.push("/signin");
      return;
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
        grandTotal,
        orderRef: orderRef ?? undefined,
      });

      const whatsappNumber = getWhatsAppNumber();
      clearCart();
      window.open(getWhatsAppUrl(whatsappNumber, message), "_blank", "noopener,noreferrer");
      window.location.href = "/confirmation?payment_id=whatsapp";
    } catch {
      setError("Something went wrong while preparing your WhatsApp order.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <section className="pt-28 pb-20 px-6 lg:px-16 min-h-[80vh]">
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
                      <span className="font-body text-[13px] font-bold text-terracotta">+ {formatCurrency(DELIVERY_FEE_RS)}</span>
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

                <button
                  onClick={handlePlaceOrder}
                  disabled={submitting}
                  className="w-full bg-terracotta hover:bg-[#D55F43] disabled:bg-black/10 disabled:text-stone text-white font-body text-sm font-bold tracking-wide py-4 rounded-md transition-colors shadow-sm"
                >
                  Place an order
                </button>

                <p className="font-body text-[11px] text-stone text-center mt-4">
                  {user ? "Your full order details will open in WhatsApp for confirmation." : "You will be asked to sign in to your Nutravoe account to continue."}
                </p>
              </div>
            )}

            {/* Trust signals */}
            <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4 text-center border-t border-black/5 pt-8">
              {[
                { emoji: "🌅", text: "Made fresh daily" },
                { emoji: "🚚", text: "7–10 AM delivery" },
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
