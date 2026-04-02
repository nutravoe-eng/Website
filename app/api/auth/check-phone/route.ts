import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase } from '@/lib/supabase/admin';
import { enforceRateLimit } from '@/lib/rate-limit';

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'auth-check-phone', 5, 60);
  if (!limited.ok) return limited.response;

  const { phone } = await req.json();
  const normalised = typeof phone === 'string' ? phone.replace(/\D/g, '') : '';

  if (normalised.length < 10) {
    return NextResponse.json({ error: 'Valid phone required' }, { status: 400, headers: limited.headers });
  }

  const { data, error } = await adminSupabase
    .from('users')
    .select('id')
    .eq('phone', normalised)
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: 'Unable to check phone' }, { status: 500, headers: limited.headers });
  }

  return NextResponse.json({ exists: Boolean(data) }, { headers: limited.headers });
}
