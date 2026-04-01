import { NextRequest, NextResponse } from "next/server";
import { adminSupabase } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  const { phone } = await req.json();
  if (!phone) return NextResponse.json({ churned: false });

  const { data } = await adminSupabase
    .from("churned_users")
    .select("id")
    .eq("phone", phone.trim())
    .maybeSingle();

  return NextResponse.json({ churned: !!data });
}
