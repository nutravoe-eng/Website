import type { Bowl, BowlPresetOptions, IngredientCustomization } from "@/types";
import type { CheckoutLineItem } from "@/lib/checkout-security";
import { sendBrevoEmail } from "@/lib/brevo";

const OPERATIONS_EMAIL = "nutravoe@gmail.com";

type CustomerProfile = {
  name: string;
  phone: string;
  email?: string | null;
};

type AddressProfile = {
  line1?: string | null;
  line2?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  lat?: number | null;
  lng?: number | null;
};

type OrderNotificationInput = {
  requestId: string;
  createdAt: string;
  customer: CustomerProfile;
  address: AddressProfile;
  orderLabel: string;
  deliveryDate: string;
  deliveryTimeSlot: string;
  subtotal: number;
  deliveryFee: number;
  total: number;
  items: CheckoutLineItem[];
  notes?: string | null;
};

type SubscriptionDayConfigInput = {
  day: string;
  bowlId: string;
  quantity: number;
  customizations?: IngredientCustomization[] | IngredientCustomization[][];
  deliveryTimeSlot?: string;
};

type SubscriptionNotificationInput = {
  requestId: string;
  createdAt: string;
  customer: CustomerProfile;
  address: AddressProfile;
  planName: string;
  deliveryStyle: string;
  startDate: string;
  defaultDeliveryTimeSlot?: string | null;
  totalAmountRs: number;
  bowlsPerCycle: number;
  billingCycle: string;
  weeklyDeliveryFeeRs: number;
  totalIngredientExtrasRs: number;
  dayConfigs: SubscriptionDayConfigInput[];
  bowls: Bowl[];
  notes?: string | null;
};

function getTemplateId(envName: string): number | null {
  const raw = process.env[envName];
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function formatMoney(amount: number): string {
  return `Rs ${amount.toLocaleString("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

function formatAddress(address: AddressProfile): string {
  return [
    address.line1?.trim(),
    address.line2?.trim(),
    address.city?.trim(),
    address.state?.trim(),
    address.pincode?.trim(),
  ]
    .filter((value): value is string => Boolean(value))
    .join(", ");
}

function buildMapUrl(address: AddressProfile): string {
  if (
    typeof address.lat === "number" &&
    Number.isFinite(address.lat) &&
    typeof address.lng === "number" &&
    Number.isFinite(address.lng)
  ) {
    return `https://www.google.com/maps/search/?api=1&query=${address.lat},${address.lng}`;
  }
  return "NA";
}

function formatDateTime(isoString: string): string {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return isoString;
  return date.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function summarizeOrderCustomizations(customizations: CheckoutLineItem["customizations"]): string[] {
  if (!customizations) return [];
  const lines: string[] = [];
  if (customizations.baseChoice) {
    lines.push(`Base: ${customizations.baseChoice === "milk" ? "Milk" : "Yogurt"}`);
  }
  if (customizations.oatsChoice) {
    lines.push(`Oats: ${customizations.oatsChoice === "roasted" ? "Roasted" : "Soaked"}`);
  }
  if (typeof customizations.noSugar === "boolean") {
    lines.push(
      customizations.noSugar
        ? "Sweetness: No sugar (exclude banana, honey, dates)"
        : "Sweetness: Natural",
    );
  }
  if (customizations.removed?.length) {
    lines.push(`Remove: ${customizations.removed.join(", ")}`);
  }
  if (customizations.added?.length) {
    lines.push(`Extra: ${customizations.added.join(", ")}`);
  }
  return lines;
}

function buildOrderConfigurationDetails(items: CheckoutLineItem[]): string {
  return items
    .flatMap((item, index) => {
      const lines = [
        `${index + 1}. ${item.bowl_name} x${item.quantity}`,
        `   Unit price: ${formatMoney(item.unit_price)}`,
        `   Line total: ${formatMoney(item.total_price)}`,
      ];
      const customizations = summarizeOrderCustomizations(item.customizations);
      if (customizations.length > 0) {
        lines.push(...customizations.map((line) => `   ${line}`));
      }
      return lines;
    })
    .join("\n");
}

function parsePresetOptions(customizations: IngredientCustomization[] | undefined): BowlPresetOptions {
  const list = customizations ?? [];
  return {
    baseChoice: list.some((item) => item.ingredientId === "__preset_base_milk") ? "milk" : "yogurt",
    oatsChoice: list.some((item) => item.ingredientId === "__preset_oats_roasted") ? "roasted" : "soaked",
    noSugar: list.some((item) => item.ingredientId === "__preset_no_sugar"),
  };
}

function summarizeSubscriptionCustomizations(
  bowl: Bowl | undefined,
  customizations: IngredientCustomization[] | undefined,
): string[] {
  const preset = parsePresetOptions(customizations);
  const list = (customizations ?? []).filter((item) => !item.ingredientId.startsWith("__preset_"));
  const lines = [
    `Base: ${preset.baseChoice === "milk" ? "Milk" : "Yogurt"}`,
    `Oats: ${preset.oatsChoice === "roasted" ? "Roasted" : "Soaked"}`,
    preset.noSugar ? "Sweetness: No sugar (exclude banana, honey, dates)" : "Sweetness: Natural",
  ];
  if (bowl) {
    const removed = list
      .filter((item) => item.option === "remove")
      .map((item) => bowl.customizableIngredients?.find((ingredient) => ingredient.id === item.ingredientId)?.name)
      .filter((value): value is string => Boolean(value));
    const extras = list
      .filter((item) => item.option === "extra")
      .map((item) => bowl.customizableIngredients?.find((ingredient) => ingredient.id === item.ingredientId)?.name)
      .filter((value): value is string => Boolean(value));
    if (removed.length > 0) lines.push(`Remove: ${removed.join(", ")}`);
    if (extras.length > 0) lines.push(`Extra: ${extras.join(", ")}`);
  }
  return lines;
}

function normalizeCustomizationInstances(
  customizations: IngredientCustomization[] | IngredientCustomization[][] | undefined,
): IngredientCustomization[][] {
  if (!Array.isArray(customizations) || customizations.length === 0) return [[]];
  return Array.isArray(customizations[0])
    ? (customizations as IngredientCustomization[][])
    : [customizations as IngredientCustomization[]];
}

function buildSubscriptionConfigurationDetails(
  dayConfigs: SubscriptionDayConfigInput[],
  bowls: Bowl[],
  defaultDeliveryTimeSlot?: string | null,
): string {
  const bowlMap = new Map<string, Bowl>();
  for (const bowl of bowls) {
    bowlMap.set(bowl.slug, bowl);
    bowlMap.set(bowl._id, bowl);
    bowlMap.set(`bowl-${bowl.slug}`, bowl);
  }

  if (dayConfigs.length === 0) {
    return "Flexible plan with no preset day-wise bowl schedule.";
  }

  return dayConfigs
    .flatMap((config, index) => {
      const bowl = bowlMap.get(config.bowlId);
      const bowlName = bowl?.name ?? config.bowlId;
      const slot = config.deliveryTimeSlot || defaultDeliveryTimeSlot || "NA";
      const instances = normalizeCustomizationInstances(config.customizations);
      const header = `${index + 1}. ${config.day}: ${bowlName} x${config.quantity} | Slot: ${slot}`;
      const detailLines = instances.flatMap((instance, instanceIndex) => {
        const summary = summarizeSubscriptionCustomizations(bowl, instance);
        return summary.map((line, lineIndex) =>
          `${lineIndex === 0 ? `   Bowl ${instanceIndex + 1}: ` : "            "}${line}`,
        );
      });
      return [header, ...detailLines];
    })
    .join("\n");
}

function buildSubscriptionSummary(dayConfigs: SubscriptionDayConfigInput[], bowls: Bowl[], fallback: string): string {
  const bowlMap = new Map<string, string>();
  for (const bowl of bowls) {
    bowlMap.set(bowl.slug, bowl.name);
    bowlMap.set(bowl._id, bowl.name);
    bowlMap.set(`bowl-${bowl.slug}`, bowl.name);
  }

  if (dayConfigs.length === 0) return fallback;

  return dayConfigs
    .map((config) => `${config.day}: ${config.quantity}x ${bowlMap.get(config.bowlId) ?? config.bowlId}`)
    .join(", ");
}

export async function sendOrderRequestNotificationEmail(input: OrderNotificationInput): Promise<void> {
  const templateId = getTemplateId("BREVO_ORDER_REQUEST_TEMPLATE_ID");
  if (!templateId) {
    console.log("Skipping order request email: BREVO_ORDER_REQUEST_TEMPLATE_ID is not configured.");
    return;
  }

  const address = formatAddress(input.address) || "NA";
  const pinLocation = buildMapUrl(input.address);
  const configurationDetails = buildOrderConfigurationDetails(input.items);
  const orderSummary = input.items.map((item) => `${item.bowl_name} x${item.quantity}`).join(", ");

  const result = await sendBrevoEmail({
    toEmail: OPERATIONS_EMAIL,
    toName: "Nutravoe",
    templateId,
    params: {
      customer_name: input.customer.name,
      customer_phone: input.customer.phone,
      customer_email: input.customer.email ?? "NA",
      address,
      pincode: input.address.pincode ?? "NA",
      pin_location: pinLocation,
      request_type: input.orderLabel,
      request_id: input.requestId,
      request_created_at: formatDateTime(input.createdAt),
      delivery_date: input.deliveryDate,
      delivery_time: input.deliveryTimeSlot,
      subtotal_amount: formatMoney(input.subtotal),
      delivery_fee: formatMoney(input.deliveryFee),
      total_amount: formatMoney(input.total),
      order_summary: orderSummary || "NA",
      configuration_details: configurationDetails || "NA",
      customer_notes: input.notes || "NA",
    },
  });

  if (!result.success) {
    console.error("Order request email failed:", result.error);
  }
}

export async function sendSubscriptionRequestNotificationEmail(
  input: SubscriptionNotificationInput,
): Promise<void> {
  const templateId = getTemplateId("BREVO_SUBSCRIPTION_REQUEST_TEMPLATE_ID");
  if (!templateId) {
    console.log("Skipping subscription request email: BREVO_SUBSCRIPTION_REQUEST_TEMPLATE_ID is not configured.");
    return;
  }

  const address = formatAddress(input.address) || "NA";
  const pinLocation = buildMapUrl(input.address);
  const configurationDetails = buildSubscriptionConfigurationDetails(
    input.dayConfigs,
    input.bowls,
    input.defaultDeliveryTimeSlot,
  );
  const summary = buildSubscriptionSummary(
    input.dayConfigs,
    input.bowls,
    `${input.planName} ${input.deliveryStyle} plan`,
  );

  const result = await sendBrevoEmail({
    toEmail: OPERATIONS_EMAIL,
    toName: "Nutravoe",
    templateId,
    params: {
      customer_name: input.customer.name,
      customer_phone: input.customer.phone,
      customer_email: input.customer.email ?? "NA",
      address,
      pincode: input.address.pincode ?? "NA",
      pin_location: pinLocation,
      request_type: "Subscription request",
      request_id: input.requestId,
      request_created_at: formatDateTime(input.createdAt),
      subscription_plan: input.planName,
      subscription_style: input.deliveryStyle,
      start_date: input.startDate,
      delivery_time: input.defaultDeliveryTimeSlot || "NA",
      billing_cycle: input.billingCycle,
      bowls_per_cycle: String(input.bowlsPerCycle),
      weekly_delivery_fee: formatMoney(input.weeklyDeliveryFeeRs),
      ingredient_extras: formatMoney(input.totalIngredientExtrasRs),
      total_amount: formatMoney(input.totalAmountRs),
      request_summary: summary,
      configuration_details: configurationDetails,
      customer_notes: input.notes || "NA",
    },
  });

  if (!result.success) {
    console.error("Subscription request email failed:", result.error);
  }
}
