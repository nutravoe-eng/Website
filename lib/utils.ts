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

export function generateReceiptId(): string {
  return `rcpt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
