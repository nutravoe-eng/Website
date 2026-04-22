import { adminSupabase } from "@/lib/supabase/admin";
import { DEFAULT_DELIVERY_POLICY, type DeliveryPolicy } from "@/lib/delivery-policy";

type DeliveryPolicyRow = {
  asap_enabled: boolean | null;
  blackout_start: string | null;
  blackout_end: string | null;
  disabled_slot_keys: string[] | null;
  blackout_exempt_slot_keys: string[] | null;
};

export async function getDeliveryPolicy(): Promise<DeliveryPolicy> {
  const { data, error } = await adminSupabase
    .from("delivery_policy")
    .select("asap_enabled, blackout_start, blackout_end, disabled_slot_keys, blackout_exempt_slot_keys")
    .eq("id", 1)
    .maybeSingle<DeliveryPolicyRow>();

  if (error || !data) return DEFAULT_DELIVERY_POLICY;

  return {
    asapEnabled: data.asap_enabled ?? DEFAULT_DELIVERY_POLICY.asapEnabled,
    blackoutStartIso: data.blackout_start ?? null,
    blackoutEndIso: data.blackout_end ?? null,
    disabledSlotKeys: Array.isArray(data.disabled_slot_keys) ? data.disabled_slot_keys : [],
    blackoutExemptSlotKeys: Array.isArray(data.blackout_exempt_slot_keys) ? data.blackout_exempt_slot_keys : [],
  };
}

export async function saveDeliveryPolicy(policy: DeliveryPolicy): Promise<void> {
  const { error } = await adminSupabase.from("delivery_policy").upsert(
    {
      id: 1,
      asap_enabled: policy.asapEnabled,
      blackout_start: policy.blackoutStartIso,
      blackout_end: policy.blackoutEndIso,
      disabled_slot_keys: policy.disabledSlotKeys,
      blackout_exempt_slot_keys: policy.blackoutExemptSlotKeys,
    },
    { onConflict: "id" },
  );
  if (error) {
    throw new Error(error.message);
  }
}
