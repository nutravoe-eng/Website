import { createClient } from '@supabase/supabase-js';

/**
 * Service-role client — use only in server-side code (API routes, server actions).
 * Never import this in client components.
 */
export const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);
