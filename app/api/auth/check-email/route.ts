import { NextRequest, NextResponse } from "next/server";
import { adminSupabase } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  const { email } = await req.json();
  if (!email) return NextResponse.json({ error: "Email required" }, { status: 400 });

  const normalised = email.trim().toLowerCase();

  // Check if a live account exists
  const { data: users, error } = await adminSupabase.auth.admin.listUsers();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const exists = users.users.some(
    (u) => u.email?.toLowerCase() === normalised
  );

  if (exists) return NextResponse.json({ exists: true, churned: false });

  // Check if this email belongs to a previously deleted account
  const { data: churnRow } = await adminSupabase
    .from("churned_users")
    .select("id")
    .eq("email", normalised)
    .maybeSingle();

  return NextResponse.json({ exists: false, churned: !!churnRow });
}
