import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getSupabaseClient } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = await req.json();

    const secret = process.env.RAZORPAY_KEY_SECRET;
    if (!secret) {
      console.warn("RAZORPAY_KEY_SECRET is missing. Bypassing verification in dev.");
      return NextResponse.json({ success: true, message: "Bypassed (dev mode)" });
    }

    // Standard Razorpay HMAC SHA256 signature verification equation
    const generatedSignature = crypto
      .createHmac("sha256", secret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (generatedSignature !== razorpay_signature) {
      return NextResponse.json({ error: "Invalid payment signature" }, { status: 400 });
    }

    // Signature is legit. Mark order as "paid" in Supabase to authorize fulfillment.
    const supabase = await getSupabaseClient();
    if (supabase) {
      const { error } = await supabase
        .from("orders")
        .update({ status: "paid", razorpay_payment_id })
        .eq("razorpay_order_id", razorpay_order_id);
        
      if (error) {
        console.error("Failed to update order status in Supabase:", error);
      }
    }

    return NextResponse.json({ success: true, message: "Payment verified successfully" });
  } catch (err: any) {
    console.error("Razorpay verification error:", err);
    return NextResponse.json({ error: err.message || "Server error" }, { status: 500 });
  }
}
