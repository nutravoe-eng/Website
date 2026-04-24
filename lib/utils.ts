export function formatCurrency(amount: number): string {
  return `₹ ${amount.toLocaleString("en-IN")}`;
}

export function getWhatsAppUrl(phoneNumber: string, message?: string): string {
  const base = `https://wa.me/${phoneNumber}`;
  if (!message) return base;
  return `${base}?text=${encodeURIComponent(message)}`;
}

export function buildOrderMessage(
  customerName: string,
  items: { bowl_name: string; quantity: number; price: number }[],
  total: number
): string {
  const lines = items.map(
    (i) => `• ${i.bowl_name} x${i.quantity} — ₹${i.price * i.quantity}`
  );
  return [
    `Hi Nutravoe! I'd like to place an order:`,
    ``,
    `Name: ${customerName}`,
    ``,
    ...lines,
    ``,
    `Total: ₹${total}`,
    ``,
    `Please confirm availability and delivery time. Thank you!`,
  ].join("\n");
}

export function buildCartOrderWhatsAppMessage(input: {
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  deliveryAddress?: string;
  lat?: number;
  lng?: number;
  deliverySlot: string;
  items: {
    bowlName: string;
    quantity: number;
    basePrice: number;
    customizationCost: number;
    baseChoice: "yogurt" | "milk";
    oatsChoice: "soaked" | "roasted";
    noSugar: boolean;
    removedIngredients: string[];
    extraIngredients: string[];
  }[];
  subtotal: number;
  subscriberDiscount: number;
  deliveryFee: number;
  deliveryBreakdown?: { totalCostRs: number; nutravoeCoverageRs: number } | null;
  grandTotal: number;
  orderRef?: string;
  notes?: string;
}): string {
  const itemLines = input.items.flatMap((item, index) => {
    const lines = [
      `${index + 1}. ${item.bowlName} x${item.quantity}`,
      `   Base: ₹${item.basePrice} each`,
      `   Bowl base: ${item.baseChoice === "milk" ? "Milk" : "Yogurt"}`,
      `   Oats: ${item.oatsChoice === "roasted" ? "Roasted" : "Soaked"}`,
      item.noSugar
        ? "   No sugar: exclude banana, honey, dates"
        : "   Sweetness: natural (banana, honey, dates)",
    ];
    if (item.removedIngredients.length > 0) {
      lines.push(`   Remove: ${item.removedIngredients.join(", ")}`);
    }
    if (item.extraIngredients.length > 0) {
      lines.push(`   Extra: ${item.extraIngredients.join(", ")}`);
    }
    if (item.customizationCost > 0) {
      lines.push(`   Customization add-on: ₹${item.customizationCost}`);
    }
    const lineTotal = (item.basePrice * item.quantity) + item.customizationCost;
    lines.push(`   Line total: ₹${lineTotal}`);
    return lines;
  });

  const totals = [
    `Subtotal: ₹${input.subtotal}`,
    input.subscriberDiscount > 0 ? `Subscriber discount: -₹${input.subscriberDiscount}` : null,
    input.deliveryFee === 0
      ? `Delivery: Free`
      : input.deliveryBreakdown
        ? `Delivery: ₹${input.deliveryFee} (total ₹${input.deliveryBreakdown.totalCostRs}, Nutravoe covers ₹${input.deliveryBreakdown.nutravoeCoverageRs})`
        : `Delivery fee: ₹${input.deliveryFee}`,
    `Grand total: ₹${input.grandTotal}`,
  ].filter(Boolean);

  return [
    "Hi Nutravoe! New bowl order request",
    "",
    `Name: ${input.customerName}`,
    `Phone: ${input.customerPhone || "NA"}`,
    `Email: ${input.customerEmail || "NA"}`,
    `Address: ${input.deliveryAddress || "NA"}`,
    typeof input.lat === "number" && typeof input.lng === "number" && Number.isFinite(input.lat) && Number.isFinite(input.lng)
      ? `Location: https://www.google.com/maps/search/?api=1&query=${input.lat},${input.lng}`
      : null,
    `Delivery slot: ${input.deliverySlot}`,
    "",
    "Order details:",
    ...itemLines,
    "",
    "Charges:",
    ...totals,
    "",
    input.orderRef ? `Order Ref: #NV-${input.orderRef}` : "",
    input.notes ? `Customer notes: ${input.notes}` : null,
    "Please confirm this order on WhatsApp. Thank you!",
  ].filter(line => line !== undefined && line !== null).join("\n");
}

export function buildSubscriptionWhatsAppMessage(input: {
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  planName: string;
  weeklyPrice: number;
  customisationSurcharge?: number;
  weeklyDeliveryFeeRs?: number;
  deliveryAddress: string;
  lat?: number;
  lng?: number;
  deliveryStyle: string;
  deliveryTimeSlot?: string;
  configurationLines: string[];
  subscriptionRef?: string;
  notes?: string;
}): string {
  return [
    "Hi Nutravoe! New subscription request",
    "",
    `Name: ${input.customerName}`,
    `Phone: ${input.customerPhone || "NA"}`,
    `Email: ${input.customerEmail || "NA"}`,
    `Plan: ${input.planName}`,
    input.customisationSurcharge && input.customisationSurcharge > 0
      ? `Base Price: ₹${(input.weeklyPrice - input.customisationSurcharge - (input.weeklyDeliveryFeeRs ?? 0)).toLocaleString('en-IN')}/week`
      : null,
    input.customisationSurcharge && input.customisationSurcharge > 0
      ? `Customisation Surcharge: +₹${input.customisationSurcharge.toLocaleString('en-IN')}/week`
      : null,
    input.weeklyDeliveryFeeRs && input.weeklyDeliveryFeeRs > 0
      ? `Delivery: ₹${input.weeklyDeliveryFeeRs.toLocaleString('en-IN')}/week (total ₹${(input.weeklyDeliveryFeeRs * 2).toLocaleString('en-IN')}, Nutravoe covers ₹${input.weeklyDeliveryFeeRs.toLocaleString('en-IN')})`
      : null,
    `Total Weekly Price: ₹${input.weeklyPrice.toLocaleString('en-IN')}/week`,
    `Delivery style: ${input.deliveryStyle}`,
    `Delivery slot: ${input.deliveryTimeSlot || "NA"}`,
    `Address: ${input.deliveryAddress || "NA"}`,
    typeof input.lat === "number" && typeof input.lng === "number" && Number.isFinite(input.lat) && Number.isFinite(input.lng)
      ? `Location: https://www.google.com/maps/search/?api=1&query=${input.lat},${input.lng}`
      : null,
    "",
    "Subscription configuration:",
    ...input.configurationLines,
    "",
    input.subscriptionRef ? `Subscription Ref: #NV-SUB-${input.subscriptionRef}` : "",
    input.notes ? `Customer notes: ${input.notes}` : null,
    "Please confirm and activate this subscription on WhatsApp. Thank you!",
  ].filter(line => line !== undefined && line !== null).join("\n");
}

export function generateReceiptId(): string {
  return `rcpt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function buildTopupWhatsAppMessage(input: {
  subscriptionId: string;
  planName: string;
  amount: number;
  expiryDate: string;
  publicRef: string;
}): string {
  const ref = input.subscriptionId.slice(0, 8).toUpperCase();
  return [
    `*💰 WALLET TOP-UP REQUEST*`,
    ``,
    `Hi Nutravoe,`,
    `I'd like to top up my subscription wallet for my *${input.planName}* plan.`,
    ``,
    `🔹 *Request Ref:* ${input.publicRef}`,
    `🔹 *Subscription Ref:* #NV-SUB-${ref}`,
    `🔹 *Top-up Amount:* ₹${input.amount}`,
    `🔹 *Validity:* This amount will expire on ${input.expiryDate}`,
    ``,
    `Please share the payment details. Thank you!`,
  ].join("\n");
}
