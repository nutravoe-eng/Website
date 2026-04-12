import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/admin-auth";
import { adminSupabase } from "@/lib/supabase/admin";

const STATUSES = new Set(["pending", "approved", "rejected", "cancelled", "all"]);

export async function GET(req: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") ?? "pending";
  if (!STATUSES.has(status)) {
    return NextResponse.json({ error: "Invalid status filter" }, { status: 422 });
  }

  let query = adminSupabase
    .from("wallet_topup_requests")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);

  if (status !== "all") {
    query = query.eq("status", status);
  }

  const { data: rows, error } = await query;
  if (error) {
    console.error("[admin wallet-topups]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const requests = rows ?? [];
  const userIds = Array.from(new Set(requests.map((r) => r.user_id)));
  const subIds = Array.from(new Set(requests.map((r) => r.subscription_id)));

  const [{ data: users }, { data: subs }] = await Promise.all([
    userIds.length
      ? adminSupabase.from("users").select("id, full_name, phone, email").in("id", userIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string; phone: string; email: string }[] }),
    subIds.length
      ? adminSupabase.from("subscriptions").select("id, period_end_date, plan_id").in("id", subIds)
      : Promise.resolve({ data: [] as { id: string; period_end_date: string | null; plan_id: string | null }[] }),
  ]);

  const planIds = Array.from(new Set((subs ?? []).map((s) => s.plan_id).filter(Boolean))) as string[];
  const { data: plans } = planIds.length
    ? await adminSupabase.from("subscription_plans").select("id, name, slug").in("id", planIds)
    : { data: [] as { id: string; name: string; slug: string }[] };

  const planMap = new Map((plans ?? []).map((p) => [p.id, p]));
  const userMap = new Map((users ?? []).map((u) => [u.id, u]));
  const subMap = new Map(
    (subs ?? []).map((s) => [
      s.id,
      {
        ...s,
        subscription_plans: s.plan_id ? planMap.get(s.plan_id) ?? null : null,
      },
    ]),
  );

  const enriched = requests.map((r) => ({
    ...r,
    users: userMap.get(r.user_id) ?? null,
    subscriptions: subMap.get(r.subscription_id) ?? null,
  }));

  return NextResponse.json({ requests: enriched });
}
