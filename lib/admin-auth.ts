import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { adminSupabase } from '@/lib/supabase/admin';

/**
 * Call this at the top of every admin API route.
 * Returns the userId if the caller is an authenticated admin, null otherwise.
 */
export async function verifyAdmin(): Promise<{ userId: string } | null> {
  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll() {},
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await adminSupabase
    .from('users')
    .select('is_admin')
    .eq('id', user.id)
    .single();

  if (!profile?.is_admin) return null;
  return { userId: user.id };
}
