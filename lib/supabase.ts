let supabaseClient: ReturnType<typeof import("@supabase/supabase-js").createClient> | null = null;

export async function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) return null;
  if (supabaseClient) return supabaseClient;

  const { createClient } = await import("@supabase/supabase-js");
  supabaseClient = createClient(url, key);
  return supabaseClient;
}
