import type { SupabaseClient, User } from "@supabase/supabase-js";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientAuthLockError(error: unknown): boolean {
  if (!error) return false;
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  return (
    lower.includes("lock") ||
    lower.includes("stole it") ||
    lower.includes("navigatorlock") ||
    lower.includes("signal is aborted")
  );
}

export async function getUserWithRetry(
  supabase: SupabaseClient,
  retries = 2,
): Promise<User | null> {
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const { data, error } = await supabase.auth.getUser();
      if (!error) return data.user ?? null;
      if (!isTransientAuthLockError(error) || attempt === retries) break;
    } catch (err) {
      if (!isTransientAuthLockError(err) || attempt === retries) break;
    }
    await sleep(60 + attempt * 80);
  }

  // Fallback to local session read if lock collisions persist.
  const { data: sessionData } = await supabase.auth.getSession();
  return sessionData.session?.user ?? null;
}

