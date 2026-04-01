import { NextResponse } from 'next/server';
import { adminSupabase } from '@/lib/supabase/admin';

export async function POST(request: Request) {
  try {
    const { name, email, phone, pincode } = await request.json();

    if (!pincode) {
      return NextResponse.json({ error: 'pincode is required' }, { status: 400 });
    }

    const { error } = await adminSupabase
      .from('area_interest')
      .insert({ name: name || null, email: email || null, phone: phone || null, pincode });

    if (error) {
      console.error('area_interest insert error:', error);
      return NextResponse.json({ error: 'Failed to save' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('area_interest route error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
