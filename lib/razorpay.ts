import { OrderItem } from "@/types";

export async function createRazorpayOrder(
  totalAmountInPaise: number,
  receiptId: string
): Promise<{ id: string; amount: number; currency: string } | null> {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) return null;

  const Razorpay = (await import("razorpay")).default;
  const instance = new Razorpay({ key_id: keyId, key_secret: keySecret });

  const order = await instance.orders.create({
    amount: totalAmountInPaise,
    currency: "INR",
    receipt: receiptId,
  });

  return {
    id: order.id as string,
    amount: order.amount as number,
    currency: order.currency as string,
  };
}
