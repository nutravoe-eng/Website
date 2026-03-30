import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/lib/supabase";
import { createRazorpayOrder } from "@/lib/razorpay";
import { generateReceiptId } from "@/lib/utils";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { customer, items, total_amount_paise } = body;

    if (!customer || !items || !total_amount_paise) {
      return NextResponse.json(
        { error: "Missing required fields." },
        { status: 400 }
      );
    }

    // Create Razorpay order (if configured)
    const receiptId = generateReceiptId();
    const razorpayOrder = await createRazorpayOrder(total_amount_paise, receiptId);

    // Write to Supabase (if configured)
    const supabase = await getSupabaseClient();
    if (supabase) {
      const { error } = await supabase.from("orders").insert([{
        customer_name: customer.name,
        customer_phone: customer.phone,
        delivery_address: customer.address,
        items,
        total_amount: total_amount_paise,
        razorpay_order_id: razorpayOrder?.id ?? null,
        status: "pending",
      }] as any);

      if (error) {
        console.error("Supabase insert error:", error);
      }
    }

    return NextResponse.json({
      success: true,
      razorpay_order_id: razorpayOrder?.id ?? null,
    });
  } catch (err) {
    console.error("Order API error:", err);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 }
    );
  }
}
