declare module "@cashfreepayments/cashfree-js" {
  type CashfreeMode = "sandbox" | "production";
  type CheckoutResult = {
    error?: unknown;
    redirect?: boolean;
    paymentDetails?: unknown;
  };
  type Cashfree = {
    checkout(options: {
      paymentSessionId: string;
      redirectTarget: "_modal";
    }): Promise<CheckoutResult>;
  };
  export function load(options: { mode: CashfreeMode }): Promise<Cashfree | null>;
}
