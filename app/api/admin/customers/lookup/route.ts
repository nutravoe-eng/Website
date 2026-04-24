import { NextRequest, NextResponse } from 'next/server';
import { verifyAdmin } from '@/lib/admin-auth';
import { adminSupabase } from '@/lib/supabase/admin';

export async function GET(req: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type'); // 'email' | 'phone'
  const q = searchParams.get('q')?.trim() ?? '';

  if (!q || !['email', 'phone'].includes(type ?? '')) {
    return NextResponse.json({ error: 'type (email|phone) and q are required' }, { status: 400 });
  }

  if (type === 'email') {
    const normalised = q.toLowerCase();
    const { data, error } = await adminSupabase
      .from('users')
      .select('id, full_name, email, phone')
      .eq('email', normalised)
      .maybeSingle();

    if (error) return NextResponse.json({ error: 'Lookup failed' }, { status: 500 });
    return NextResponse.json({ user: data ?? null });
  }

  // phone
  const digits = q.replace(/\D/g, '').slice(-10);
  if (digits.length !== 10) {
    return NextResponse.json({ error: 'Valid 10-digit phone required' }, { status: 400 });
  }

  const { data, error } = await adminSupabase
    .from('users')
    .select('id, full_name, email, phone')
    .eq('phone', digits)
    .maybeSingle();

  if (error) return NextResponse.json({ error: 'Lookup failed' }, { status: 500 });
  return NextResponse.json({ user: data ?? null });
}
