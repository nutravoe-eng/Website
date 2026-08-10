import { createHmac } from "crypto";
import { adminSupabase } from "@/lib/supabase/admin";

const VIRTUAL_EMAIL_DOMAIN = "auth.nutravoe.in";

export function phoneToVirtualEmail(phone10: string): string {
  const secret = process.env.MESSAGECENTRAL_EMAIL_SECRET;
  if (!secret) throw new Error("Missing required env var: MESSAGECENTRAL_EMAIL_SECRET");
  const hash = createHmac("sha256", secret).update(phone10).digest("hex").slice(0, 24);
  return `ph_${hash}@${VIRTUAL_EMAIL_DOMAIN}`;
}

export function isVirtualEmail(email: string | null | undefined): boolean {
  return !!email && email.toLowerCase().endsWith(`@${VIRTUAL_EMAIL_DOMAIN}`);
}

export function phoneLookupValues(phone10: string): string[] {
  const e164 = `91${phone10}`;
  return [phone10, e164, `+${e164}`, `+91${phone10}`];
}

export type CandidateAccount = {
  userId: string;
  email: string;
  fullName: string | null;
  createdAt: string | null;
  orderCount: number;
  isVirtual: boolean;
};

/** All public.users rows that claim this phone (or the deterministic virtual email). */
export async function findAccountsForPhone(phone10: string): Promise<CandidateAccount[]> {
  const virtualEmail = phoneToVirtualEmail(phone10);
  const byId = new Map<string, { id: string; email: string; full_name: string | null; created_at: string | null }>();

  const { data: byPhone } = await adminSupabase
    .from("users")
    .select("id, email, full_name, created_at")
    .in("phone", phoneLookupValues(phone10));

  for (const row of byPhone ?? []) {
    byId.set(row.id, row);
  }

  const { data: byVirtual } = await adminSupabase
    .from("users")
    .select("id, email, full_name, created_at")
    .eq("email", virtualEmail)
    .maybeSingle();

  if (byVirtual) {
    byId.set(byVirtual.id, byVirtual);
  }

  const candidates: CandidateAccount[] = [];

  for (const row of Array.from(byId.values())) {
    const { data: authResult } = await adminSupabase.auth.admin.getUserById(row.id);
    const authUser = authResult?.user;
    if (!authUser) continue;

    const email = authUser.email || row.email;
    if (!email) continue;

    const { count } = await adminSupabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("user_id", row.id);

    candidates.push({
      userId: row.id,
      email,
      fullName: row.full_name,
      createdAt: row.created_at,
      orderCount: count ?? 0,
      isVirtual: isVirtualEmail(email),
    });
  }

  return candidates;
}

/**
 * Survivor policy (login OTP / auto-merge):
 * 1. Prefer real-email accounts over virtual phone-only accounts
 * 2. Prefer more orders
 * 3. Prefer older created_at
 */
export function pickPrimaryAccount(candidates: CandidateAccount[]): CandidateAccount {
  if (candidates.length === 0) {
    throw new Error("No candidates to pick primary from");
  }

  return [...candidates].sort((a, b) => {
    if (a.isVirtual !== b.isVirtual) return a.isVirtual ? 1 : -1;
    if (a.orderCount !== b.orderCount) return b.orderCount - a.orderCount;
    const aTime = a.createdAt ? Date.parse(a.createdAt) : Number.POSITIVE_INFINITY;
    const bTime = b.createdAt ? Date.parse(b.createdAt) : Number.POSITIVE_INFINITY;
    return aTime - bTime;
  })[0];
}

export type MergeResult = {
  primary: CandidateAccount;
  mergedSecondaryIds: string[];
};

/**
 * Merge every other candidate into the primary survivor, then delete secondaries.
 * Safe to call with a single candidate (no-op merge).
 */
export async function mergePhoneAccountsIntoPrimary(
  candidates: CandidateAccount[],
  phone10: string
): Promise<MergeResult> {
  if (candidates.length === 0) {
    throw new Error("No accounts to merge");
  }

  const primary = pickPrimaryAccount(candidates);
  const secondaries = candidates.filter((c) => c.userId !== primary.userId);
  const mergedSecondaryIds: string[] = [];

  for (const secondary of secondaries) {
    const { error: rpcError } = await adminSupabase.rpc("merge_accounts", {
      p_primary_user_id: primary.userId,
      p_secondary_user_id: secondary.userId,
    });

    if (rpcError) {
      console.error("[account-merge] merge_accounts RPC failed:", rpcError);
      throw new Error(
        rpcError.message?.includes("function public.merge_accounts") ||
          rpcError.message?.includes("Could not find the function")
          ? "Account merge is not set up yet. Run migration 038_account_merge.sql in Supabase."
          : "Could not merge duplicate accounts for this phone number."
      );
    }

    // Delete secondary via Auth Admin so GoTrue state stays consistent.
    // Phone unique constraint is freed by merge_accounts clearing secondary phone/email.
    const { error: deleteError } = await adminSupabase.auth.admin.deleteUser(secondary.userId);
    if (deleteError) {
      console.error("[account-merge] deleteUser failed after merge:", deleteError);
      throw new Error("Accounts were partially merged. Please contact support.");
    }

    mergedSecondaryIds.push(secondary.userId);
  }

  // Ensure survivor owns the verified phone
  await adminSupabase.from("users").update({ phone: phone10 }).eq("id", primary.userId);
  const { error: phoneError } = await adminSupabase.auth.admin.updateUserById(primary.userId, {
    phone: `91${phone10}`,
    phone_confirm: true,
  });
  if (phoneError) {
    console.warn("[account-merge] could not attach phone to primary:", phoneError.message);
  }

  return { primary, mergedSecondaryIds };
}
