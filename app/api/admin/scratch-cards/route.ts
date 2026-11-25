import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/admin-auth";
import { adminSupabase } from "@/lib/supabase/admin";
import {
  drawScratchAmount,
  newScratchCode,
  normalizeIndianMobile,
  scratchCardUrl,
  whatsappLinkForCard,
} from "@/lib/scratch-cards";

type CardRow = { code: string; customer_phone: string; customer_name: string | null };
const withLinks = <T extends CardRow>(c: T) => ({
  ...c,
  link: scratchCardUrl(c.code),
  whatsapp: whatsappLinkForCard(c.customer_phone, c.code, c.customer_name),
});

const FILTERS = new Set(["unpaid", "paid", "all"]);

export async function GET(req: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const filter = new URL(req.url).searchParams.get("filter") ?? "unpaid";
  if (!FILTERS.has(filter)) return NextResponse.json({ error: "Invalid filter" }, { status: 422 });

  let query = adminSupabase.from("scratch_cards").select("*").order("created_at", { ascending: false }).limit(300);
  if (filter === "unpaid") query = query.is("paid_at", null);
  if (filter === "paid") query = query.not("paid_at", "is", null);

  const { data, error } = await query;
  if (error) {
    console.error("[admin scratch-cards]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ cards: (data ?? []).map(withLinks) });
}

export async function POST(req: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const phone = normalizeIndianMobile(typeof body?.phone === "string" ? body.phone : "");
  if (!phone) return NextResponse.json({ error: "Enter a 10-digit Indian mobile number" }, { status: 422 });
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 80) || null : null;
  const note = typeof body?.note === "string" ? body.note.trim().slice(0, 300) || null : null;
  const allowRepeat = body?.allow_repeat === true;

  // One card per number unless staff confirm a repeat.
  const { data: existing } = await adminSupabase
    .from("scratch_cards")
    .select("id, code, amount_rs, created_at, scratched_at, paid_at, customer_name, customer_phone")
    .eq("customer_phone", phone)
    .order("created_at", { ascending: false })
    .limit(5);
  if (existing && existing.length && !allowRepeat) {
    return NextResponse.json({ error: "already_has_card", existing: existing.map(withLinks) }, { status: 409 });
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error } = await adminSupabase
      .from("scratch_cards")
      .insert({
        code: newScratchCode(),
        customer_phone: phone,
        customer_name: name,
        note,
        amount_rs: drawScratchAmount(),
        created_by: admin.userId,
      })
      .select("*")
      .single();
    if (!error && data) return NextResponse.json({ card: withLinks(data) });
    if (error && error.code !== "23505") {
      console.error("[admin scratch-cards create]", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }
  return NextResponse.json({ error: "Could not create a card, try again" }, { status: 500 });
}
