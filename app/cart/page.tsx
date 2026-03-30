"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useCart } from "@/components/CartContext";
import { formatCurrency, buildOrderMessage } from "@/lib/utils";

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
  const deliverySlots = getDeliverySlots();

  // Hybrid Payment States
  const [showPaymentOptions, setShowPaymentOptions] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"upi" | "razorpay" | null>(null);
  const [showUpiQR, setShowUpiQR] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("nutravoe_currentUser");
    if (stored) setUser(JSON.parse(stored));
  }, []);

  const razorpayKeyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
  const isRazorpayConfigured = Boolean(razorpayKeyId);

  // Helper to sync local order history since we are using mock data
  const recordMockOrder = (paymentMethodId: string) => {
    const newOrder = {
      id: "ORD" + Math.floor(Math.random() * 1000000),
      status: "Confirmed",
      date: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      items: items.map(i => `${i.quantity}x ${i.bowl.name}`).join(", "),
      slot: selectedSlot,
      total: total,
      paymentId: paymentMethodId
    };
    const stored = localStorage.getItem("nutravoe_orders");
    const existing = stored ? JSON.parse(stored) : [];
    localStorage.setItem("nutravoe_orders", JSON.stringify([newOrder, ...existing]));
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

    // Show Hybrid Payment selector instead of directly jumping to Razorpay
    setShowPaymentOptions(true);
    setError("");
  }

  async function handleRazorpayCheckout() {
    setSubmitting(true);
    setError("");

    try {
      if (isRazorpayConfigured) {
        // Full checkout with Razorpay
        const res = await fetch("/api/orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            customer: { name: user!.name, phone: user!.phone, email: user!.email },
            items: items.map((i) => ({
              bowl_name: i.bowl.name,
              quantity: i.quantity,
              price: i.bowl.price + i.customizationCost,
            })),
            total_amount_paise: total * 100,
          }),
        });

        if (!res.ok) throw new Error("Failed to create order.");
        const { razorpay_order_id } = await res.json();

        const options = {
          key: razorpayKeyId,
          amount: total * 100,
          currency: "INR",
          name: "Nutravoe",
          description: "Fresh Yogurt Bowl",
          order_id: razorpay_order_id,
          handler: async (response: {
            razorpay_payment_id: string;
            razorpay_order_id: string;
          }) => {
            recordMockOrder(response.razorpay_payment_id);
            clearCart();
            window.location.href = `/confirmation?payment_id=${response.razorpay_payment_id}&order_id=${response.razorpay_order_id}`;
          },
          prefill: { name: user!.name, contact: user!.phone, email: user!.email },
          theme: { color: "#7D9B76" },
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const win = window as any;
        if (!win.Razorpay) {
          const script = document.createElement("script");
          script.src = "https://checkout.razorpay.com/v1/checkout.js";
          document.body.appendChild(script);
          await new Promise((r) => (script.onload = r));
        }
        const rzp = new win.Razorpay(options);
        rzp.open();
      } else {
        // WhatsApp order fallback
        const message = buildOrderMessage(
          user!.name,
          items.map((i) => ({
            bowl_name: i.bowl.name,
            quantity: i.quantity,
            price: i.bowl.price + i.customizationCost,
          })),
          total
        );
        recordMockOrder("wa_fallback");
        clearCart();
        window.open(`https://wa.me/917899858374?text=${encodeURIComponent(message)}`, "_blank");
        window.location.href = "/confirmation";
      }
    } catch {
      setError("Something went wrong with Razorpay. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // Dummy UPI Deep Link
  const upiUrl = `upi://pay?pa=dummy-seller@upi&pn=Nutravoe&am=${total}&cu=INR`;

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
                    const effectiveUnitPrice = item.bowl.price + item.customizationCost;

                    return (
                      <div
                        key={item.bowl._id}
                        className="flex items-start gap-4 bg-[#F9F8F6] p-4 rounded-lg"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-display text-lg font-medium text-ink">
                            {item.bowl.name}
                          </p>
                          <p className="font-body text-[13px] text-stone mt-0.5">
                            {formatCurrency(effectiveUnitPrice)} each
                          </p>
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
                              onClick={() => updateQuantity(item.bowl._id, item.quantity - 1)}
                              className="w-6 h-6 flex items-center justify-center text-stone hover:text-ink transition-colors cursor-pointer"
                            >
                              −
                            </button>
                            <span className="font-body text-sm w-4 text-center font-medium">
                              {item.quantity}
                            </span>
                            <button
                              onClick={() => updateQuantity(item.bowl._id, item.quantity + 1)}
                              className="w-6 h-6 flex items-center justify-center text-stone hover:text-ink transition-colors cursor-pointer"
                            >
                              +
                            </button>
                          </div>
                          <span className="font-display text-lg text-sage-dark w-[80px] text-right">
                            {formatCurrency(effectiveUnitPrice * item.quantity)}
                          </span>
                          <button
                            onClick={() => removeItem(item.bowl._id)}
                            className="w-8 h-8 rounded-full border border-black/5 flex items-center justify-center text-stone hover:bg-terracotta/5 hover:text-terracotta transition-colors ml-2 cursor-pointer bg-white"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="flex items-center justify-between border-t border-black/5 pt-6 mb-6">
                  <span className="font-body text-sm font-bold uppercase tracking-wider text-ink/70">
                    Grand Total
                  </span>
                  <span className="font-display text-3xl font-medium text-sage-dark">
                    {formatCurrency(total)}
                  </span>
                </div>

                <div className="mb-6">
                  <label className="block font-body text-[11px] font-bold uppercase tracking-wider text-stone mb-2">
                    Select Delivery Slot
                  </label>
                  <button
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
                  {user ? "You will select your preferred payment method next." : "You will be asked to sign in to your Nutravoe account to continue."}
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
          <div className="bg-white rounded-t-3xl md:rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in slide-in-from-bottom-[50%] md:zoom-in-95 duration-400">
            {/* Header */}
            <div className="bg-white px-6 py-5 flex items-center justify-between border-b border-black/5 shrink-0 sticky top-0 z-10">
              <div>
                <h3 className="font-display text-2xl font-medium text-ink">Choose a timeslot</h3>
                <p className="font-body text-[12px] text-stone mt-0.5 tracking-wide">Select your ideal delivery window</p>
              </div>
              <button
                onClick={() => setShowSlotPicker(false)}
                className="text-stone hover:text-ink w-8 h-8 flex items-center justify-center rounded-full bg-black/5 hover:bg-black/10 transition-colors cursor-pointer"
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

      {/* Hybrid Payment Options Modal */}
      {showPaymentOptions && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-ink/70 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
            {/* Header */}
            <div className="bg-[#F0F2F2] px-6 py-5 flex items-center justify-between border-b border-black/5">
              <h3 className="font-display text-xl font-medium text-ink">Choose Payment Method</h3>
              <button
                onClick={() => {
                  setShowPaymentOptions(false);
                  setPaymentMethod(null);
                  setShowUpiQR(false);
                }}
                className="text-stone hover:text-ink transition-colors cursor-pointer"
                aria-label="Close"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
              </button>
            </div>

            {/* Body */}
            <div className="p-6">
              {!paymentMethod ? (
                <div className="flex flex-col gap-4">
                  <p className="font-body text-[14px] text-stone mb-2 leading-relaxed">
                    How would you like to pay the <span className="font-bold text-ink">{formatCurrency(total)}</span>?
                  </p>

                  {/* Option 1: UPI Hybrid */}
                  <button
                    onClick={() => setPaymentMethod("upi")}
                    className="flex items-center gap-4 p-4 border border-black/10 hover:border-sage rounded-xl hover:bg-sage/5 transition-all text-left group"
                  >
                    <div className="w-12 h-12 rounded-full bg-sage/10 text-sage flex items-center justify-center shrink-0">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><line x1="12" x2="12" y1="8" y2="16"/><line x1="8" x2="16" y1="12" y2="12"/></svg>
                    </div>
                    <div>
                      <h4 className="font-display text-lg font-medium text-ink group-hover:text-sage-dark transition-colors">Direct UPI / QR Code</h4>
                      <p className="font-body text-[12px] text-stone mt-0.5">Pay via GPay, PhonePe, Paytm, or scan our QR</p>
                    </div>
                  </button>

                  {/* Option 2: Razorpay */}
                  <button
                    onClick={() => setPaymentMethod("razorpay")}
                    className="flex items-center gap-4 p-4 border border-black/10 hover:border-[#3395FF] rounded-xl hover:bg-[#3395FF]/5 transition-all text-left group"
                  >
                    <div className="w-12 h-12 rounded-full bg-[#3395FF]/10 text-[#3395FF] flex items-center justify-center shrink-0">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>
                    </div>
                    <div>
                      <h4 className="font-display text-lg font-medium text-ink group-hover:text-[#3395FF] transition-colors">Pay with Razorpay</h4>
                      <p className="font-body text-[12px] text-stone mt-0.5">Credit/Debit Cards, Netbanking, Wallets</p>
                    </div>
                  </button>
                </div>
              ) : paymentMethod === "upi" ? (
                <div className="flex flex-col animate-in slide-in-from-right-4 duration-300">
                  <button onClick={() => { setPaymentMethod(null); setShowUpiQR(false); }} className="text-sage hover:underline drop-shadow-sm font-body text-[12px] font-bold tracking-wide mb-6 flex items-center gap-1.5 w-fit">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                    Back to methods
                  </button>

                  <h4 className="font-display text-xl font-medium text-ink mb-1">UPI Payment</h4>
                  <p className="font-body text-[13px] text-stone mb-6">Amount to pay: <span className="font-bold text-ink">{formatCurrency(total)}</span></p>

                  <div className="flex flex-col gap-3">
                    {/* Direct App Linking intent */}
                    <a
                      href={upiUrl}
                      className="w-full flex items-center justify-center gap-2 bg-ink hover:bg-black text-white font-body text-[13px] font-bold tracking-wide py-3.5 rounded-md transition-colors shadow-md"
                    >
                      <img src="https://upload.wikimedia.org/wikipedia/commons/e/e1/UPI-Logo-vector.svg" alt="UPI" className="h-4 mr-1 brightness-0 invert" />
                      Open UPI App on Phone
                    </a>

                    <div className="flex items-center gap-3 py-2">
                       <div className="flex-1 h-px bg-black/10"></div>
                       <span className="font-body text-[11px] text-stone/60 uppercase tracking-wider font-medium">Or</span>
                       <div className="flex-1 h-px bg-black/10"></div>
                    </div>

                    <button
                      onClick={() => setShowUpiQR(!showUpiQR)}
                      className="w-full border-2 border-sage/50 bg-[#F9F8F6] hover:bg-sage/10 text-ink font-body text-[13px] font-bold py-3.5 rounded-md transition-colors"
                    >
                      {showUpiQR ? "Hide QR Code" : "Show Seller QR Code"}
                    </button>
                  </div>

                  {showUpiQR && (
                    <div className="mt-6 flex flex-col items-center justify-center p-6 border border-black/10 rounded-xl bg-white animate-in zoom-in-95 duration-300">
                      <div className="w-48 h-48 bg-stone/5 border border-stone/20 rounded-lg flex items-center justify-center mb-4 relative overflow-hidden">
                        {/* Dummy QR placeholder - could be an actual generated SVG/image */}
                        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(circle, #000 2px, transparent 2px)', backgroundSize: '10px 10px' }}></div>
                        <div className="relative font-bold font-body text-stone uppercase tracking-widest text-xs z-10 bg-white px-2 py-1 border border-stone/20">Dummy QR</div>
                      </div>
                      <p className="font-body text-[12px] text-stone text-center mb-1">Scan using any UPI app</p>
                      <p className="font-display text-lg font-medium text-sage-dark">Nutravoe Official</p>

                      <button
                        onClick={() => {
                          recordMockOrder("UPI_QR_SCANNED");
                          clearCart();
                          window.location.href = `/confirmation?payment_id=upi_dummy_${Date.now()}`;
                        }}
                        className="mt-5 w-full bg-sage hover:bg-sage-dark text-white font-body text-xs font-bold py-2.5 rounded-md cursor-pointer transition-colors shadow-sm"
                      >
                        I have completed the payment
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col animate-in slide-in-from-right-4 duration-300">
                  <button onClick={() => setPaymentMethod(null)} className="text-sage hover:underline drop-shadow-sm font-body text-[12px] font-bold tracking-wide mb-6 flex items-center gap-1.5 w-fit">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                    Back to methods
                  </button>

                  <h4 className="font-display text-xl font-medium text-ink mb-1">Razorpay Gateway</h4>
                  <p className="font-body text-[13px] text-stone mb-6 leading-relaxed">
                    You will be securely redirected to Razorpay where you can choose Credit/Debit Cards, Netbanking, or Wallets.
                  </p>

                  {error && <p className="font-body text-[13px] text-terracotta mb-4 font-medium">{error}</p>}

                  <button
                    onClick={handleRazorpayCheckout}
                    disabled={submitting}
                    className="w-full flex items-center justify-center gap-2 bg-[#3395FF] hover:bg-[#2082E6] disabled:bg-[#3395FF]/50 text-white font-body text-[13px] font-bold tracking-wide py-3.5 rounded-md transition-colors shadow-md"
                  >
                    {submitting ? "Connecting to secure gateway..." : `Pay ${formatCurrency(total)} Securely`}
                  </button>
                  <p className="font-body text-[11px] text-stone text-center mt-4 px-4 leading-relaxed">
                    We'll hand over the transaction to Razorpay. Do not close the window after clicking.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
