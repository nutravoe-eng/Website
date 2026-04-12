import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase } from '@/lib/supabase/admin';
import { enforceRateLimit } from '@/lib/rate-limit';

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'auth-check-phone', 5, 60);
  if (!limited.ok) return limited.response;

  const { phone } = await req.json();
  const digits = typeof phone === 'string' ? phone.replace(/\D/g, '') : '';
  // Take only last 10 digits — strips country codes like +91/91 prefix silently.
  // This matches what's stored in the DB (always 10-digit canonical form).
  const normalised = digits.slice(-10);

  if (normalised.length !== 10) {
    return NextResponse.json({ error: 'Valid 10-digit phone required' }, { status: 400, headers: limited.headers });
  }

  const { data, error } = await adminSupabase
    .from('users')
    .select('id, email')
    .eq('phone', normalised)
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: 'Unable to check phone' }, { status: 500, headers: limited.headers });
  }

  if (!data) {
    return NextResponse.json({ exists: false }, { headers: limited.headers });
  }

  return NextResponse.json({ exists: true, email: data.email }, { headers: limited.headers });
}
