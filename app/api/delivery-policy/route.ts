import { NextResponse } from "next/server";
import { getDeliveryPolicy } from "@/lib/delivery-policy-server";
import { generateScheduledSlots, getAsapSlot, getNowIst } from "@/lib/delivery-policy";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const policy = await getDeliveryPolicy();
  const nowIst = getNowIst();
  const asapSlot = getAsapSlot(policy, nowIst);
  const scheduledSlots = generateScheduledSlots(policy, nowIst);

  return NextResponse.json(
    {
      policy,
      availability: {
        asapAvailable: Boolean(asapSlot),
        asapSlotLabel: asapSlot?.label ?? null,
        scheduledSlots,
      },
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
