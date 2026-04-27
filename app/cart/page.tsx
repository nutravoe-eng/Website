"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useCart } from "@/components/CartContext";
import { formatCurrency } from "@/lib/utils";
import { getActivePlanConfig } from "@/lib/subscription";
import { getWallet } from "@/lib/wallet";
import { resolveDeliveryCoords } from "@/lib/geocodeCache";
import type { DeliveryPriceBreakdown } from "@/lib/delivery";
import { HUBS } from "@/lib/delivery";
import { createClient } from "@/lib/supabase/client";
import { useDialogAccessibility } from "@/lib/use-dialog-accessibility";
import { isPaidFlexibleWalletEligible } from "@/lib/flexible-subscription";
import { BENGALURU_NOT_SERVICEABLE_MESSAGE, isBengaluruServiceableAddress } from "@/lib/serviceability";
import DeliveryMarquee from "@/components/DeliveryMarquee";
import { GUEST_DELIVERY_CONTEXT_EVENT, readGuestDeliveryContext } from "@/lib/guest-delivery";
import { getSubscriberBaseFromPlanConfig } from "@/lib/subscription-pricing";
import type { PlanConfig } from "@/app/subscribe/PlanCard";
import {
  DEFAULT_DELIVERY_POLICY,
  type DeliveryMode,
  type DeliveryPolicy,
  buildSlotKey,
  formatCalendarSlotLabel,
  formatDateLabel,
  getAsapSlot,
  getIstDateIso,
  getNowIst,
  getSlotAvailabilityForDate,
  parseSlotKey,
} from "@/lib/delivery-policy";


interface StoredUser {
  name: string;
  phone: string;
  email: string;
}

interface DeliveryAddress {
  id: string;
  label: string | null;
  line1: string;
  line2: string | null;
  city: string;
  state: string | null;
  pincode: string;
  is_default: boolean;
  lat: number | null;
  lng: number | null;
}

export default function CartPage() {
  const router = useRouter();
  const { items, total, clearCart, removeItem, updateQuantity } = useCart();
  const hasOutOfStockItems = items.some((item) => item.bowl.inStock === false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [user, setUser] = useState<StoredUser | null>(null);

  // Delivery Slots State
  const [deliveryPolicy, setDeliveryPolicy] = useState<DeliveryPolicy>(DEFAULT_DELIVERY_POLICY);
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>("scheduled");
  const [selectedSlot, setSelectedSlot] = useState<string>("");
  const [showSlotPicker, setShowSlotPicker] = useState(false);
  const slotDialogRef = useRef<HTMLDivElement>(null);
  useDialogAccessibility(slotDialogRef, () => setShowSlotPicker(false));
  const [showAddressPicker, setShowAddressPicker] = useState(false);
  const addressDialogRef = useRef<HTMLDivElement>(null);
  useDialogAccessibility(addressDialogRef, () => setShowAddressPicker(false));
  const nowIst = getNowIst();
  const asapSlot = getAsapSlot(deliveryPolicy, nowIst);
  const todayIso = getIstDateIso(nowIst);

  // Calendar picker state
  const [calViewState, setCalViewState] = useState<"calendar" | "slots">("calendar");
  const [calSelectedDateIso, setCalSelectedDateIso] = useState<string | null>(null);
  const [calMonth, setCalMonth] = useState<{ year: number; month: number }>(() => ({
    year: nowIst.getFullYear(),
    month: nowIst.getMonth(),
  }));

  // Active subscription plan (tiered standard / premium rates)
  const [subPlanConfig, setSubPlanConfig] = useState<PlanConfig | null>(null);

  // Wallet payment
  const [walletBalanceRs, setWalletBalanceRs] = useState<number>(0);
  const [hasActivePaidSub, setHasActivePaidSub] = useState(false);

  // Customer notes
  const [notes, setNotes] = useState("");

  // Delivery fee
  const [deliveryFee, setDeliveryFee] = useState<number>(0);
  const [deliveryBreakdown, setDeliveryBreakdown] = useState<({ isFree: false } & DeliveryPriceBreakdown) | { isFree: true; distanceKm: number } | null>(null);
  const [deliveryFeeLoading, setDeliveryFeeLoading] = useState(true);
  const [nearestHubName, setNearestHubName] = useState<string>(HUBS[0]?.name ?? "Domlur Kitchen");
  const [deliveryDistanceKm, setDeliveryDistanceKm] = useState<number | null>(null);
  const [savedAddresses, setSavedAddresses] = useState<DeliveryAddress[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [savingAddressId, setSavingAddressId] = useState<string | null>(null);
  const [addressServiceabilityError, setAddressServiceabilityError] = useState<string>("");

  const formatAddressSingleLine = (address: DeliveryAddress | null) => {
    if (!address) return "No delivery address selected";
    return [address.line1, address.line2, `${address.city}, ${address.pincode}`]
      .filter((part) => typeof part === "string" && part.trim().length > 0)
      .join(", ");
  };

  const selectedAddress =
    savedAddresses.find((addr) => addr.id === selectedAddressId) ??
    savedAddresses.find((addr) => addr.is_default) ??
    savedAddresses[0] ??
    null;
  const isSelectedAddressServiceable = selectedAddress ? isBengaluruServiceableAddress(selectedAddress) : false;

  const syncAddressCache = (addresses: DeliveryAddress[]) => {
    const legacy = addresses.map((a) => ({
      id: a.id,
      tag: a.label ?? undefined,
      line1: a.line1,
      line2: a.line2 ?? "",
      pincode: a.pincode,
      isDefault: a.is_default,
      ...(typeof a.lat === "number" && typeof a.lng === "number" ? { lat: a.lat, lng: a.lng } : {}),
    }));
    localStorage.setItem("nutravoe_addresses", JSON.stringify(legacy));
    window.dispatchEvent(new Event("address_change"));
  };

  const handleSelectAddress = async (addressId: string) => {
    const supabase = createClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) return;
    setSavingAddressId(addressId);
    try {
      await supabase.from("addresses").update({ is_default: false }).eq("user_id", authUser.id);
      await supabase.from("addresses").update({ is_default: true }).eq("id", addressId);
      const updated = savedAddresses.map((a) => ({ ...a, is_default: a.id === addressId }));
      setSavedAddresses(updated);
      setSelectedAddressId(addressId);
      syncAddressCache(updated);
      setShowAddressPicker(false);
    } finally {
      setSavingAddressId(null);
    }
  };

  useEffect(() => {
    const hydrateDeliveryFee = async () => {
      const policyRes = await fetch("/api/delivery-policy", { cache: "no-store" }).catch(() => null);
      if (policyRes?.ok) {
        const policyData = await policyRes.json().catch(() => null);
        const nextPolicy = (policyData?.policy ?? DEFAULT_DELIVERY_POLICY) as DeliveryPolicy;
        setDeliveryPolicy(nextPolicy);
        const asapAvailable = Boolean(policyData?.availability?.asapAvailable);
        if (asapAvailable) {
          setDeliveryMode("asap");
          setSelectedSlot("");
        } else {
          setDeliveryMode("scheduled");
        }
      }

      const supabase = createClient();
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (authUser) {
        const name = (authUser.user_metadata?.full_name as string | undefined) ?? authUser.email?.split("@")[0] ?? "";
        setUser({ name, phone: "", email: authUser.email ?? "" });
      }

      const [planConfig] = await Promise.all([getActivePlanConfig()]);
      if (planConfig) setSubPlanConfig(planConfig);

      // Wallet checkout: paid flexible, active or completed but still within billing period
      if (authUser) {
        const { data: flexRows } = await supabase
          .from("subscriptions")
          .select("id, style, status, payment_status, period_end_date")
          .eq("user_id", authUser.id)
          .eq("style", "flexible")
          .eq("payment_status", "paid");
        const eligible = (flexRows ?? []).some((r: { style: string | null; status: string | null; payment_status: string | null; period_end_date: string | null }) =>
          isPaidFlexibleWalletEligible({
            style: r.style ?? "",
            status: r.status ?? "",
            payment_status: r.payment_status ?? "",
            period_end_date: r.period_end_date,
          }),
        );
        if (eligible) {
          setHasActivePaidSub(true);
          const wallet = await getWallet();
          setWalletBalanceRs(wallet.balancePaise / 100);
        }
      }

      // Resolve delivery fee: prefer signed-in selected/default address
      type CachedAddr = { pincode: string; isDefault?: boolean; lat?: number; lng?: number };
      let addrPick: { pincode: string; lat: number | null; lng: number | null } | null = null;
      if (authUser) {
        const { data: addrs } = await supabase
          .from("addresses")
          .select("id, label, line1, line2, city, state, pincode, lat, lng, is_default")
          .eq("user_id", authUser.id)
          .order("is_default", { ascending: false });
        const normalized = (addrs ?? []) as DeliveryAddress[];
        setSavedAddresses(normalized);
        const row = normalized.find((a) => a.is_default) ?? normalized[0];
        if (row?.id) setSelectedAddressId(row.id);
        if (row?.pincode) {
          if (!isBengaluruServiceableAddress(row)) {
            setAddressServiceabilityError(BENGALURU_NOT_SERVICEABLE_MESSAGE);
            setDeliveryBreakdown(null);
            setDeliveryDistanceKm(null);
            setDeliveryFee(0);
            setDeliveryFeeLoading(false);
            return;
          }
          setAddressServiceabilityError("");
          addrPick = { pincode: row.pincode, lat: row.lat, lng: row.lng };
        }
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
      if (!addrPick && !authUser) {
        const guestCtx = readGuestDeliveryContext();
        if (guestCtx) {
          setDeliveryFee(guestCtx.deliveryFee);
          setNearestHubName(guestCtx.hubName || HUBS[0]?.name || "Domlur Kitchen");
          setDeliveryDistanceKm(guestCtx.distanceKm);
          if (guestCtx.deliveryFee > 0) {
            const ceilKm = Math.ceil(guestCtx.distanceKm);
            setDeliveryBreakdown({
              isFree: false,
              distanceKm: guestCtx.distanceKm,
              ceilKm,
              totalCostRs: ceilKm * 10,
              nutravoeCoverageRs: ceilKm * 5,
              customerPaysRs: guestCtx.deliveryFee,
            });
          } else {
            setDeliveryBreakdown({ isFree: true, distanceKm: guestCtx.distanceKm });
          }
          setDeliveryFeeLoading(false);
          return;
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
    };
    hydrateDeliveryFee();
    window.addEventListener("address_change", hydrateDeliveryFee);
    window.addEventListener(GUEST_DELIVERY_CONTEXT_EVENT, hydrateDeliveryFee);
    return () => {
      window.removeEventListener("address_change", hydrateDeliveryFee);
      window.removeEventListener(GUEST_DELIVERY_CONTEXT_EVENT, hydrateDeliveryFee);
    };
  }, []);

  // Subscriber discount — per bowl tier (customization extras still at full cost)
  const subscriberDiscount =
    subPlanConfig !== null
      ? items.reduce((sum, item) => {
          const subBase = getSubscriberBaseFromPlanConfig(item.bowl, subPlanConfig);
          return sum + Math.max(0, item.bowl.price - subBase) * item.quantity;
        }, 0)
      : 0;
  const effectiveTotal = total - subscriberDiscount;
  const grandTotal = effectiveTotal + deliveryFee;
  const canPayFromWallet = hasActivePaidSub && !deliveryFeeLoading && walletBalanceRs >= grandTotal;
  const selectedSlotLabel = (() => {
    if (!selectedSlot) return "";
    const parsed = parseSlotKey(selectedSlot);
    return parsed ? formatCalendarSlotLabel(parsed.dateIso, parsed.startHour) : selectedSlot;
  })();
  const recordOrder = async (): Promise<boolean> => {
    const res = await fetch("/api/orders/whatsapp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        deliveryMode,
        selectedSlot: deliveryMode === "scheduled" ? selectedSlot : undefined,
        items: items.map((item) => ({
          bowlSlug: item.bowl.slug,
          quantity: item.quantity,
          customizations: item.customizations,
          presetOptions: item.presetOptions,
        })),
        notes: notes.trim() || undefined,
      }),
    });

    return res.ok;
  };

  async function handlePayFromWallet() {
    if (hasOutOfStockItems) {
      setError("Remove out-of-stock items before placing an order.");
      return;
    }
    if (items.length === 0) { setError("Your cart is empty. Add some bowls first."); return; }
    if (deliveryMode === "scheduled" && !selectedSlot) { setError("Please select a delivery slot before placing an order."); return; }
    if (deliveryMode === "asap" && !asapSlot) { setError("Delivery in 60 min is not available right now."); return; }
    if (!user) { router.push("/signin?next=/cart"); return; }
    if (!selectedAddress) { setError("Please select a delivery address before placing an order."); return; }
    if (!isSelectedAddressServiceable) { setError(BENGALURU_NOT_SERVICEABLE_MESSAGE); return; }

    setSubmitting(true);
    setError("");

    try {
      const res = await fetch("/api/orders/wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deliveryMode,
          selectedSlot: deliveryMode === "scheduled" ? selectedSlot : undefined,
          items: items.map((item) => ({
            bowlSlug: item.bowl.slug,
            quantity: item.quantity,
            customizations: item.customizations,
            presetOptions: item.presetOptions,
          })),
          notes: notes.trim() || undefined,
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
    if (hasOutOfStockItems) {
      setError("Remove out-of-stock items before placing an order.");
      return;
    }
    if (items.length === 0) {
      setError("Your cart is empty. Add some bowls first.");
      return;
    }
    if (deliveryMode === "scheduled" && !selectedSlot) {
      setError("Please select a delivery slot before placing an order.");
      return;
    }
    if (deliveryMode === "asap" && !asapSlot) {
      setError("Delivery in 60 min is not available right now.");
      return;
    }

    if (!user) {
      router.push("/signin?next=/cart");
      return;
    }
    if (!selectedAddress) {
      setError("Please select a delivery address before placing an order.");
      return;
    }
    if (!isSelectedAddressServiceable) {
      setError(BENGALURU_NOT_SERVICEABLE_MESSAGE);
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const ok = await recordOrder();
      if (!ok) {
        setError("Failed to place order. Please try again.");
        return;
      }
      clearCart();
      window.location.href = "/confirmation";
    } catch {
      setError("Something went wrong while placing your order.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <DeliveryMarquee variant="light" />
      <section className={`pt-16 px-6 lg:px-16 min-h-[80vh] ${items.length > 0 ? "pb-32 sm:pb-20" : "pb-20"}`}>
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
                    const subBase = subPlanConfig
                      ? getSubscriberBaseFromPlanConfig(item.bowl, subPlanConfig)
                      : null;
                    const basePrice = subBase ?? item.bowl.price;
                    const effectiveUnitPrice = basePrice + item.customizationCost;
                    const isDiscounted = subBase !== null && item.bowl.price > subBase;

                    return (
                      <div
                        key={item.instanceId}
                        className="flex flex-col gap-3 bg-[#F9F8F6] p-4 rounded-lg sm:flex-row sm:items-start sm:gap-4"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-display text-lg font-medium text-ink leading-snug break-words">
                            {item.bowl.name}
                          </p>
                          <div className="flex flex-wrap items-center gap-2 mt-0.5">
                            <p className="font-body text-[13px] text-stone whitespace-nowrap">
                              Base price - {formatCurrency(basePrice)}
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
                            <div className="mt-1.5 space-y-0.5">
                              <p className="font-body text-[11px] text-stone leading-relaxed break-words">
                                Base: {item.presetOptions.baseChoice === "milk" ? "Milk" : "Yogurt"} · Oats: {item.presetOptions.oatsChoice === "roasted" ? "Roasted" : "Soaked"}
                              </p>
                              {item.presetOptions.noSugar && (
                                <p className="font-body text-[11px] text-terracotta leading-relaxed break-words">
                                  No sugar: exclude banana, honey, dates
                                </p>
                              )}
                              {removed.map(c => {
                                const ing = item.bowl.customizableIngredients?.find(i => i.id === c.ingredientId);
                                if (!ing) return null;
                                return (
                                  <p key={c.ingredientId} className="font-body text-[11px] text-terracotta">
                                    &minus;{ing.name} = 0
                                  </p>
                                );
                              })}
                              {extras.map(c => {
                                const ing = item.bowl.customizableIngredients?.find(i => i.id === c.ingredientId);
                                if (!ing) return null;
                                return (
                                  <p key={c.ingredientId} className="font-body text-[11px] text-sage-dark">
                                    +{ing.name} = +{formatCurrency(ing.extraCost)}
                                  </p>
                                );
                              })}
                            </div>
                          )}
                          {removed.length === 0 && extras.length === 0 && (
                            <div className="mt-1.5 space-y-0.5">
                              <p className="font-body text-[11px] text-stone leading-relaxed break-words">
                                Base: {item.presetOptions.baseChoice === "milk" ? "Milk" : "Yogurt"} · Oats: {item.presetOptions.oatsChoice === "roasted" ? "Roasted" : "Soaked"}
                              </p>
                              {item.presetOptions.noSugar && (
                                <p className="font-body text-[11px] text-terracotta leading-relaxed break-words">
                                  No sugar: exclude banana, honey, dates
                                </p>
                              )}
                            </div>
                          )}
                          {item.bowl.inStock === false && (
                            <p className="font-body text-[11px] font-medium text-terracotta mt-2">
                              Out of stock — please remove to continue.
                            </p>
                          )}
                        </div>
                        <div className="flex items-center justify-between gap-2 shrink-0 w-full sm:w-auto sm:justify-start sm:gap-3">
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
                              disabled={item.bowl.inStock === false}
                              className="w-6 h-6 flex items-center justify-center text-stone hover:text-ink transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                              +
                            </button>
                          </div>
                          <span className="font-display text-lg text-sage-dark min-w-[72px] text-right">
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

                {user && (
                  <div className="mb-6 rounded-lg border border-black/10 bg-[#F9F8F6] px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-body text-[11px] font-bold uppercase tracking-wider text-stone mb-1">Deliver to</p>
                        <p className="font-body text-[13px] text-ink truncate">
                          {formatAddressSingleLine(selectedAddress)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowAddressPicker(true)}
                        className="font-body text-[12px] font-bold text-sage hover:text-sage-dark underline shrink-0"
                      >
                        Edit address
                      </button>
                    </div>
                  </div>
                )}
                {addressServiceabilityError && (
                  <div className="mb-6 rounded-lg border border-terracotta/20 bg-terracotta/5 px-4 py-3">
                    <p className="font-body text-[12px] font-medium text-terracotta">{addressServiceabilityError}</p>
                  </div>
                )}

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
                        Delivery is free within 10 km. If delivery is charged, your address is beyond 10 km from Domlur Kitchen.
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

                <div className="mb-6 space-y-3">
                  <label className="block font-body text-[11px] font-bold uppercase tracking-wider text-stone">
                    Delivery Mode
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (!asapSlot) return;
                        setDeliveryMode("asap");
                        setError("");
                      }}
                      disabled={!asapSlot}
                      className={`rounded-lg border px-4 py-3 text-left transition-colors ${
                        deliveryMode === "asap"
                          ? "border-sage bg-sage/10"
                          : "border-black/10 bg-[#F9F8F6]"
                      } disabled:opacity-40 disabled:cursor-not-allowed`}
                    >
                      <p className="font-body text-[13px] font-bold text-ink">Delivery in 60 min</p>
                      <p className="font-body text-[11px] text-stone">
                        {asapSlot ? `Next slot: ${asapSlot.label}` : "Available 9:00 AM-7:00 PM only"}
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDeliveryMode("scheduled");
                        setError("");
                        setCalViewState("calendar");
                        setShowSlotPicker(true);
                      }}
                      className={`rounded-lg border px-4 py-3 text-left transition-colors ${
                        deliveryMode === "scheduled"
                          ? "border-sage bg-sage/10"
                          : "border-black/10 bg-[#F9F8F6]"
                      }`}
                    >
                      <p className="font-body text-[13px] font-bold text-ink">Schedule for later</p>
                      <p className="font-body text-[11px] text-stone">Pick any available slot</p>
                    </button>
                  </div>
                </div>

                <div className="mb-6">
                  <label className="block font-body text-[11px] font-bold uppercase tracking-wider text-stone mb-2">
                    {deliveryMode === "asap" ? "Selected Delivery Slot" : "Select Delivery Slot"}
                  </label>
                  {deliveryMode === "asap" ? (
                    <div className="w-full border border-black/10 rounded-lg px-4 py-3.5 bg-[#F9F8F6]">
                      <span className="font-body text-[13px] text-ink font-bold tracking-wide">
                        {asapSlot?.label ?? "Delivery in 60 min unavailable right now"}
                      </span>
                    </div>
                  ) : (
                    <button
                      aria-label={selectedSlot ? `Selected delivery slot ${selectedSlot}` : "Choose an available delivery slot"}
                      onClick={() => { setShowSlotPicker(true); setError(""); }}
                      className="w-full flex items-center justify-between border border-black/10 rounded-lg px-4 py-3.5 bg-[#F9F8F6] hover:bg-sage/5 hover:border-sage/30 transition-colors text-left group cursor-pointer shadow-sm"
                    >
                      <span className={`font-body text-[13px] ${selectedSlotLabel ? 'text-ink font-bold tracking-wide' : 'text-stone font-medium'}`}>
                        {selectedSlotLabel || "Choose an available time slot"}
                      </span>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-stone group-hover:text-sage transition-colors"><path d="m6 9 6 6 6-6"/></svg>
                    </button>
                  )}
                </div>

                {/* Customer notes */}
                <div className="mb-5">
                  <label htmlFor="order-notes" className="block font-body text-[12px] font-bold uppercase tracking-wider text-stone mb-2">
                    Any notes for us? <span className="font-normal normal-case tracking-normal">(allergies, preferences…)</span>
                  </label>
                  <textarea
                    id="order-notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value.slice(0, 300))}
                    placeholder="e.g. I'm allergic to peanuts"
                    rows={3}
                    className="w-full border border-black/10 rounded-lg px-4 py-3 font-body text-[13px] text-ink placeholder:text-stone/50 bg-[#F9F8F6] focus:outline-none focus:ring-1 focus:ring-sage/40 resize-none"
                  />
                  <p className="font-body text-[11px] text-stone/60 text-right mt-1">{notes.length}/300</p>
                </div>

                {hasOutOfStockItems && (
                  <div className="mb-4 p-4 bg-terracotta/5 border border-terracotta/20 rounded-md">
                    <p className="font-body text-[13px] font-medium text-terracotta">
                      Remove out-of-stock items above before checking out.
                    </p>
                  </div>
                )}

                {error && (
                  <div className="mb-4 p-4 bg-terracotta/5 border border-terracotta/20 rounded-md">
                    <p className="font-body text-[13px] font-medium text-terracotta">{error}</p>
                  </div>
                )}

                {hasActivePaidSub && (
                  <div className="mb-3">
                    <button
                      onClick={handlePayFromWallet}
                      disabled={submitting || !canPayFromWallet || hasOutOfStockItems || !isSelectedAddressServiceable}
                      className="w-full bg-sage hover:bg-sage-dark disabled:bg-black/10 disabled:text-stone text-white font-body text-sm font-bold tracking-wide py-4 rounded-md transition-colors shadow-sm flex items-center justify-center gap-2"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M16 12h.01"/></svg>
                      {canPayFromWallet
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
                  disabled={submitting || hasOutOfStockItems || !isSelectedAddressServiceable}
                  className={`hidden sm:block w-full disabled:bg-black/10 disabled:text-stone text-white font-body text-sm font-bold tracking-wide py-4 rounded-md transition-colors shadow-sm ${canPayFromWallet ? "bg-black/20 hover:bg-black/30 text-ink" : "bg-terracotta hover:bg-[#D55F43]"}`}
                >
                  {canPayFromWallet ? "Place order instead" : "Place order"}
                </button>

                <p className="font-body text-[11px] text-stone text-center mt-4">
                  {user ? (canPayFromWallet ? "" : "Your order request will be sent directly to our team for confirmation.") : "You will be asked to sign in to your Nutravoe account to continue."}
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

      {items.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-[90] border-t border-black/10 bg-white/95 backdrop-blur sm:hidden">
          <div className="mx-auto max-w-2xl px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-body text-[11px] font-bold uppercase tracking-wider text-ink/70">
                Grand Total
              </span>
              <span className="font-display text-xl font-medium text-sage-dark">
                {formatCurrency(grandTotal)}
              </span>
            </div>
            <button
              onClick={handlePlaceOrder}
              disabled={submitting || hasOutOfStockItems || !isSelectedAddressServiceable}
              className={`w-full disabled:bg-black/10 disabled:text-stone text-white font-body text-sm font-bold tracking-wide py-3.5 rounded-md transition-colors shadow-sm ${canPayFromWallet ? "bg-black/20 text-ink" : "bg-terracotta"}`}
            >
              {canPayFromWallet ? "Place order instead" : "Place order"}
            </button>
          </div>
        </div>
      )}

      {showAddressPicker && (
        <div className="fixed inset-0 z-[120] flex items-end md:items-center justify-center p-0 md:p-4 bg-ink/70 backdrop-blur-sm animate-in fade-in duration-300">
          <div
            ref={addressDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="delivery-address-title"
            tabIndex={-1}
            className="bg-white rounded-t-3xl md:rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in slide-in-from-bottom-[50%] md:zoom-in-95 duration-300"
          >
            <div className="px-5 py-4 border-b border-black/5 flex items-center justify-between">
              <h3 id="delivery-address-title" className="font-display text-2xl text-ink">Choose delivery address</h3>
              <button
                type="button"
                onClick={() => setShowAddressPicker(false)}
                className="w-8 h-8 rounded-full bg-black/5 hover:bg-black/10 flex items-center justify-center text-stone"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
              </button>
            </div>
            <div className="p-4 overflow-y-auto space-y-3">
              {savedAddresses.length === 0 ? (
                <p className="font-body text-[13px] text-stone">No saved addresses found.</p>
              ) : (
                savedAddresses.map((address) => (
                  <button
                    key={address.id}
                    type="button"
                    onClick={() => handleSelectAddress(address.id)}
                    disabled={savingAddressId !== null}
                    className={`w-full text-left rounded-xl border px-4 py-3 transition-colors ${
                      selectedAddress?.id === address.id
                        ? "border-sage bg-sage/5 shadow-sm"
                        : "border-black/10 bg-white hover:border-sage/30 hover:bg-[#F9F8F6]"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`mt-0.5 w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                        selectedAddress?.id === address.id ? "bg-sage/15 text-sage-dark" : "bg-[#F0F2F2] text-stone"
                      }`}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-body text-[13px] font-bold text-ink">
                            {address.label || "Address"}
                          </p>
                          {address.is_default && (
                            <span className="font-body text-[10px] font-bold uppercase tracking-wider bg-sage/15 text-sage-dark px-2 py-0.5 rounded-full">
                              Default
                            </span>
                          )}
                          {selectedAddress?.id === address.id && (
                            <span className="font-body text-[10px] font-bold uppercase tracking-wider bg-ink/5 text-ink px-2 py-0.5 rounded-full">
                              Selected
                            </span>
                          )}
                        </div>
                        <p className="font-body text-[12px] text-stone mt-1 leading-relaxed">{formatAddressSingleLine(address)}</p>
                      </div>
                      {savingAddressId === address.id ? (
                        <span className="font-body text-[11px] text-stone shrink-0">Saving…</span>
                      ) : (
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className={`shrink-0 mt-1 ${selectedAddress?.id === address.id ? "text-sage-dark" : "text-stone/50"}`}
                        >
                          <path d="m9 18 6-6-6-6"/>
                        </svg>
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>
            <div className="px-4 py-4 border-t border-black/5 bg-white">
              <button
                type="button"
                onClick={() => {
                  setShowAddressPicker(false);
                  router.push("/addresses?new=1");
                }}
                className="w-full bg-sage hover:bg-sage-dark text-white font-body text-[13px] font-bold py-3 rounded-md transition-colors"
              >
                Add new address
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delivery Slot Picker Modal — Calendar */}
      {showSlotPicker && (() => {
        const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
        const startYear = nowIst.getFullYear();
        const startMonthIdx = nowIst.getMonth();
        const maxMonthIdx = startMonthIdx === 11 ? 0 : startMonthIdx + 1;
        const maxMonthYear = startMonthIdx === 11 ? startYear + 1 : startYear;
        const isAtMinMonth = calMonth.year === startYear && calMonth.month === startMonthIdx;
        const isAtMaxMonth = calMonth.year === maxMonthYear && calMonth.month === maxMonthIdx;
        const firstDayOfWeek = new Date(calMonth.year, calMonth.month, 1).getDay();
        const daysInMonth = new Date(calMonth.year, calMonth.month + 1, 0).getDate();

        const handleDayClick = (dayIso: string) => {
          setCalSelectedDateIso(dayIso);
          setCalViewState("slots");
        };

        const handleConfirmSlot = (dateIso: string, hour: number) => {
          setSelectedSlot(buildSlotKey(dateIso, hour));
          setShowSlotPicker(false);
        };

        const slotHours = calSelectedDateIso
          ? getSlotAvailabilityForDate(deliveryPolicy, calSelectedDateIso, nowIst)
          : [];

        const selectedSlotHour = selectedSlot && calSelectedDateIso
          ? (() => { const p = parseSlotKey(selectedSlot); return p?.dateIso === calSelectedDateIso ? p.startHour : null; })()
          : null;

        return (
          <div className="fixed inset-0 z-[110] flex items-end md:items-center justify-center p-0 md:p-4 bg-ink/70 backdrop-blur-sm animate-in fade-in duration-300">
            <div
              ref={slotDialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="delivery-slot-title"
              tabIndex={-1}
              className="bg-white rounded-t-3xl md:rounded-2xl w-full md:max-w-sm shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in slide-in-from-bottom-[50%] md:zoom-in-95 duration-400"
            >
              {/* Header */}
              <div className="px-4 py-3.5 border-b border-black/5 flex items-center justify-between shrink-0">
                <div>
                  <h3 id="delivery-slot-title" className="font-display text-xl font-medium text-ink">Choose a delivery slot</h3>
                  <p className="font-body text-[11px] text-stone mt-0.5">
                    {calViewState === "calendar" ? "Pick a date, then a time window" : calSelectedDateIso ? formatDateLabel(calSelectedDateIso) : ""}
                  </p>
                </div>
                <button
                  onClick={() => setShowSlotPicker(false)}
                  aria-label="Close slot picker"
                  className="text-stone hover:text-ink w-8 h-8 flex items-center justify-center rounded-full bg-black/5 hover:bg-black/10 transition-colors cursor-pointer"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                </button>
              </div>

              {/* Info banner */}
              <div className="mx-3 mt-2.5 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 flex gap-2 items-start shrink-0">
                <svg className="text-amber-500 shrink-0 mt-0.5" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>
                <p className="font-body text-[11px] text-amber-800 leading-relaxed">
                  <strong>7–10 AM deliveries</strong> require ordering by <strong>11 PM</strong> the night before. Same-day closes at <strong>7 PM</strong>.
                </p>
              </div>

              {/* ── CALENDAR VIEW ── */}
              {calViewState === "calendar" && (
                <div className="overflow-y-auto flex-1 pb-4">
                  {/* Month navigation */}
                  <div className="flex items-center justify-between px-4 pt-3 pb-1">
                    <button
                      onClick={() => setCalMonth((m) => {
                        const newMonth = m.month === 0 ? 11 : m.month - 1;
                        const newYear = m.month === 0 ? m.year - 1 : m.year;
                        return { year: newYear, month: newMonth };
                      })}
                      disabled={isAtMinMonth}
                      aria-label="Previous month"
                      className="w-7 h-7 rounded-full bg-black/5 hover:bg-black/10 flex items-center justify-center disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                    </button>
                    <span className="font-body text-[13px] font-bold text-ink">
                      {MONTH_NAMES[calMonth.month]} {calMonth.year}
                    </span>
                    <button
                      onClick={() => setCalMonth((m) => {
                        const newMonth = m.month === 11 ? 0 : m.month + 1;
                        const newYear = m.month === 11 ? m.year + 1 : m.year;
                        return { year: newYear, month: newMonth };
                      })}
                      disabled={isAtMaxMonth}
                      aria-label="Next month"
                      className="w-7 h-7 rounded-full bg-black/5 hover:bg-black/10 flex items-center justify-center disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
                    </button>
                  </div>

                  {/* Weekday headers */}
                  <div className="grid grid-cols-7 px-3 mb-1">
                    {["Su","Mo","Tu","We","Th","Fr","Sa"].map((d) => (
                      <span key={d} className="text-center font-body text-[10px] font-bold uppercase tracking-wider text-stone/50 py-1">{d}</span>
                    ))}
                  </div>

                  {/* Day grid */}
                  <div className="grid grid-cols-7 px-3 gap-y-0.5">
                    {Array.from({ length: firstDayOfWeek }, (_, i) => (
                      <span key={`empty-${i}`} />
                    ))}
                    {Array.from({ length: daysInMonth }, (_, i) => {
                      const day = i + 1;
                      const dayIso = `${calMonth.year}-${String(calMonth.month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                      const isPast = dayIso < todayIso;
                      const isToday = dayIso === todayIso;
                      const isSelected = dayIso === calSelectedDateIso;
                      return (
                        <button
                          key={day}
                          onClick={() => !isPast && handleDayClick(dayIso)}
                          disabled={isPast}
                          aria-label={dayIso}
                          aria-pressed={isSelected}
                          className={[
                            "aspect-square flex items-center justify-center rounded-full font-body text-[13px] font-medium transition-colors relative",
                            isPast ? "text-black/20 cursor-not-allowed" : "cursor-pointer",
                            isSelected ? "bg-sage text-white" : isToday ? "text-sage-dark font-bold" : !isPast ? "hover:bg-sage/15 hover:text-sage-dark" : "",
                          ].join(" ")}
                        >
                          {day}
                          {isToday && !isSelected && (
                            <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-sage-dark" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── SLOT VIEW ── */}
              {calViewState === "slots" && calSelectedDateIso && (
                <div className="flex flex-col flex-1 overflow-hidden">
                  {/* Back button */}
                  <div className="px-3 pt-2 shrink-0">
                    <button
                      onClick={() => setCalViewState("calendar")}
                      className="flex items-center gap-1.5 font-body text-[12px] font-bold text-sage hover:text-sage-dark transition-colors px-2 py-1.5 rounded-lg hover:bg-sage/8"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                      Back to calendar
                    </button>
                  </div>

                  {/* Slots label */}
                  <p className="font-body text-[10px] font-bold uppercase tracking-wider text-stone/50 px-4 pt-2 pb-1 shrink-0">
                    Available times
                  </p>

                  {/* Slot grid */}
                  <div className="grid grid-cols-3 gap-2 px-3 overflow-y-auto flex-1 pb-2">
                    {slotHours.map(({ hour, available }) => {
                      const isSelected = selectedSlotHour === hour;
                      const fmtH = (h: number) => h < 12 ? `${h} AM` : h === 12 ? "12 PM" : `${h - 12} PM`;
                      return (
                        <button
                          key={hour}
                          onClick={() => { if (available) setSelectedSlot(buildSlotKey(calSelectedDateIso, hour)); }}
                          disabled={!available}
                          aria-pressed={isSelected}
                          className={[
                            "rounded-xl border py-2.5 text-center transition-all font-body text-[12px] font-semibold",
                            !available ? "border-black/5 bg-black/3 text-black/20 cursor-not-allowed line-through" : isSelected ? "border-sage bg-sage/10 text-sage-dark shadow-sm" : "border-black/10 bg-[#F9F8F6] text-ink hover:border-sage/40 hover:bg-sage/6 cursor-pointer",
                          ].join(" ")}
                        >
                          <span className="block">{fmtH(hour)}</span>
                          <span className="block text-[9px] opacity-60">– {fmtH(hour + 1)}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Confirm button */}
                  <div className="px-3 py-3 border-t border-black/5 shrink-0 pb-6 md:pb-3">
                    <button
                      onClick={() => selectedSlotHour !== null && handleConfirmSlot(calSelectedDateIso, selectedSlotHour)}
                      disabled={selectedSlotHour === null}
                      className="w-full bg-terracotta hover:bg-[#D55F43] disabled:bg-black/10 disabled:text-stone text-white font-body text-[13px] font-bold py-3.5 rounded-lg transition-colors"
                    >
                      {selectedSlotHour !== null
                        ? `Confirm — ${formatCalendarSlotLabel(calSelectedDateIso, selectedSlotHour)}`
                        : "Select a time above"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}

    </>
  );
}
