import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/admin-auth";
import { getDeliveryPolicy, saveDeliveryPolicy } from "@/lib/delivery-policy-server";
import {
  DEFAULT_DELIVERY_POLICY,
  type DeliveryPolicy,
  generateScheduledSlots,
  generateScheduledSlotsWithOptions,
  getNowIst,
} from "@/lib/delivery-policy";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function normalizeDisabledSlotKeys(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter((value) => /^\d{4}-\d{2}-\d{2}\|\d{2}$/.test(value));
}

function normalizeIncomingPolicy(input: unknown): DeliveryPolicy {
  const body = (input ?? {}) as Record<string, unknown>;
  const asapEnabled = typeof body.asapEnabled === "boolean" ? body.asapEnabled : DEFAULT_DELIVERY_POLICY.asapEnabled;
  const blackoutStartIso =
    typeof body.blackoutStartIso === "string" && body.blackoutStartIso.trim().length > 0
      ? body.blackoutStartIso
      : null;
  const blackoutEndIso =
    typeof body.blackoutEndIso === "string" && body.blackoutEndIso.trim().length > 0
      ? body.blackoutEndIso
      : null;
  if ((blackoutStartIso && !blackoutEndIso) || (!blackoutStartIso && blackoutEndIso)) {
    throw new Error("Both blackout start and end must be set together.");
  }
  if (blackoutStartIso && blackoutEndIso && new Date(blackoutStartIso).getTime() >= new Date(blackoutEndIso).getTime()) {
    throw new Error("Blackout start must be before blackout end.");
  }

  return {
    asapEnabled,
    blackoutStartIso,
    blackoutEndIso,
    disabledSlotKeys: normalizeDisabledSlotKeys(body.disabledSlotKeys),
    blackoutExemptSlotKeys: normalizeDisabledSlotKeys(body.blackoutExemptSlotKeys),
  };
}

export async function GET() {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const policy = await getDeliveryPolicy();
  const nowIst = getNowIst();
  const slots = generateScheduledSlots(policy, nowIst);
  const allCandidateSlots = generateScheduledSlotsWithOptions(policy, nowIst, {
    ignoreBlackout: true,
    ignoreDisabled: true,
  });
  return NextResponse.json({ policy, slots, allCandidateSlots });
}

export async function PATCH(req: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const body = await req.json().catch(() => null);
    const policy = normalizeIncomingPolicy(body);
    await saveDeliveryPolicy(policy);
    return NextResponse.json({ ok: true, policy });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
