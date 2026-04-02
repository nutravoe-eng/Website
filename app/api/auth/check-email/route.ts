import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase } from '@/lib/supabase/admin';
import { enforceRateLimit } from '@/lib/rate-limit';

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'auth-check-email', 5, 60);
  if (!limited.ok) return limited.response;

  const { email } = await req.json();
  if (!email || typeof email !== 'string') {
    return NextResponse.json({ error: 'Email required' }, { status: 400, headers: limited.headers });
  }

  const normalised = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalised)) {
    return NextResponse.json({ error: 'Invalid email' }, { status: 400, headers: limited.headers });
  }

  const { data, error } = await adminSupabase
    .from('users')
    .select('id')
    .eq('email', normalised)
    .limit(1);
  if (error) {
    return NextResponse.json({ error: 'Unable to check account' }, { status: 500, headers: limited.headers });
  }

  return NextResponse.json({ exists: Boolean(data?.length) }, { headers: limited.headers });
}
