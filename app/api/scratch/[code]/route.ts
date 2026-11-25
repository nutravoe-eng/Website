import { NextRequest, NextResponse } from "next/server";
import { adminSupabase } from "@/lib/supabase/admin";
import { isScratchCode } from "@/lib/scratch-cards";

/** Called by the scratch page once the customer has scratched the card. Records the first scratch only. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!isScratchCode(code)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: card } = await adminSupabase
    .from("scratch_cards")
    .select("id, amount_rs, scratched_at")
    .eq("code", code)
    .maybeSingle();
  if (!card) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!card.scratched_at) {
    await adminSupabase.from("scratch_cards").update({ scratched_at: new Date().toISOString() }).eq("id", card.id).is("scratched_at", null);
  }
  return NextResponse.json({ amount_rs: card.amount_rs });
}
