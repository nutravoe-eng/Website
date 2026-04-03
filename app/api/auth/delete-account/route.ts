import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { adminSupabase } from "@/lib/supabase/admin";
import { sendBrevoEmail } from "@/lib/brevo";

export async function POST(_req: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {},
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const { data: profile } = await adminSupabase
    .from("users")
    .select("full_name, phone, is_deleted")
    .eq("id", user.id)
    .single();

  if (profile?.is_deleted) {
    return NextResponse.json({ error: "Account is already deactivated." }, { status: 409 });
  }

  const { error: banError } = await adminSupabase.auth.admin.updateUserById(user.id, {
    ban_duration: "876000h",
  });

  if (banError) {
    console.error("Failed to deactivate auth user:", banError);
    return NextResponse.json({ error: `Auth Ban Error: ${banError.message}` }, { status: 500 });
  }

  const { error: softDeleteError } = await supabase.rpc("soft_delete_account", {
    p_user_id: user.id,
    p_email: user.email!,
    p_phone: profile?.phone ?? null,
    p_full_name: profile?.full_name ?? null,
  });

  if (softDeleteError) {
    await adminSupabase.auth.admin.updateUserById(user.id, { ban_duration: "none" });
    console.error("Failed to record soft deletion:", softDeleteError);
    return NextResponse.json({ error: `Database API Error: ${softDeleteError.message || JSON.stringify(softDeleteError)}` }, { status: 500 });
  }

  // Trigger account deletion confirmation email
  if (process.env.BREVO_ACCOUNT_DELETED_TEMPLATE_ID && user.email) {
    await sendBrevoEmail({
      toEmail: user.email,
      toName: profile?.full_name ? profile.full_name.split(' ')[0] : 'there',
      templateId: Number(process.env.BREVO_ACCOUNT_DELETED_TEMPLATE_ID),
      params: {
        user_name: profile?.full_name ? profile.full_name.split(' ')[0] : 'there'
      }
    });
  }

  return NextResponse.json({ success: true });
}
