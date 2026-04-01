import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { adminSupabase } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  // Verify the caller is authenticated via their session cookie
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll() {},
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  // Fetch their profile so we can record it before deletion
  const { data: profile } = await adminSupabase
    .from("users")
    .select("full_name, phone")
    .eq("id", user.id)
    .single();

  // Record in churned_users BEFORE deleting auth record
  const { error: churnError } = await adminSupabase
    .from("churned_users")
    .insert({
      original_user_id: user.id,
      email: user.email!,
      phone: profile?.phone ?? null,
      full_name: profile?.full_name ?? null,
    });

  if (churnError) {
    console.error("Failed to record churned user:", churnError);
    return NextResponse.json({ error: "Failed to process deletion." }, { status: 500 });
  }

  // Delete the auth.users record — this cascades to public.users and all child rows.
  // After this the user CANNOT log in again with these credentials.
  const { error: deleteError } = await adminSupabase.auth.admin.deleteUser(user.id);
  if (deleteError) {
    // Roll back the churn record to avoid a ghost entry
    await adminSupabase.from("churned_users").delete().eq("original_user_id", user.id);
    console.error("Failed to delete auth user:", deleteError);
    return NextResponse.json({ error: "Failed to delete account." }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
