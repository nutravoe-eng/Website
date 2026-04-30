export function formatCurrency(amount: number): string {
  return `\u20B9 ${amount.toLocaleString("en-IN")}`;
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
    `*WALLET TOP-UP REQUEST*`,
    ``,
    `Hi Nutravoe,`,
    `I'd like to top up my subscription wallet for my *${input.planName}* plan.`,
    ``,
    `*Request Ref:* ${input.publicRef}`,
    `*Subscription Ref:* #NV-SUB-${ref}`,
    `*Top-up Amount:* \u20B9${input.amount}`,
    `*Validity:* This amount will expire on ${input.expiryDate}`,
    ``,
    `Please share the payment details. Thank you!`,
  ].join("\n");
}
