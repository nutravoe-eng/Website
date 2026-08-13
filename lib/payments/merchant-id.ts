export type PaymentKind = "order" | "subscription";

export function toMerchantOrderId(kind: PaymentKind, resourceId: string) {
  return `${kind === "order" ? "ord" : "sub"}_${resourceId}`;
}

export function parseMerchantOrderId(merchantOrderId: string): { kind: PaymentKind; id: string } | null {
  if (merchantOrderId.startsWith("ord_")) {
    return { kind: "order", id: merchantOrderId.slice(4) };
  }
  if (merchantOrderId.startsWith("sub_")) {
    return { kind: "subscription", id: merchantOrderId.slice(4) };
  }
  return null;
}
